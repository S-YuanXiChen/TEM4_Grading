import { analyzeSuspiciousOcrIssues } from "./assistance";
import {
  googleVisionClientOcrProvider,
  referenceQwenClientOcrProvider,
} from "./google-vision-client-provider";
import { localBrowserOcrProvider } from "./local-browser-provider";
import { applyLowRiskOcrCleanup } from "./post-process";
import type { OcrMode, OcrProvider, OcrResult, OcrTarget } from "./types";

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

const getProvider = (target: OcrTarget, mode: OcrMode): OcrProvider => {
  if (target === "student") {
    return googleVisionClientOcrProvider;
  }

  if (mode === "qwen") {
    return referenceQwenClientOcrProvider;
  }

  return localBrowserOcrProvider;
};

export const recognizeImageText = async (
  file: File,
  target: OcrTarget,
  mode: OcrMode = "default",
): Promise<OcrResult> => {
  const provider = getProvider(target, mode);
  const result = await provider.recognize(file);
  return applyPostProcessing(result);
};

export { analyzeSuspiciousOcrIssues };
export type { OcrMode, OcrResult, OcrSuggestion, OcrTarget, OcrWordConfidence } from "./types";
