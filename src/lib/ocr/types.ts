export type OcrTarget = "reference" | "student";

export type OcrSource = "tesseract" | "mock" | "google_vision";

export interface OcrWordConfidence {
  raw: string;
  confidence: number | null;
}

export type OcrSuggestionKind =
  | "abnormal_symbol"
  | "low_confidence"
  | "near_reference"
  | "merged_token"
  | "split_token";

export interface OcrSuggestion {
  id: string;
  kind: OcrSuggestionKind;
  start: number;
  end: number;
  sourceText: string;
  suggestedText?: string;
  reason: string;
}

export interface OcrResult {
  rawText: string;
  text: string;
  source: OcrSource;
  note?: string;
  statusLabel?: string;
  cleanupSummary?: string[];
  wordConfidences?: OcrWordConfidence[];
}

export interface OcrProvider {
  recognize(file: File): Promise<OcrResult>;
}
