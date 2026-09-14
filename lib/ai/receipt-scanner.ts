import { GoogleGenAI, ThinkingLevel } from "@google/genai";

import {
  normalizeReceiptScan,
  receiptScanJsonSchema,
  receiptScanSchema
} from "@/lib/ai/receipt-schema";

export const RECEIPT_MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";
const GEMINI_FALLBACK_MODELS = ["gemini-3.5-flash-lite", "gemini-3.8-flash"];
const MAX_GEMINI_ATTEMPTS = 2;
const GEMINI_RETRY_DELAYS_MS = [1000];
const MAX_OUTPUT_TOKENS = 256;

export type ReceiptImagePayload = {
  data: string;
  mimeType: string;
  byteLength: number;
};

export class ReceiptScannerError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ReceiptScannerError";
    this.status = status;
    this.details = details;
  }
}

const extractionPrompt = [
  "คุณเป็นผู้เชี่ยวชาญการอ่านใบเสร็จและเอกสารภาษีของประเทศไทย",
  "อ่านภาพนี้และตอบเป็น JSON เท่านั้นตาม schema ที่กำหนด ห้ามใส่ markdown หรือคำอธิบายเพิ่มเติม",
  "",
  "กติกา:",
  "- อ่านชื่อร้าน เลขประจำตัวผู้เสียภาษี วันที่ ยอดรวม และ VAT จากภาพเท่านั้น ห้ามเดาข้อมูลที่อ่านไม่ได้",
  "- แปลงวันที่ พ.ศ. เป็น ค.ศ. และคืนวันที่เป็น YYYY-MM-DD",
  "- tax_id ต้องเป็นตัวเลข 13 หลักติดกัน หากไม่พบให้คืนสตริงว่าง",
  "- is_tax_invoice เป็น true เฉพาะใบกำกับภาษีเต็มรูปที่มีข้อมูลผู้ซื้อ/ผู้ขายและ VAT ตามเอกสารภาษีไทย",
  "- ใบเสร็จรับเงิน/ใบกำกับภาษีอย่างย่อ/ใบเสร็จร้านค้าทั่วไปให้เป็น false",
  "- total_amount และ vat_amount เป็นจำนวนเงินบาท ไม่ใส่เครื่องหมายสกุลเงิน และใช้ 0 เมื่อไม่พบ",
  "- ถ้ามีข้อมูลไม่ชัด ให้บันทึกไว้ใน memo และใช้ค่าว่างหรือ 0 แทนการเดา",
  "- suggested_category ต้องเลือกหมวดที่เหมาะสมที่สุดจาก enum ใน schema"
].join("\n");

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
  const fence = String.fromCharCode(96).repeat(3);
  return value
    .trim()
    .replace(new RegExp("^" + fence + "(?:json)?\\s*", "i"), "")
    .replace(new RegExp("\\s*" + fence + "$", "i"), "")
    .trim();
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

async function generateReceiptContentForModel(
  ai: GoogleGenAI,
  image: ReceiptImagePayload,
  model: string
) {
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

async function generateReceiptContent(ai: GoogleGenAI, image: ReceiptImagePayload) {
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
      if (!isRetryableGeminiError(error)) {
        throw error;
      }
    }
  }

  throw lastError ?? new Error("Gemini request failed.");
}

export async function scanReceiptImage(
  image: ReceiptImagePayload
): Promise<{
  data: ReturnType<typeof normalizeReceiptScan>;
  model: string;
  imageBytes: number;
  durationMs: number;
}> {
  const startedAt = Date.now();
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new ReceiptScannerError("Gemini is not configured on the server.", 503);
  }

  const ai = new GoogleGenAI({ apiKey });
  const { response, model } = await generateReceiptContent(ai, image);
  const responseText = response.text;

  if (!responseText) {
    throw new ReceiptScannerError("Gemini returned an empty response.", 502);
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(cleanJsonText(responseText));
  } catch {
    throw new ReceiptScannerError("Gemini returned invalid JSON.", 502);
  }

  const parsed = receiptScanSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new ReceiptScannerError(
      "Gemini returned JSON that does not match the receipt schema.",
      502,
      parsed.error.flatten()
    );
  }

  return {
    data: normalizeReceiptScan(parsed.data),
    model,
    imageBytes: image.byteLength,
    durationMs: Date.now() - startedAt
  };
}
