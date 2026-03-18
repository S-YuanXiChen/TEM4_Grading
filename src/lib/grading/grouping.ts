import { GROUP_COUNT } from "./constants";
import { tokenizeText } from "./tokenize";
import type { MeaningGroup, Token } from "./types";

interface CandidatePlan {
  internalCuts: number[];
  mode: "strict_punctuation" | "soft_fallback";
  note: string;
  usedFallback: boolean;
}

interface DpState {
  score: number;
  minCount: number;
  maxCount: number;
  prevCandidateIndex: number;
}

export interface GroupingResult {
  groups: MeaningGroup[];
  usedFallback: boolean;
  note: string;
}

const REQUIRED_CUTS = GROUP_COUNT - 1;

const countWordsInRange = (tokens: Token[], start: number, end: number): number =>
  tokens.filter(
    (token) => token.kind === "word" && token.start >= start && token.end <= end,
  ).length;

const getWordPrefixAtPositions = (tokens: Token[], positions: number[]): number[] => {
  const words = tokens.filter((token) => token.kind === "word");
  let cursor = 0;

  return positions.map((position) => {
    while (cursor < words.length && words[cursor].end <= position) {
      cursor += 1;
    }
    return cursor;
  });
};

const getPunctuationSplitCandidatesFromTokens = (tokens: Token[], textLength: number): number[] =>
  tokens
    .filter((token) => token.kind === "punct")
    .map((token) => token.end)
    .filter((position) => position > 0 && position < textLength);

const getPunctuationSplitCandidatesFromText = (text: string): number[] =>
  Array.from(text.matchAll(/[.,;:?!]/g))
    .map((match) => (match.index ?? 0) + 1)
    .filter((position) => position > 0 && position < text.length);

const getWordEndSplitCandidates = (tokens: Token[], textLength: number): number[] =>
  tokens
    .filter((token) => token.kind === "word")
    .map((token) => token.end)
    .filter((position) => position > 0 && position < textLength);

const uniqueSorted = (values: number[]): number[] =>
  Array.from(new Set(values)).sort((left, right) => left - right);

const buildSoftCharCandidates = (textLength: number): number[] => {
  if (textLength <= 1) {
    return [];
  }

  const points: number[] = [];
  for (let index = 1; index < textLength; index += 1) {
    points.push(index);
  }
  return points;
};

const selectCandidatePlan = (bodyText: string, tokens: Token[]): CandidatePlan => {
  const strictTokenCandidates = getPunctuationSplitCandidatesFromTokens(tokens, bodyText.length);
  const strictTextCandidates = getPunctuationSplitCandidatesFromText(bodyText);
  const strictCandidates = uniqueSorted([
    ...strictTokenCandidates,
    ...strictTextCandidates,
  ]);

  if (strictCandidates.length >= REQUIRED_CUTS) {
    return {
      internalCuts: strictCandidates,
      mode: "strict_punctuation",
      usedFallback: false,
      note: "使用 . ? ! , ; : 标点边界完成严格切分。",
    };
  }

  const softCandidates = uniqueSorted([
    ...strictCandidates,
    ...getWordEndSplitCandidates(tokens, bodyText.length),
    ...buildSoftCharCandidates(bodyText.length),
  ]);

  return {
    internalCuts: softCandidates,
    mode: "soft_fallback",
    usedFallback: true,
    note:
      "标点候选不足4个，已启用软回退：优先词边界并补充字符边界以确保切分为5个意群。",
  };
};

const compareStates = (candidate: DpState, current: DpState | undefined): boolean => {
  if (!current) {
    return true;
  }

  if (candidate.score !== current.score) {
    return candidate.score < current.score;
  }

  const candidateSpread = candidate.maxCount - candidate.minCount;
  const currentSpread = current.maxCount - current.minCount;
  return candidateSpread < currentSpread;
};

