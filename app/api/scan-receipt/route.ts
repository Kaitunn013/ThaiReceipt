import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  normalizeReceiptScan,
  receiptScanJsonSchema,
  receiptScanSchema
} from "@/lib/ai/receipt-schema";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const supportedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";
const GEMINI_FALLBACK_MODELS = ["gemini-3.5-flash-lite", "gemini-3.8-flash"];
const MAX_GEMINI_ATTEMPTS = 2;
const GEMINI_RETRY_DELAYS_MS = [1000];
const MAX_OUTPUT_TOKENS = 256;

const extractionPrompt = `
คุณเป็นผู้เชี่ยวชาญการอ่านใบเสร็จและเอกสารภาษีของประเทศไทย
อ่านภาพนี้และตอบเป็น JSON เท่านั้นตาม schema ที่กำหนด ห้ามใส่ markdown หรือคำอธิบายเพิ่มเติม

กติกา:
- อ่านชื่อร้าน เลขประจำตัวผู้เสียภาษี วันที่ ยอดรวม และ VAT จากภาพเท่านั้น ห้ามเดาข้อมูลที่อ่านไม่ได้
- แปลงวันที่ พ.ศ. เป็น ค.ศ. และคืนวันที่เป็น YYYY-MM-DD
- tax_id ต้องเป็นตัวเลข 13 หลักติดกัน หากไม่พบให้คืนสตริงว่าง
- is_tax_invoice เป็น true เฉพาะใบกำกับภาษีเต็มรูปที่มีข้อมูลผู้ซื้อ/ผู้ขายและ VAT ตามเอกสารภาษีไทย
- ใบเสร็จรับเงิน/ใบกำกับภาษีอย่างย่อ/ใบเสร็จร้านค้าทั่วไปให้เป็น false
- total_amount และ vat_amount เป็นจำนวนเงินบาท ไม่ใส่เครื่องหมายสกุลเงิน และใช้ 0 เมื่อไม่พบ
- ถ้ามีข้อมูลไม่ชัด ให้บันทึกไว้ใน memo และใช้ค่าว่างหรือ 0 แทนการเดา
- suggested_category ต้องเลือกหมวดที่เหมาะสมที่สุดจาก enum ใน schema
`;

type ImagePayload = {
  data: string;
  mimeType: string;
  byteLength: number;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function getErrorStatus(error: unknown): number | null {
  if (typeof error !== "object" || error === null || !("status" in error)) {
    return null;
  }

  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : null;
}

function isRetryableGeminiError(error: unknown) {
  return [429, 500, 503, 504].includes(getErrorStatus(error) ?? 0);
}

function cleanJsonText(value: string) {
  return value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function parseBase64Image(value: unknown, mimeType: unknown): ImagePayload | null {
  if (typeof value !== "string" || typeof mimeType !== "string") {
    return null;
  }

  const dataUrlMatch = value.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
  const resolvedMimeType = dataUrlMatch?.[1] ?? mimeType;
  const base64 = dataUrlMatch?.[2] ?? value;

  if (!supportedMimeTypes.has(resolvedMimeType)) {
    return null;
  }

  const imageBuffer = Buffer.from(base64, "base64");
  if (!imageBuffer.length || imageBuffer.length > MAX_IMAGE_BYTES) {
    return null;
  }

  return {
    data: imageBuffer.toString("base64"),
    mimeType: resolvedMimeType,
    byteLength: imageBuffer.length
  };
}

async function readImagePayload(request: Request): Promise<ImagePayload | null> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const image = formData.get("image");

    if (!image || typeof image === "string" || typeof image.arrayBuffer !== "function") {
      return null;
    }

    if (!supportedMimeTypes.has(image.type)) {
      return null;
    }

    const imageBuffer = Buffer.from(await image.arrayBuffer());
    if (!imageBuffer.length || imageBuffer.length > MAX_IMAGE_BYTES) {
      return null;
    }

    return {
      data: imageBuffer.toString("base64"),
      mimeType: image.type,
      byteLength: imageBuffer.length
    };
  }

  if (contentType.includes("application/json")) {
    const body = (await request.json()) as {
      imageBase64?: unknown;
      image?: unknown;
      mimeType?: unknown;
    };

    return parseBase64Image(body.imageBase64 ?? body.image, body.mimeType);
  }

  return null;
}

function getGeminiModel() {
  return process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL;
}

function getGeminiConfig(model: string) {
  return {
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    responseMimeType: "application/json",
    responseSchema: receiptScanJsonSchema,
    ...(model.startsWith("gemini-3.")
      ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
      : { temperature: 0 })
  };
}

async function generateReceiptContentForModel(ai: GoogleGenAI, image: ImagePayload, model: string) {
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_GEMINI_ATTEMPTS; attempt += 1) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [
              { text: extractionPrompt },
              {
                inlineData: {
                  mimeType: image.mimeType,
                  data: image.data
                }
              }
            ]
          }
        ],
        config: getGeminiConfig(model)
      });
      return response;
    } catch (error) {
      lastError = error;

      if (!isRetryableGeminiError(error) || attempt === MAX_GEMINI_ATTEMPTS - 1) {
        throw error;
      }

      if (getErrorStatus(error) === 503 && model !== GEMINI_FALLBACK_MODELS[0]) {
        throw error;
      }

      await new Promise((resolve) => {
        setTimeout(resolve, GEMINI_RETRY_DELAYS_MS[attempt]);
      });
    }
  }

  throw lastError ?? new Error("Gemini request failed.");
}

async function generateReceiptContent(ai: GoogleGenAI, image: ImagePayload) {
  const models = Array.from(new Set([getGeminiModel(), ...GEMINI_FALLBACK_MODELS]));
  let lastError: unknown;

  for (const model of models) {
    try {
      return {
        response: await generateReceiptContentForModel(ai, image, model),
        model
      };
    } catch (error) {
      lastError = error;
      if (!isRetryableGeminiError(error)) throw error;
    }
  }

  throw lastError ?? new Error("Gemini request failed.");
}

export async function POST(request: Request) {
  const startedAt = Date.now();

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return jsonError("Authentication required.", 401);
    }

    const image = await readImagePayload(request);
    if (!image) {
      return jsonError(
        "Provide a JPEG, PNG, or WebP image as multipart field `image` or JSON `imageBase64`.",
        400
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return jsonError("Gemini is not configured on the server.", 503);
    }

    const ai = new GoogleGenAI({ apiKey });
    const { response, model } = await generateReceiptContent(ai, image);

    const responseText = response.text;
    if (!responseText) {
      return jsonError("Gemini returned an empty response.", 502);
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(cleanJsonText(responseText));
    } catch {
      return jsonError("Gemini returned invalid JSON.", 502);
    }

    const parsed = receiptScanSchema.safeParse(parsedJson);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Gemini returned JSON that does not match the receipt schema.",
          details: parsed.error.flatten()
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      data: normalizeReceiptScan(parsed.data),
      meta: {
        model,
        image_bytes: image.byteLength,
        duration_ms: Date.now() - startedAt
      }
    });
  } catch (error) {
    const status = getErrorStatus(error);
    console.error("receipt scan failed", { duration_ms: Date.now() - startedAt }, error);

    if ([429, 500, 503, 504].includes(status ?? 0)) {
      return NextResponse.json(
        { error: "Gemini is temporarily busy. Please try again in a moment." },
        { status: 503, headers: { "Retry-After": "5" } }
      );
    }

    if (status === 401 || status === 403) {
      return jsonError("Gemini API key is invalid or not authorized.", 503);
    }

    return jsonError("Unable to scan receipt right now.", 500);
  }
}
