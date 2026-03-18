import { NextResponse } from "next/server";

import { recognizeStudentImageWithGoogleVision } from "@/lib/ocr/google-vision-server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "未接收到学生作答图片。" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const base64Image = Buffer.from(arrayBuffer).toString("base64");
    const text = await recognizeStudentImageWithGoogleVision({
      base64Image,
    });

    return NextResponse.json({
      rawText: text,
      text,
      source: "google_vision",
      note: "当前使用高精度 OCR 识别学生作答，请继续人工核对文本。",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "学生作答高精度 OCR 失败。";
    return NextResponse.json(
      {
        error: `学生作答高精度 OCR 失败：${message}`,
      },
      { status: 500 },
    );
  }
}
