export type TokenKind = "word" | "punct";

export interface Token {
  kind: TokenKind;
  raw: string;
  normalized: string;
  start: number;
  end: number;
}

export interface ContextToken {
  kind: TokenKind | "placeholder";
  raw: string;
  highlight: boolean;
}

export interface MeaningGroup {
  id: number;
  text: string;
  start: number;
  end: number;
  wordCount: number;
  fallbackUsed: boolean;
  boundaryMode: "strict_punctuation" | "soft_fallback";
}

export type AlignmentOpType = "match" | "substitution" | "deletion" | "insertion";

export interface AlignmentOperation {
  type: AlignmentOpType;
  refIndex?: number;
  studentIndex?: number;
}

export type ErrorType =
  | "spelling_or_word_form"
  | "omission"
  | "addition"
  | "missing_space"
  | "punctuation"
  | "displacement";

export interface GradingError {
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
  deductionApplied: number;
  discounted?: boolean;
}

export interface GroupScore {
  groupId: number;
  maxScore: number;
  deduction: number;
  score: number;
}

export interface GradingResult {
  meaningGroups: MeaningGroup[];
  groupScores: GroupScore[];
  totalDeduction: number;
  finalScore: number;
  errors: GradingError[];
  referenceBody: string;
  studentBody: string;
  effectiveReferenceStartText: string;
  effectiveReferenceStartTokenIndex: number;
  studentOpeningAnchorText: string;
  anchorMatchScore: number;
  segmentationUsedFallback: boolean;
  segmentationNote: string;
}
