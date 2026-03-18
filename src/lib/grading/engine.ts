import { alignTokens } from "./alignment";
import { selectEffectiveReferenceStart } from "./anchor";
import {
  ERROR_DEDUCTION,
  GROUP_COUNT,
  GROUP_MAX_DEDUCTION,
  GROUP_SCORE,
  SENTENCE_END_PUNCTUATION,
  TOTAL_SCORE,
} from "./constants";
import { buildMeaningGroups } from "./grouping";
import {
  compactWord,
  isSameWordIgnoringCase,
  normalizeRawText,
  startsWithUppercase,
} from "./normalization";
import { tokenizeText } from "./tokenize";
import type {
  AlignmentOperation,
  ContextToken,
  ErrorType,
  GradingError,
  GradingResult,
  MeaningGroup,
  Token,
} from "./types";

interface InternalError {
  id: string;
  groupId: number;
  referenceSnippet: string;
  studentSnippet: string;
  referenceContextTokens: ContextToken[];
  studentContextTokens: ContextToken[];
  errorType: ErrorType;
  mistakeDescription: string;
  ruleKey: string;
  ruleExplanation: string;
  errorCount: number;
  deductionBeforeCap: number;
  discounted?: boolean;
}

interface ClassificationContext {
  operations: AlignmentOperation[];
  referenceTokens: Token[];
  studentTokens: Token[];
  groups: MeaningGroup[];
}

interface MissingSpaceMatch {
  consumedUntil: number;
  referenceIndexes: number[];
  studentIndex: number;
}

const CONTEXT_WORD_RADIUS = 2;

const ERROR_RULES: Record<ErrorType, { key: string; explanation: string }> = {
  spelling_or_word_form: {
    key: "规则1",
    explanation: "该位置应为原文单词，出现拼写或词形不一致，按1处计错。",
  },
  omission: {
    key: "规则2",
    explanation: "原文该处有必写单位，作答缺失，按遗漏单位数计错。",
  },
  addition: {
    key: "规则3",
    explanation: "该处出现原文不存在的额外词，按新增出现次数计错。",
  },
  missing_space: {
    key: "规则4",
    explanation: "应有空格被连写，按缺失空格数量计错。",
  },
  punctuation: {
    key: "规则5",
    explanation: "标点缺失、误用或句间标点引发的句首大小写问题，按标点相关错误计错。",
  },
  displacement: {
    key: "规则6",
    explanation: "同一结构内发生明显语序位移，按1处位移计错。",
  },
};

const quote = (text: string): string => `\`${text}\``;

const normalizeTokenIndexes = (tokens: Token[], indexes: number[]): number[] =>
  Array.from(
    new Set(
      indexes.filter(
        (index) => Number.isInteger(index) && index >= 0 && index < tokens.length,
      ),
    ),
  ).sort((left, right) => left - right);

const buildContextTokens = (tokens: Token[], centerIndexes: number[]): ContextToken[] => {
  const centers = normalizeTokenIndexes(tokens, centerIndexes);
  if (centers.length === 0) {
    return [];
  }

  let start = centers[0];
  let leftWords = CONTEXT_WORD_RADIUS;
  for (let index = centers[0] - 1; index >= 0; index -= 1) {
    start = index;
    if (tokens[index].kind === "word") {
      leftWords -= 1;
      if (leftWords === 0) {
        break;
      }
    }
  }

  let end = centers[centers.length - 1];
  let rightWords = CONTEXT_WORD_RADIUS;
  for (let index = centers[centers.length - 1] + 1; index < tokens.length; index += 1) {
    end = index;
    if (tokens[index].kind === "word") {
      rightWords -= 1;
      if (rightWords === 0) {
        break;
      }
    }
  }

  const centerSet = new Set(centers);
  const output: ContextToken[] = [];
  for (let index = start; index <= end; index += 1) {
    output.push({
      kind: tokens[index].kind,
      raw: tokens[index].raw,
      highlight: centerSet.has(index),
    });
  }

  return output;
};