const optimizeCutPointsByWordBalance = (
  textLength: number,
  tokens: Token[],
  internalCandidates: number[],
): number[] => {
  const candidates = uniqueSorted([0, ...internalCandidates, textLength]);
  const endIndex = candidates.length - 1;
  const wordPrefix = getWordPrefixAtPositions(tokens, candidates);
  const totalWords = wordPrefix[endIndex] ?? 0;
  const targetPerGroup = totalWords / GROUP_COUNT;

  const dp: Array<Array<DpState | undefined>> = Array.from(
    { length: GROUP_COUNT + 1 },
    () => Array.from({ length: candidates.length }, () => undefined),
  );

  for (let j = 1; j <= endIndex; j += 1) {
    const count = (wordPrefix[j] ?? 0) - (wordPrefix[0] ?? 0);
    dp[1][j] = {
      score: (count - targetPerGroup) ** 2,
      minCount: count,
      maxCount: count,
      prevCandidateIndex: 0,
    };
  }

  for (let groupsBuilt = 2; groupsBuilt <= GROUP_COUNT; groupsBuilt += 1) {
    for (let j = groupsBuilt; j <= endIndex; j += 1) {
      let best: DpState | undefined;
      for (let prev = groupsBuilt - 1; prev < j; prev += 1) {
        const previousState = dp[groupsBuilt - 1][prev];
        if (!previousState) {
          continue;
        }

        const count = (wordPrefix[j] ?? 0) - (wordPrefix[prev] ?? 0);
        const nextState: DpState = {
          score: previousState.score + (count - targetPerGroup) ** 2,
          minCount: Math.min(previousState.minCount, count),
          maxCount: Math.max(previousState.maxCount, count),
          prevCandidateIndex: prev,
        };

        if (compareStates(nextState, best)) {
          best = nextState;
        }
      }
      dp[groupsBuilt][j] = best;
    }
  }

  if (!dp[GROUP_COUNT][endIndex]) {
    throw new Error("意群切分失败：无法生成5个分组。");
  }

  const cutIndices: number[] = [];
  let groupCursor = GROUP_COUNT;
  let candidateCursor = endIndex;

  while (groupCursor > 1) {
    const state = dp[groupCursor][candidateCursor];
    if (!state) {
      break;
    }
    cutIndices.push(state.prevCandidateIndex);
    candidateCursor = state.prevCandidateIndex;
    groupCursor -= 1;
  }

  const cutPositions = cutIndices
    .reverse()
    .map((candidateIndex) => candidates[candidateIndex])
    .filter((position) => position > 0 && position < textLength);

  // In rare short-text cases, DP may generate fewer unique cuts. Fill deterministically.
  if (cutPositions.length < REQUIRED_CUTS) {
    const existing = new Set(cutPositions);
    for (const position of internalCandidates) {
      if (!existing.has(position)) {
        cutPositions.push(position);
        existing.add(position);
      }
      if (cutPositions.length >= REQUIRED_CUTS) {
        break;
      }
    }
  }

  return uniqueSorted(cutPositions).slice(0, REQUIRED_CUTS);
};

export const buildMeaningGroups = (bodyText: string): GroupingResult => {
  const tokens = tokenizeText(bodyText);
  const plan = selectCandidatePlan(bodyText, tokens);
  const cutPoints = optimizeCutPointsByWordBalance(
    bodyText.length,
    tokens,
    plan.internalCuts,
  );
  const finalBoundaries = [...cutPoints, bodyText.length];
  const groups: MeaningGroup[] = [];

  let start = 0;
  finalBoundaries.forEach((end, index) => {
    groups.push({
      id: index + 1,
      text: bodyText.slice(start, end).trim(),
      start,
      end,
      wordCount: countWordsInRange(tokens, start, end),
      fallbackUsed: plan.usedFallback,
      boundaryMode: plan.mode,
    });
    start = end;
  });

  while (groups.length < GROUP_COUNT) {
    groups.push({
      id: groups.length + 1,
      text: "",
      start: bodyText.length,
      end: bodyText.length,
      wordCount: 0,
      fallbackUsed: true,
      boundaryMode: "soft_fallback",
    });
  }

  return {
    groups: groups.slice(0, GROUP_COUNT),
    usedFallback: plan.usedFallback,
    note: plan.note,
  };
};
