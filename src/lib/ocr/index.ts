import { analyzeSuspiciousOcrIssues } from "./assistance";
import { mockOcrProvider } from "./mock-provider";
import { applyLowRiskOcrCleanup } from "./post-process";
import { tesseractOcrProvider } from "./tesseract-provider";
import type { OcrResult } from "./types";

const applyPostProcessing = (result: OcrResult): OcrResult => ({
  ...result,
  ...(() => {
    const cleanup = applyLowRiskOcrCleanup(result.text);
    return {
      text: cleanup.text,
      cleanupSummary: cleanup.appliedSteps,
    };
  })(),
});

export const recognizeImageText = async (file: File): Promise<OcrResult> => {
  try {
    const result = await tesseractOcrProvider.recognize(file);
    if (!result.text.trim()) {
      const fallbackResult = await mockOcrProvider({ reason: "OCR返回为空" }).recognize(file);
      return applyPostProcessing(fallbackResult);
    }

    return applyPostProcessing(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "无法加载OCR引擎";
    const fallbackResult = await mockOcrProvider({ reason: message }).recognize(file);
    return applyPostProcessing(fallbackResult);
  }
};

export { analyzeSuspiciousOcrIssues };
export type { OcrResult, OcrSuggestion, OcrWordConfidence } from "./types";