const contextTokensToPlainText = (tokens: ContextToken[]): string => {
  if (tokens.length === 0) {
    return "（无）";
  }

  let output = "";
  tokens.forEach((token, index) => {
    const withSpace = index > 0 && token.kind !== "punct";
    output += `${withSpace ? " " : ""}${token.raw}`;
  });
  return output;
};

const clearHighlights = (tokens: ContextToken[]): ContextToken[] =>
  tokens.map((token) => ({ ...token, highlight: false }));

const findNearestTokenIndex = (
  operations: AlignmentOperation[],
  operationIndex: number,
  side: "reference" | "student",
): number | undefined => {
  const tokenKey = side === "reference" ? "refIndex" : "studentIndex";
  const maxDistance = Math.max(operationIndex, operations.length - operationIndex - 1);

  for (let distance = 1; distance <= maxDistance; distance += 1) {
    const left = operations[operationIndex - distance];
    if (left && left[tokenKey] !== undefined) {
      return left[tokenKey];
    }

    const right = operations[operationIndex + distance];
    if (right && right[tokenKey] !== undefined) {
      return right[tokenKey];
    }
  }

  return undefined;
};

const createError = (
  errorType: ErrorType,
  payload: {
    idSeed: string;
    groupId: number;
    referenceContextTokens: ContextToken[];
    studentContextTokens: ContextToken[];
    mistakeDescription: string;
    errorCount?: number;
    deduction?: number;
    discounted?: boolean;
    extraExplanation?: string;
  },
): InternalError => {
  const baseRule = ERROR_RULES[errorType];
  const errorCount = payload.errorCount ?? 1;
  const deductionBeforeCap = payload.deduction ?? errorCount * ERROR_DEDUCTION;
  const extra = payload.extraExplanation ? ` ${payload.extraExplanation}` : "";

  return {
    id: payload.idSeed,
    groupId: payload.groupId,
    referenceSnippet: contextTokensToPlainText(payload.referenceContextTokens),
    studentSnippet: contextTokensToPlainText(payload.studentContextTokens),
    referenceContextTokens: payload.referenceContextTokens,
    studentContextTokens: payload.studentContextTokens,
    errorType,
    mistakeDescription: payload.mistakeDescription,
    ruleKey: baseRule.key,
    ruleExplanation: `${baseRule.explanation}${extra}`.trim(),
    errorCount,
    deductionBeforeCap,
    discounted: payload.discounted,
  };
};

const mapReferenceTokenToGroup = (
  referenceTokens: Token[],
  groups: MeaningGroup[],
): number[] => {
  const mapping: number[] = [];
  let groupCursor = 0;

  referenceTokens.forEach((token, tokenIndex) => {
    while (
      groupCursor < groups.length - 1 &&
      token.start >= groups[groupCursor].end
    ) {
      groupCursor += 1;
    }

    mapping[tokenIndex] = groups[groupCursor].id;
  });

  return mapping;
};

const detectMissingSpacePattern = (
  index: number,
  operations: AlignmentOperation[],
  referenceTokens: Token[],
  studentTokens: Token[],
): MissingSpaceMatch | null => {
  const operation = operations[index];
  if (
    operation.type !== "substitution" ||
    operation.refIndex === undefined ||
    operation.studentIndex === undefined
  ) {
    return null;
  }

  const firstReference = referenceTokens[operation.refIndex];
  const studentToken = studentTokens[operation.studentIndex];

  if (firstReference.kind !== "word" || studentToken.kind !== "word") {
    return null;
  }

  const referenceIndexes = [operation.refIndex];
  let cursor = index + 1;

  while (cursor < operations.length) {
    const nextOperation = operations[cursor];
    if (
      nextOperation.type !== "deletion" ||
      nextOperation.refIndex === undefined ||
      referenceTokens[nextOperation.refIndex].kind !== "word"
    ) {
      break;
    }
    referenceIndexes.push(nextOperation.refIndex);
    cursor += 1;
  }

  if (referenceIndexes.length < 2) {
    return null;
  }

  const compactReference = referenceIndexes
    .map((tokenIndex) => compactWord(referenceTokens[tokenIndex].normalized))
    .join("");
  const compactStudent = compactWord(studentToken.normalized);

  if (!compactReference || compactStudent !== compactReference) {
    return null;
  }

  return {
    consumedUntil: cursor - 1,
    referenceIndexes,
    studentIndex: operation.studentIndex,
  };
};

