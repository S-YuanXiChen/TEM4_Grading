import { NextResponse } from "next/server";

import { recognizeStudentImageWithQwenOcr } from "@/lib/ocr/qwen-ocr-server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "未接收到参考答案图片。" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const base64Image = Buffer.from(arrayBuffer).toString("base64");
    const text = await recognizeStudentImageWithQwenOcr({
      base64Image,
      mimeType: file.type || "image/jpeg",
    });

    return NextResponse.json({
      rawText: text,
      text,
      source: "google_vision",
      note: "当前使用高精度 OCR 识别参考答案，请继续人工核对文本。",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "参考答案高精度 OCR 失败。";
    return NextResponse.json(
      {
        error: `参考答案高精度 OCR 失败：${message}`,
      },
      { status: 500 },
    );
  }
}
