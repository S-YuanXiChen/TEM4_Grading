import type { OcrProvider, OcrResult } from "./types";

const sanitizeOcrText = (text: string): string =>
  text.replace(/\r\n/g, "\n").replace(/\u00A0/g, " ").trim();

interface TesseractWordCandidate {
  text?: string;
  confidence?: number;
}

interface PageWithWordCandidates {
  text?: string;
  words?: TesseractWordCandidate[];
}

export const tesseractOcrProvider: OcrProvider = {
  async recognize(file: File): Promise<OcrResult> {
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng");

    try {
      const { data } = await worker.recognize(file);
      const page = data as PageWithWordCandidates;
      const rawText = page.text ?? "";
      const sanitizedText = sanitizeOcrText(rawText);
      const wordConfidences = Array.isArray(page.words)
        ? page.words
            .map((word) => ({
              raw: typeof word.text === "string" ? word.text : "",
              confidence:
                typeof word.confidence === "number" && Number.isFinite(word.confidence)
                  ? word.confidence
                  : null,
            }))
            .filter((word) => word.raw.trim().length > 0)
        : [];

      return {
        rawText,
        text: sanitizedText,
        source: "tesseract",
        note: "图片转文字已完成，请先人工核对文本再批改。",
        wordConfidences,
      };
    } finally {
      await worker.terminate();
    }
  },
};