const areWordSequencesReordered = (
  referenceWords: string[],
  studentWords: string[],
): boolean => {
  if (referenceWords.length !== studentWords.length || referenceWords.length < 3) {
    return false;
  }

  const sameOrder = referenceWords.every((word, index) => word === studentWords[index]);
  if (sameOrder) {
    return false;
  }

  const countTokens = (tokens: string[]): Record<string, number> =>
    tokens.reduce<Record<string, number>>((acc, token) => {
      acc[token] = (acc[token] ?? 0) + 1;
      return acc;
    }, {});

  const referenceBag = countTokens(referenceWords);
  const studentBag = countTokens(studentWords);
  const keys = new Set([...Object.keys(referenceBag), ...Object.keys(studentBag)]);

  for (const key of keys) {
    if ((referenceBag[key] ?? 0) !== (studentBag[key] ?? 0)) {
      return false;
    }
  }

  return true;
};

const applyDisplacementHeuristic = (
  errors: InternalError[],
  operations: AlignmentOperation[],
  referenceTokens: Token[],
  studentTokens: Token[],
  referenceGroupMap: number[],
  groups: MeaningGroup[],
): InternalError[] => {
  let output = [...errors];

  for (const group of groups) {
    const referenceWords = referenceTokens
      .filter((token, index) => token.kind === "word" && referenceGroupMap[index] === group.id)
      .map((token) => token.normalized);

    const studentWords: string[] = [];
    let cursorGroup = 1;

    operations.forEach((operation) => {
      if (operation.refIndex !== undefined) {
        cursorGroup = referenceGroupMap[operation.refIndex] ?? cursorGroup;
      }
      const groupId =
        operation.refIndex !== undefined
          ? referenceGroupMap[operation.refIndex]
          : cursorGroup;

      if (
        groupId === group.id &&
        operation.studentIndex !== undefined &&
        studentTokens[operation.studentIndex].kind === "word"
      ) {
        studentWords.push(studentTokens[operation.studentIndex].normalized);
      }
    });

    if (!areWordSequencesReordered(referenceWords, studentWords)) {
      continue;
    }

    const removableTypes: ErrorType[] = ["spelling_or_word_form", "omission", "addition"];
    const removable = output.filter(
      (error) => error.groupId === group.id && removableTypes.includes(error.errorType),
    );

    if (removable.length < 2) {
      continue;
    }

    const retained = output.filter(
      (error) =>
        !(
          error.groupId === group.id &&
          removableTypes.includes(error.errorType)
        ),
    );

    const referenceContextTokens: ContextToken[] = [
      { kind: "placeholder", raw: group.text, highlight: true },
    ];
    const studentContextTokens: ContextToken[] = [
      { kind: "placeholder", raw: studentWords.join(" "), highlight: true },
    ];

    retained.push(
      createError("displacement", {
        idSeed: `G${group.id}-DISP`,
        groupId: group.id,
        referenceContextTokens,
        studentContextTokens,
        mistakeDescription: `语序发生调整，写成了 ${quote(studentWords.join(" "))}`,
        extraExplanation: "该意群词汇集合一致但顺序明显重排，按位移1处处理。",
      }),
    );

    output = retained.sort(
      (left, right) => left.groupId - right.groupId || left.id.localeCompare(right.id),
    );
  }

  return output;
};

