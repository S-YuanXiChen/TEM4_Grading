import { tokenizeText } from "@/lib/grading/tokenize";

import { googleVisionClientOcrProvider } from "./google-vision-client-provider";
import { localBrowserOcrProvider } from "./local-browser-provider";
import type { OcrProvider, OcrResult } from "./types";

interface StudentOcrRoutingDecision {
  mode: "local" | "google";
  statusLabel: string;
  reason: string;
}

const HIGH_CONFIDENCE_THRESHOLD = 85;
const PRINTED_AVG_CONFIDENCE = 82;
const PRINTED_HIGH_CONFIDENCE_RATIO = 0.6;
const PRINTED_MIN_WORDS = 6;
const PRINTED_CLEAN_WORD_RATIO = 0.85;
const PRINTED_SHORT_WORD_RATIO = 0.35;

const isCleanWord = (raw: string): boolean => /^[A-Za-z]+(?:[-'][A-Za-z]+)*$/.test(raw);

const classifyStudentProbeResult = (probe: OcrResult): StudentOcrRoutingDecision => {
  if (!probe.text.trim() || probe.source === "mock") {
    return {
      mode: "google",
      statusLabel: "高精度识别（本地探测失败）",
      reason: "本地探测结果为空或不稳定，按保守策略升级到高精度 OCR。",
    };
  }

  const wordTokens = tokenizeText(probe.text).filter((token) => token.kind === "word");
  if (wordTokens.length < PRINTED_MIN_WORDS) {
    return {
      mode: "google",
      statusLabel: "高精度识别（字词过少）",
      reason: "本地探测得到的有效词数偏少，无法稳定判定为印刷体。",
    };
  }

  const cleanWords = wordTokens.filter((token) => isCleanWord(token.raw));
  const shortWords = wordTokens.filter((token) => token.raw.length <= 1);
  const cleanWordRatio = cleanWords.length / wordTokens.length;
  const shortWordRatio = shortWords.length / wordTokens.length;

  const confidenceValues = (probe.wordConfidences ?? [])
    .map((word) => word.confidence)
    .filter((confidence): confidence is number => typeof confidence === "number");

  if (confidenceValues.length === 0) {
    return {
      mode: "google",
      statusLabel: "高精度识别（置信度不足）",
      reason: "本地探测缺少足够的置信度信息，按保守策略升级到高精度 OCR。",
    };
  }

  const averageConfidence =
    confidenceValues.reduce((sum, confidence) => sum + confidence, 0) / confidenceValues.length;
  const highConfidenceRatio =
    confidenceValues.filter((confidence) => confidence >= HIGH_CONFIDENCE_THRESHOLD).length /
    confidenceValues.length;

  const looksPrinted =
    averageConfidence >= PRINTED_AVG_CONFIDENCE &&
    highConfidenceRatio >= PRINTED_HIGH_CONFIDENCE_RATIO &&
    cleanWordRatio >= PRINTED_CLEAN_WORD_RATIO &&
    shortWordRatio <= PRINTED_SHORT_WORD_RATIO;

  if (looksPrinted) {
    return {
      mode: "local",
      statusLabel: "本地识别（判定为印刷体）",
      reason: `本地探测平均置信度 ${averageConfidence.toFixed(0)}，词形规整度较高，判定为印刷体。`,
    };
  }

  return {
    mode: "google",
    statusLabel: "高精度识别（判定为非印刷体）",
    reason: `本地探测平均置信度 ${averageConfidence.toFixed(0)}、规整度不足，按保守策略升级到高精度 OCR。`,
  };
};

export const studentHybridOcrProvider: OcrProvider = {
  async recognize(file: File): Promise<OcrResult> {
    const probe = await localBrowserOcrProvider.recognize(file);
    const decision = classifyStudentProbeResult(probe);

    if (decision.mode === "local") {
      return {
        ...probe,
        note: `${decision.reason} 当前使用本地 OCR 识别学生作答，请继续人工核对文本。`,
        statusLabel: decision.statusLabel,
      };
    }

    try {
      const googleResult = await googleVisionClientOcrProvider.recognize(file);
      return {
        ...googleResult,
        note: `${decision.reason} 当前使用高精度 OCR 识别学生作答，请继续人工核对文本。`,
        statusLabel: decision.statusLabel,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "学生作答高精度 OCR 失败";
      throw new Error(`${decision.statusLabel}：${message}`);
    }
  },
};

export { classifyStudentProbeResult };
