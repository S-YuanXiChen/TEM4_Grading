import type { OcrProvider, OcrResult } from "./types";

interface MockOptions {
  reason?: string;
}

export const mockOcrProvider = (options: MockOptions = {}): OcrProvider => ({
  async recognize(file: File): Promise<OcrResult> {
    const lines = [
      "（图片转文字占位结果）",
      `已读取图片：${file.name}`,
      "请在此手动粘贴或修正英语文本，再进行批改。",
    ];

    if (options.reason) {
      lines.push(`回退原因：${options.reason}`);
    }

    return {
      rawText: lines.join("\n"),
      text: lines.join("\n"),
      source: "mock",
      note: "当前使用占位结果，请手动核对文本。",
    };
  },
});
