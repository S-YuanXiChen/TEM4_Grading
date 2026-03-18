import "server-only";

import { GoogleAuth } from "google-auth-library";

const VISION_SCOPE = ["https://www.googleapis.com/auth/cloud-platform"];
const VISION_ENDPOINT = "https://vision.googleapis.com/v1/images:annotate";

interface VisionApiResponse {
  responses?: Array<{
    error?: {
      message?: string;
    };
    fullTextAnnotation?: {
      text?: string;
    };
    textAnnotations?: Array<{
      description?: string;
    }>;
  }>;
}

const getGoogleAuth = (): GoogleAuth => {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  const credentialsJson = process.env.GOOGLE_CLOUD_CREDENTIALS_JSON;

  if (credentialsJson) {
    let credentials: Record<string, unknown>;

    try {
      credentials = JSON.parse(credentialsJson) as Record<string, unknown>;
    } catch {
      throw new Error("GOOGLE_CLOUD_CREDENTIALS_JSON 不是有效的 JSON。");
    }

    return new GoogleAuth({
      projectId,
      credentials,
      scopes: VISION_SCOPE,
    });
  }

  return new GoogleAuth({
    projectId,
    scopes: VISION_SCOPE,
  });
};

const getAccessToken = async (): Promise<string> => {
  const auth = getGoogleAuth();
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  const token = typeof tokenResponse === "string" ? tokenResponse : tokenResponse?.token;

  if (!token) {
    throw new Error("未能获取 Google Cloud 访问令牌，请检查服务账号配置。");
  }

  return token;
};

export const recognizeStudentImageWithGoogleVision = async (params: {
  base64Image: string;
}): Promise<string> => {
  const accessToken = await getAccessToken();
  const response = await fetch(VISION_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      requests: [
        {
          image: {
            content: params.base64Image,
          },
          features: [
            {
              type: "DOCUMENT_TEXT_DETECTION",
            },
          ],
          imageContext: {
            languageHints: ["en"],
          },
        },
      ],
    }),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as VisionApiResponse | null;
  if (!response.ok) {
    const message = payload?.responses?.[0]?.error?.message || "Google Vision OCR 请求失败。";
    throw new Error(message);
  }

  const firstResponse = payload?.responses?.[0];
  if (firstResponse?.error?.message) {
    throw new Error(firstResponse.error.message);
  }

  return (
    firstResponse?.fullTextAnnotation?.text ||
    firstResponse?.textAnnotations?.[0]?.description ||
    ""
  );
};
