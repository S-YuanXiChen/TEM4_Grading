import { alignTokens } from "@/lib/grading/alignment";
import { selectEffectiveReferenceStart } from "@/lib/grading/anchor";
import { compactWord } from "@/lib/grading/normalization";
import { tokenizeText } from "@/lib/grading/tokenize";
import type { Token } from "@/lib/grading/types";

import type { OcrSuggestion, OcrWordConfidence } from "./types";

interface AnalyzeOcrSuggestionsInput {
  text: string;
  referenceText?: string;
  wordConfidences?: OcrWordConfidence[];
}

const MAX_SUGGESTIONS = 8;
const LOW_CONFIDENCE_THRESHOLD = 55;
const ABNORMAL_FRAGMENT_REGEX = /[^A-Za-z0-9\s.,;:?!'"()\-]+/g;

const buildSuggestionId = (prefix: string, start: number, end: number): string =>
  `${prefix}-${start}-${end}`;

const editDistance = (left: string, right: string): number => {
  if (left === right) {
    return 0;
  }
  if (!left) {
    return right.length;
  }
  if (!right) {
    return left.length;
  }

  const rows = left.length + 1;
  const cols = right.length + 1;
  const dp: number[][] = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (_, col) => (row === 0 ? col : col === 0 ? row : 0)),
  );

  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      const cost = left[row - 1] === right[col - 1] ? 0 : 1;
      dp[row][col] = Math.min(
        dp[row - 1][col] + 1,
        dp[row][col - 1] + 1,
        dp[row - 1][col - 1] + cost,
      );
    }
  }

  return dp[left.length][right.length];
};

const addSuggestion = (
  suggestions: OcrSuggestion[],
  next: OcrSuggestion,
): void => {
  const exists = suggestions.some(
    (entry) =>
      entry.start === next.start &&
      entry.end === next.end &&
      entry.suggestedText === next.suggestedText,
  );

  if (!exists && suggestions.length < MAX_SUGGESTIONS) {
    suggestions.push(next);
  }
};

const analyzeAbnormalFragments = (text: string): OcrSuggestion[] => {
  const suggestions: OcrSuggestion[] = [];
  const matches = Array.from(text.matchAll(ABNORMAL_FRAGMENT_REGEX));

  matches.forEach((match, index) => {
    const sourceText = match[0];
    const start = match.index ?? 0;
    const end = start + sourceText.length;

    addSuggestion(suggestions, {
      id: buildSuggestionId(`abnormal-${index}`, start, end),
      kind: "abnormal_symbol",
      start,
      end,
      sourceText,
      reason: "包含非常见符号，可能是 OCR 噪声，请人工核对。",
    });
  });

  return suggestions;
};

const analyzeLowConfidenceWords = (
  text: string,
  wordConfidences: OcrWordConfidence[] | undefined,
): OcrSuggestion[] => {
  if (!wordConfidences || wordConfidences.length === 0) {
    return [];
  }

  const suggestions: OcrSuggestion[] = [];
  const wordTokens = tokenizeText(text).filter((token) => token.kind === "word");

  wordTokens.forEach((token, index) => {
    const confidence = wordConfidences[index]?.confidence;
    if (confidence === null || confidence === undefined || confidence >= LOW_CONFIDENCE_THRESHOLD) {
      return;
    }

    addSuggestion(suggestions, {
      id: buildSuggestionId(`confidence-${index}`, token.start, token.end),
      kind: "low_confidence",
      start: token.start,
      end: token.end,
      sourceText: token.raw,
      reason: `该词 OCR 置信度较低（${Math.round(confidence)}），请人工核对。`,
    });
  });

  return suggestions;
};

const isNearReferenceMismatch = (reference: Token, student: Token): boolean => {
  const left = compactWord(reference.normalized);
  const right = compactWord(student.normalized);

  if (!left || !right || left === right) {
    return false;
  }

  const maxDistance = Math.max(left.length, right.length) >= 7 ? 2 : 1;
  return editDistance(left, right) <= maxDistance;
};

