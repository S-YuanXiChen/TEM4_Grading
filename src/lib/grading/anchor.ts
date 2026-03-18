import { tokenizeText } from "./tokenize";
import type { Token } from "./types";

const OPENING_WINDOW_WORDS = 20;
const REFERENCE_WINDOW_EXTRA = 6;
const MIN_ANCHOR_COVERAGE = 0.2;

interface WordTokenRef {
  tokenIndex: number;
  token: Token;
}

interface CandidateScore {
  referenceWordStart: number;
  lcsLength: number;
  prefixMatches: number;
  coverage: number;
  score: number;
}

export interface AnchorSelection {
  effectiveReferenceStartText: string;
  effectiveReferenceStartTokenIndex: number;
  studentOpeningAnchorText: string;
  anchorMatchScore: number;
}

const toWordRefs = (tokens: Token[]): WordTokenRef[] =>
  tokens
    .map((token, tokenIndex) => ({ token, tokenIndex }))
    .filter((entry) => entry.token.kind === "word");

const buildOpeningAnchorText = (studentText: string, openingWords: WordTokenRef[]): string => {
  if (openingWords.length === 0) {
    return "";
  }

  const start = openingWords[0].token.start;
  const end = openingWords[openingWords.length - 1].token.end;
  return studentText.slice(start, end).trim();
};

const longestCommonSubsequenceLength = (left: string[], right: string[]): number => {
  if (left.length === 0 || right.length === 0) {
    return 0;
  }

  const dp: number[][] = Array.from({ length: left.length + 1 }, () =>
    Array.from({ length: right.length + 1 }, () => 0),
  );

  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      if (left[i - 1] === right[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  return dp[left.length][right.length];
};

const scoreAnchorCandidates = (
  referenceWords: WordTokenRef[],
  openingWords: WordTokenRef[],
): CandidateScore[] => {
  const openingNormalized = openingWords.map((entry) => entry.token.normalized);
  const candidates: CandidateScore[] = [];

  for (let start = 0; start < referenceWords.length; start += 1) {
    const referenceWindow = referenceWords
      .slice(start, start + openingWords.length + REFERENCE_WINDOW_EXTRA)
      .map((entry) => entry.token.normalized);
    const lcsLength = longestCommonSubsequenceLength(
      openingNormalized,
      referenceWindow,
    );
    const prefixCompareLength = Math.min(openingNormalized.length, referenceWindow.length);
    let prefixMatches = 0;

    for (let index = 0; index < prefixCompareLength; index += 1) {
      if (openingNormalized[index] === referenceWindow[index]) {
        prefixMatches += 1;
      }
    }

    const coverage = openingNormalized.length > 0 ? lcsLength / openingNormalized.length : 0;
    const score = lcsLength * 3 + prefixMatches;

    candidates.push({
      referenceWordStart: start,
      lcsLength,
      prefixMatches,
      coverage,
      score,
    });
  }

  return candidates;
};

const pickBestCandidate = (candidates: CandidateScore[]): CandidateScore | null => {
  if (candidates.length === 0) {
    return null;
  }

  return candidates.slice(1).reduce<CandidateScore>((best, current) => {
    if (current.score > best.score) {
      return current;
    }
    if (current.score < best.score) {
      return best;
    }

    if (current.coverage > best.coverage) {
      return current;
    }
    if (current.coverage < best.coverage) {
      return best;
    }

    // Tie-breaker: earliest strong match wins.
    return current.referenceWordStart < best.referenceWordStart ? current : best;
  }, candidates[0]);
};

export const selectEffectiveReferenceStart = (
  referenceText: string,
  studentText: string,
): AnchorSelection => {
  const referenceTokens = tokenizeText(referenceText);
  const studentTokens = tokenizeText(studentText);
  const referenceWords = toWordRefs(referenceTokens);
  const studentWords = toWordRefs(studentTokens);

  if (referenceWords.length === 0) {
    return {
      effectiveReferenceStartText: referenceText.trim(),
      effectiveReferenceStartTokenIndex: 0,
      studentOpeningAnchorText: "",
      anchorMatchScore: 0,
    };
  }

  const openingWords = studentWords.slice(0, OPENING_WINDOW_WORDS);
  const studentOpeningAnchorText = buildOpeningAnchorText(studentText, openingWords);

  if (openingWords.length === 0) {
    return {
      effectiveReferenceStartText: referenceText.trim(),
      effectiveReferenceStartTokenIndex: referenceWords[0].tokenIndex,
      studentOpeningAnchorText,
      anchorMatchScore: 0,
    };
  }

  const candidates = scoreAnchorCandidates(referenceWords, openingWords);
  const best = pickBestCandidate(candidates);

  if (!best || best.coverage < MIN_ANCHOR_COVERAGE) {
    const firstReferenceWord = referenceWords[0];
    return {
      effectiveReferenceStartText: referenceText.slice(firstReferenceWord.token.start).trimStart(),
      effectiveReferenceStartTokenIndex: firstReferenceWord.tokenIndex,
      studentOpeningAnchorText,
      anchorMatchScore: Number((best?.coverage ?? 0).toFixed(3)),
    };
  }

  const startWord = referenceWords[best.referenceWordStart];
  return {
    effectiveReferenceStartText: referenceText.slice(startWord.token.start).trimStart(),
    effectiveReferenceStartTokenIndex: startWord.tokenIndex,
    studentOpeningAnchorText,
    anchorMatchScore: Number(best.coverage.toFixed(3)),
  };
};