const classifyErrors = ({
  operations,
  referenceTokens,
  studentTokens,
  groups,
}: ClassificationContext): InternalError[] => {
  const errors: InternalError[] = [];
  const repeatedSpellingSeen = new Set<string>();
  const referenceGroupMap = mapReferenceTokenToGroup(referenceTokens, groups);

  const referencedIndexes = operations
    .map((operation, index) => (operation.refIndex !== undefined ? index : -1))
    .filter((index) => index >= 0);
  const firstReferencedIndex = referencedIndexes.length > 0 ? referencedIndexes[0] : -1;
  const lastReferencedIndex =
    referencedIndexes.length > 0
      ? referencedIndexes[referencedIndexes.length - 1]
      : -1;

  let cursorGroup = 1;
  let pendingSentenceBoundaryCheck: { groupId: number } | null = null;

  for (let index = 0; index < operations.length; index += 1) {
    const operation = operations[index];
    if (operation.refIndex !== undefined) {
      cursorGroup = referenceGroupMap[operation.refIndex] ?? cursorGroup;
    }
    const groupId =
      operation.refIndex !== undefined ? referenceGroupMap[operation.refIndex] : cursorGroup;

    if (pendingSentenceBoundaryCheck) {
      if (
        operation.refIndex !== undefined &&
        operation.studentIndex !== undefined &&
        referenceTokens[operation.refIndex].kind === "word" &&
        studentTokens[operation.studentIndex].kind === "word"
      ) {
        const referenceWord = referenceTokens[operation.refIndex];
        const studentWord = studentTokens[operation.studentIndex];
        const hasCaseMismatch =
          startsWithUppercase(referenceWord.raw) && !startsWithUppercase(studentWord.raw);

        if (hasCaseMismatch) {
          const referenceContextTokens = buildContextTokens(referenceTokens, [operation.refIndex]);
          const studentContextTokens = buildContextTokens(studentTokens, [operation.studentIndex]);
          errors.push(
            createError("punctuation", {
              idSeed: `G${pendingSentenceBoundaryCheck.groupId}-PUNC-CAP-${index}`,
              groupId: pendingSentenceBoundaryCheck.groupId,
              referenceContextTokens,
              studentContextTokens,
              mistakeDescription: `把 ${quote(referenceWord.raw)} 写成了 ${quote(studentWord.raw)}`,
              extraExplanation: "句间标点错误导致下一句句首大小写不符合原文。",
            }),
          );
        }
        pendingSentenceBoundaryCheck = null;
      }
    }

    if (operation.type === "match") {
      continue;
    }

    const missingSpace = detectMissingSpacePattern(
      index,
      operations,
      referenceTokens,
      studentTokens,
    );
    if (missingSpace) {
      const referenceContextTokens = buildContextTokens(
        referenceTokens,
        missingSpace.referenceIndexes,
      );
      const studentContextTokens = buildContextTokens(studentTokens, [missingSpace.studentIndex]);
      const source = missingSpace.referenceIndexes
        .map((tokenIndex) => referenceTokens[tokenIndex].raw)
        .join(" ");
      const target = studentTokens[missingSpace.studentIndex].raw;

      errors.push(
        createError("missing_space", {
          idSeed: `G${groupId}-SPACE-${index}`,
          groupId,
          referenceContextTokens,
          studentContextTokens,
          mistakeDescription: `把 ${quote(source)} 连写成了 ${quote(target)}`,
          errorCount: missingSpace.referenceIndexes.length - 1,
        }),
      );
      index = missingSpace.consumedUntil;
      continue;
    }

    if (operation.type === "deletion" && operation.refIndex !== undefined) {
      const token = referenceTokens[operation.refIndex];
      const nearestStudent = findNearestTokenIndex(operations, index, "student");
      const referenceContextTokens = buildContextTokens(referenceTokens, [operation.refIndex]);
      const studentContextTokens =
        nearestStudent === undefined
          ? []
          : clearHighlights(buildContextTokens(studentTokens, [nearestStudent]));

      errors.push(
        createError(token.kind === "punct" ? "punctuation" : "omission", {
          idSeed: `G${groupId}-${token.kind === "punct" ? "PUNC-DEL" : "OMIT"}-${index}`,
          groupId,
          referenceContextTokens,
          studentContextTokens,
          mistakeDescription:
            token.kind === "punct"
              ? `漏写了标点 ${quote(token.raw)}`
              : `漏写了 ${quote(token.raw)}`,
        }),
      );
      continue;
    }

    if (operation.type === "insertion" && operation.studentIndex !== undefined) {
      const outsideReferenceWindow =
        firstReferencedIndex >= 0 &&
        lastReferencedIndex >= 0 &&
        (index < firstReferencedIndex || index > lastReferencedIndex);
      if (outsideReferenceWindow) {
        continue;
      }

      const token = studentTokens[operation.studentIndex];
      const nearestReference = findNearestTokenIndex(operations, index, "reference");
      const referenceContextTokens =
        nearestReference === undefined
          ? []
          : clearHighlights(buildContextTokens(referenceTokens, [nearestReference]));
      const studentContextTokens = buildContextTokens(studentTokens, [operation.studentIndex]);

      errors.push(
        createError(token.kind === "punct" ? "punctuation" : "addition", {
          idSeed: `G${groupId}-${token.kind === "punct" ? "PUNC-INS" : "ADD"}-${index}`,
          groupId,
          referenceContextTokens,
          studentContextTokens,
          mistakeDescription:
            token.kind === "punct"
              ? `多写了标点 ${quote(token.raw)}`
              : `多写了 ${quote(token.raw)}`,
        }),
      );
      continue;
    }

    if (
      operation.type === "substitution" &&
      operation.refIndex !== undefined &&
      operation.studentIndex !== undefined
    ) {
      const reference = referenceTokens[operation.refIndex];
      const student = studentTokens[operation.studentIndex];

      if (reference.kind === "punct" || student.kind === "punct") {
        const referenceContextTokens = buildContextTokens(referenceTokens, [operation.refIndex]);
        const studentContextTokens = buildContextTokens(studentTokens, [operation.studentIndex]);
        const punctuationDescription =
          reference.kind === "punct" && student.kind === "punct"
            ? `把标点 ${quote(reference.raw)} 写成了 ${quote(student.raw)}`
            : `把 ${quote(reference.raw)} 写成了 ${quote(student.raw)}`;

        errors.push(
          createError("punctuation", {
            idSeed: `G${groupId}-PUNC-SUB-${index}`,
            groupId,
            referenceContextTokens,
            studentContextTokens,
            mistakeDescription: punctuationDescription,
          }),
        );

        const sentenceBoundaryBroken =
          reference.kind === "punct" &&
          student.kind === "punct" &&
          SENTENCE_END_PUNCTUATION.has(reference.raw) &&
          !SENTENCE_END_PUNCTUATION.has(student.raw);
        if (sentenceBoundaryBroken) {
          pendingSentenceBoundaryCheck = { groupId };
        }
        continue;
      }

      const sameLetterDifferentCase =
        isSameWordIgnoringCase(reference.raw, student.raw) && reference.raw !== student.raw;
      if (sameLetterDifferentCase) {
        continue;
      }

      const repeatedKey = reference.normalized;
      const discounted = repeatedSpellingSeen.has(repeatedKey);
      if (!discounted) {
        repeatedSpellingSeen.add(repeatedKey);
      }

      const referenceContextTokens = buildContextTokens(referenceTokens, [operation.refIndex]);
      const studentContextTokens = buildContextTokens(studentTokens, [operation.studentIndex]);

      errors.push(
        createError("spelling_or_word_form", {
          idSeed: `G${groupId}-SPELL-${index}`,
          groupId,
          referenceContextTokens,
          studentContextTokens,
          mistakeDescription: `把 ${quote(reference.raw)} 写成了 ${quote(student.raw)}`,
          deduction: discounted ? 0 : ERROR_DEDUCTION,
          discounted,
          extraExplanation: discounted
            ? "同一原词重复拼写错误仅首处计错，本处记录但不扣分（规则7）。"
            : undefined,
        }),
      );
    }
  }

  return applyDisplacementHeuristic(
    errors,
    operations,
    referenceTokens,
    studentTokens,
    referenceGroupMap,
    groups,
  );
};

