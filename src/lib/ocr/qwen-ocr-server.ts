import "server-only";

const QWEN_OCR_ENDPOINT =
  "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
const QWEN_OCR_MODEL = "qwen-vl-ocr-latest";
const OCR_PROMPT =
  "Please output only the text content from the image. No explanation. No markdown. No labels.";

interface QwenOcrResponse {
  error?: {
    message?: string;
  };
  choices?: Array<{
    message?: {
      content?:
        | string
        | Array<{
            text?: string;
          }>;
    };
  }>;
}

const extractQwenText = (payload: QwenOcrResponse | null): string => {
  const content = payload?.choices?.[0]?.message?.content;

  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => (typeof item?.text === "string" ? item.text : ""))
      .join("")
      .trim();
  }

  return "";
};

export const recognizeStudentImageWithQwenOcr = async (params: {
  base64Image: string;
  mimeType: string;
}): Promise<string> => {
  const apiKey = process.env.QWEN_OCR_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("未配置 QWEN_OCR_API_KEY。");
  }

  const response = await fetch(QWEN_OCR_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: QWEN_OCR_MODEL,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:${params.mimeType};base64,${params.base64Image}`,
              },
            },
            {
              type: "text",
              text: OCR_PROMPT,
            },
          ],
        },
      ],
    }),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as QwenOcrResponse | null;
  if (!response.ok) {
    const message = payload?.error?.message || "Qwen OCR 请求失败。";
    throw new Error(message);
  }

  if (payload?.error?.message) {
    throw new Error(payload.error.message);
  }

  return extractQwenText(payload);
};
