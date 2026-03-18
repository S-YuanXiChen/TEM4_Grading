import { analyzeSuspiciousOcrIssues } from "./assistance";
import { googleVisionClientOcrProvider } from "./google-vision-client-provider";
import { localBrowserOcrProvider } from "./local-browser-provider";
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

const getProviderByTarget = (target: OcrTarget): OcrProvider =>
  target === "student" ? googleVisionClientOcrProvider : localBrowserOcrProvider;

export const recognizeImageText = async (
  file: File,
  target: OcrTarget,
): Promise<OcrResult> => {
  const provider = getProviderByTarget(target);
  const result = await provider.recognize(file);
  return applyPostProcessing(result);
};

export { analyzeSuspiciousOcrIssues };
export type { OcrResult, OcrSuggestion, OcrTarget, OcrWordConfidence } from "./types";
