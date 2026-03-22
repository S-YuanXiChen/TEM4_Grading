import type { OcrProvider, OcrResult } from "./types";

const STUDENT_OCR_ROUTE = "/api/ocr/student";

export const googleVisionClientOcrProvider: OcrProvider = {
  async recognize(file: File): Promise<OcrResult> {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(STUDENT_OCR_ROUTE, {
      method: "POST",
      body: formData,
    });

    const payload = (await response.json().catch(() => null)) as
      | Partial<OcrResult> & { error?: string }
      | null;

    if (!response.ok) {
      throw new Error(payload?.error || "高精度 OCR 服务调用失败");
    }

    return {
      rawText: typeof payload?.rawText === "string" ? payload.rawText : "",
      text: typeof payload?.text === "string" ? payload.text : "",
      source: "google_vision",
      statusLabel: "高精度识别已完成",
      note:
        typeof payload?.note === "string"
          ? payload.note
          : "当前使用高精度 OCR 识别学生作答，请继续人工核对文本。",
    };
  },
};
