import { analyzeSuspiciousOcrIssues } from "./assistance";
import {
  googleVisionClientOcrProvider,
  referenceQwenClientOcrProvider,
} from "./google-vision-client-provider";
import { applyLowRiskOcrCleanup } from "./post-process";
import type { OcrProvider, OcrResult, OcrTarget } from "./types";

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

const getProvider = (target: OcrTarget): OcrProvider => {
  if (target === "student") {
    return googleVisionClientOcrProvider;
  }

  return referenceQwenClientOcrProvider;
};

export const recognizeImageText = async (
  file: File,
  target: OcrTarget,
): Promise<OcrResult> => {
  const provider = getProvider(target);
  const result = await provider.recognize(file);
  return applyPostProcessing(result);
};

export { analyzeSuspiciousOcrIssues };
export type { OcrResult, OcrSuggestion, OcrTarget, OcrWordConfidence } from "./types";
