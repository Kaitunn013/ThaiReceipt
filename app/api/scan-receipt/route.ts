import { NextResponse } from "next/server";

import {
  RECEIPT_MAX_IMAGE_BYTES,
  ReceiptScannerError,
  scanReceiptImage,
  type ReceiptImagePayload
} from "@/lib/ai/receipt-scanner";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const supportedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function jsonError(message: string, status: number, details?: unknown) {
  return NextResponse.json({ error: message, ...(details ? { details } : {}) }, { status });
}

function parseBase64Image(value: unknown, mimeType: unknown): ReceiptImagePayload | null {
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
  if (!imageBuffer.length || imageBuffer.length > RECEIPT_MAX_IMAGE_BYTES) {
    return null;
  }

  return {
    data: imageBuffer.toString("base64"),
    mimeType: resolvedMimeType,
    byteLength: imageBuffer.length
  };
}

async function readImagePayload(request: Request): Promise<ReceiptImagePayload | null> {
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
    if (!imageBuffer.length || imageBuffer.length > RECEIPT_MAX_IMAGE_BYTES) {
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
        "Provide a JPEG, PNG, or WebP image as multipart field image or JSON imageBase64.",
        400
      );
    }

    const result = await scanReceiptImage(image);

    return NextResponse.json({
      data: result.data,
      meta: {
        model: result.model,
        image_bytes: result.imageBytes,
        duration_ms: Date.now() - startedAt
      }
    });
  } catch (error) {
    const status = error instanceof ReceiptScannerError ? error.status : getErrorStatus(error);
    console.error("receipt scan failed", { duration_ms: Date.now() - startedAt }, error);

    if (error instanceof ReceiptScannerError && error.status === 502) {
      return jsonError(error.message, 502, error.details);
    }

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

function getErrorStatus(error: unknown): number | null {
  if (typeof error !== "object" || error === null || !("status" in error)) {
    return null;
  }

  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : null;
}