const analyzeReferenceAwareSuggestions = (
  text: string,
  referenceText: string,
): OcrSuggestion[] => {
  if (!referenceText.trim() || !text.trim()) {
    return [];
  }

  const suggestions: OcrSuggestion[] = [];
  const anchor = selectEffectiveReferenceStart(referenceText, text);
  const anchoredReference = anchor.effectiveReferenceStartText.trim();
  if (!anchoredReference) {
    return suggestions;
  }

  const referenceTokens = tokenizeText(anchoredReference);
  const studentTokens = tokenizeText(text);
  const operations = alignTokens(referenceTokens, studentTokens);

  for (let index = 0; index < operations.length; index += 1) {
    const operation = operations[index];

    if (
      operation.type === "substitution" &&
      operation.refIndex !== undefined &&
      operation.studentIndex !== undefined
    ) {
      const reference = referenceTokens[operation.refIndex];
      const student = studentTokens[operation.studentIndex];

      if (reference.kind !== "word" || student.kind !== "word") {
        continue;
      }

      if (isNearReferenceMismatch(reference, student)) {
        addSuggestion(suggestions, {
          id: buildSuggestionId("near-reference", student.start, student.end),
          kind: "near_reference",
          start: student.start,
          end: student.end,
          sourceText: student.raw,
          suggestedText: reference.raw,
          reason: `与参考答案对应位置的 ${reference.raw} 仅有少量字符差异，可能是识别偏差。`,
        });
      }

      const mergedReferenceIndexes = [operation.refIndex];
      let mergedCursor = index + 1;
      while (mergedCursor < operations.length) {
        const next = operations[mergedCursor];
        if (
          next.type !== "deletion" ||
          next.refIndex === undefined ||
          referenceTokens[next.refIndex]?.kind !== "word"
        ) {
          break;
        }
        mergedReferenceIndexes.push(next.refIndex);
        mergedCursor += 1;
      }

      if (mergedReferenceIndexes.length > 1) {
        const mergedReference = mergedReferenceIndexes
          .map((refIndex) => referenceTokens[refIndex].raw)
          .join(" ");
        const compactMergedReference = mergedReferenceIndexes
          .map((refIndex) => compactWord(referenceTokens[refIndex].normalized))
          .join("");
        const compactStudent = compactWord(student.normalized);

        if (compactMergedReference && compactMergedReference === compactStudent) {
          addSuggestion(suggestions, {
            id: buildSuggestionId("merged-token", student.start, student.end),
            kind: "merged_token",
            start: student.start,
            end: student.end,
            sourceText: student.raw,
            suggestedText: mergedReference,
            reason: "该词看起来像多个参考词被连在一起，可能是 OCR 连写。",
          });
        }
      }
    }

    if (
      operation.type === "substitution" &&
      operation.refIndex !== undefined &&
      operation.studentIndex !== undefined
    ) {
      const reference = referenceTokens[operation.refIndex];
      const student = studentTokens[operation.studentIndex];

      if (reference.kind !== "word" || student.kind !== "word") {
        continue;
      }

      const splitStudentIndexes = [operation.studentIndex];
      let splitCursor = index + 1;
      while (splitCursor < operations.length) {
        const next = operations[splitCursor];
        if (
          next.type !== "insertion" ||
          next.studentIndex === undefined ||
          studentTokens[next.studentIndex]?.kind !== "word"
        ) {
          break;
        }
        splitStudentIndexes.push(next.studentIndex);
        splitCursor += 1;
      }

      if (splitStudentIndexes.length > 1) {
        const splitStudent = splitStudentIndexes
          .map((studentIndex) => studentTokens[studentIndex].raw)
          .join(" ");
        const compactSplitStudent = splitStudentIndexes
          .map((studentIndex) => compactWord(studentTokens[studentIndex].normalized))
          .join("");
        const compactReference = compactWord(reference.normalized);

        if (compactReference && compactReference === compactSplitStudent) {
          const start = studentTokens[splitStudentIndexes[0]].start;
          const end = studentTokens[splitStudentIndexes[splitStudentIndexes.length - 1]].end;
          addSuggestion(suggestions, {
            id: buildSuggestionId("split-token", start, end),
            kind: "split_token",
            start,
            end,
            sourceText: splitStudent,
            suggestedText: reference.raw,
            reason: "该片段看起来像一个词被拆成了多个片段，可能是 OCR 断词。",
          });
        }
      }
    }
  }

  return suggestions;
};

export const analyzeSuspiciousOcrIssues = ({
  text,
  referenceText = "",
  wordConfidences,
}: AnalyzeOcrSuggestionsInput): OcrSuggestion[] => {
  const normalizedText = text.trim();
  if (!normalizedText) {
    return [];
  }

  const suggestions = [
    ...analyzeAbnormalFragments(normalizedText),
    ...analyzeLowConfidenceWords(normalizedText, wordConfidences),
    ...analyzeReferenceAwareSuggestions(normalizedText, referenceText),
  ];

  return suggestions.slice(0, MAX_SUGGESTIONS);
};