const applyGroupCaps = (errors: InternalError[]): GradingError[] => {
  const grouped = new Map<number, InternalError[]>();
  errors.forEach((error) => {
    if (!grouped.has(error.groupId)) {
      grouped.set(error.groupId, []);
    }
    grouped.get(error.groupId)?.push(error);
  });

  const finalized: GradingError[] = [];

  for (let groupId = 1; groupId <= GROUP_COUNT; groupId += 1) {
    const rows = grouped.get(groupId) ?? [];
    let remaining = GROUP_MAX_DEDUCTION;

    rows.forEach((row) => {
      const applied = Math.max(0, Math.min(remaining, row.deductionBeforeCap));
      remaining -= applied;
      finalized.push({
        ...row,
        deductionApplied: Number(applied.toFixed(2)),
      });
    });
  }

  return finalized;
};

const buildGroupScores = (errors: GradingError[]) =>
  Array.from({ length: GROUP_COUNT }, (_, groupIndex) => {
    const groupId = groupIndex + 1;
    const deduction = errors
      .filter((error) => error.groupId === groupId)
      .reduce((sum, error) => sum + error.deductionApplied, 0);

    return {
      groupId,
      maxScore: GROUP_SCORE,
      deduction: Number(deduction.toFixed(2)),
      score: Number(Math.max(0, GROUP_SCORE - deduction).toFixed(2)),
    };
  });

