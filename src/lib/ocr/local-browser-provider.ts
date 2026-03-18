import { mockOcrProvider } from "./mock-provider";
import { tesseractOcrProvider } from "./tesseract-provider";
import type { OcrProvider, OcrResult } from "./types";

export const localBrowserOcrProvider: OcrProvider = {
  async recognize(file: File): Promise<OcrResult> {
    try {
      const result = await tesseractOcrProvider.recognize(file);
      if (!result.text.trim()) {
        return mockOcrProvider({ reason: "OCR返回为空" }).recognize(file);
      }

      return {
        ...result,
        note: "当前使用本地 OCR 识别参考答案，请继续人工核对文本。",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "无法加载OCR引擎";
      return mockOcrProvider({ reason: message }).recognize(file);
    }
  },
};