export const gradeTem4Dictation = (
  referenceTextInput: string,
  studentTextInput: string,
): GradingResult => {
  const referenceNormalized = normalizeRawText(referenceTextInput);
  const studentNormalized = normalizeRawText(studentTextInput);

  if (!referenceNormalized) {
    throw new Error("参考答案文本为空，无法批改。");
  }
  if (!studentNormalized) {
    throw new Error("学生作答文本为空，无法批改。");
  }

  const anchor = selectEffectiveReferenceStart(referenceNormalized, studentNormalized);
  const referenceBody = anchor.effectiveReferenceStartText.trim();
  const studentBody = studentNormalized.trim();

  if (!referenceBody) {
    throw new Error("锚点定位后参考文本为空，无法批改。");
  }
  if (!studentBody) {
    throw new Error("学生作答文本为空，无法批改。");
  }

  const grouping = buildMeaningGroups(referenceBody);
  const meaningGroups = grouping.groups;
  const referenceTokens = tokenizeText(referenceBody);
  const studentTokens = tokenizeText(studentBody);
  const operations = alignTokens(referenceTokens, studentTokens);
  const internalErrors = classifyErrors({
    operations,
    referenceTokens,
    studentTokens,
    groups: meaningGroups,
  });
  const errors = applyGroupCaps(internalErrors);
  const groupScores = buildGroupScores(errors);

  const totalDeduction = Number(
    groupScores.reduce((sum, group) => sum + group.deduction, 0).toFixed(2),
  );
  const finalScore = Number(Math.max(0, TOTAL_SCORE - totalDeduction).toFixed(2));

  return {
    meaningGroups,
    groupScores,
    totalDeduction,
    finalScore,
    errors,
    referenceBody,
    studentBody,
    effectiveReferenceStartText: anchor.effectiveReferenceStartText,
    effectiveReferenceStartTokenIndex: anchor.effectiveReferenceStartTokenIndex,
    studentOpeningAnchorText: anchor.studentOpeningAnchorText,
    anchorMatchScore: anchor.anchorMatchScore,
    segmentationUsedFallback: grouping.usedFallback,
    segmentationNote: grouping.note,
  };
};
