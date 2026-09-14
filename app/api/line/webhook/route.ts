import { after, NextResponse } from "next/server";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import {
  RECEIPT_MAX_IMAGE_BYTES,
  scanReceiptImage,
  type ReceiptImagePayload
} from "@/lib/ai/receipt-scanner";
import {
  formatReceiptAmount,
  formatReceiptDate,
  getReceiptCategoryLabel
} from "@/lib/receipts";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

const SEEPLA_DASHBOARD_URL =
  (process.env.NEXT_PUBLIC_SITE_URL ?? "https://seepla.vercel.app") + "/dashboard";
const supportedImageMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

type LineEvent = {
  type: string;
  replyToken?: string;
  source?: {
    type?: string;
    userId?: string;
  };
  message?: {
    type?: string;
    id?: string;
  };
};

type LineImage = ReceiptImagePayload & {
  buffer: Buffer;
  extension: string;
};

function isLineEvent(value: unknown): value is LineEvent {
  return typeof value === "object" && value !== null && typeof (value as LineEvent).type === "string";
}

function isValidLineSignature(rawBody: string, signature: string, channelSecret: string) {
  const expected = createHmac("sha256", channelSecret).update(rawBody).digest("base64");
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);

  return (
    expectedBuffer.length === signatureBuffer.length &&
    timingSafeEqual(expectedBuffer, signatureBuffer)
  );
}

function getLineAccessToken() {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    throw new Error("LINE_CHANNEL_ACCESS_TOKEN is not configured.");
  }
  return token;
}

async function sendLineMessages(
  endpoint: "reply" | "push",
  token: string,
  payload: { replyToken?: string; to?: string; messages: Array<{ type: "text"; text: string }> }
) {
  const response = await fetch("https://api.line.me/v2/bot/message/" + endpoint, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error("LINE message API returned HTTP " + response.status + ".");
  }
}

async function safeReply(
  token: string,
  replyToken: string | undefined,
  text: string
) {
  if (!replyToken) return;

  try {
    await sendLineMessages("reply", token, { replyToken, messages: [{ type: "text", text }] });
  } catch (error) {
    console.error("LINE reply failed", error instanceof Error ? error.message : "unknown error");
  }
}

async function safePush(token: string, lineUserId: string, text: string) {
  try {
    await sendLineMessages("push", token, { to: lineUserId, messages: [{ type: "text", text }] });
  } catch (error) {
    console.error("LINE push failed", error instanceof Error ? error.message : "unknown error");
  }
}

async function downloadLineImage(token: string, messageId: string): Promise<LineImage> {
  const response = await fetch(
    "https://api-data.line.me/v2/bot/message/" + messageId + "/content",
    {
      headers: {
        Authorization: "Bearer " + token
      }
    }
  );

  if (!response.ok) {
    throw new Error("LINE content API returned HTTP " + response.status + ".");
  }

  const contentType = (response.headers.get("content-type") ?? "").split(";")[0].toLowerCase();
  if (!supportedImageMimeTypes.has(contentType)) {
    throw new Error("LINE returned an unsupported image type.");
  }

  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > RECEIPT_MAX_IMAGE_BYTES) {
    throw new Error("LINE image is larger than 10MB.");
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length || buffer.length > RECEIPT_MAX_IMAGE_BYTES) {
    throw new Error("LINE image is empty or larger than 10MB.");
  }

  const extension = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";

  return {
    buffer,
    data: buffer.toString("base64"),
    mimeType: contentType,
    byteLength: buffer.length,
    extension
  };
}

function formatSavedReceiptMessage(
  result: Awaited<ReturnType<typeof scanReceiptImage>>["data"],
  sourceLabel: string
) {
  return [
    "บันทึกใบเสร็จแล้ว",
    sourceLabel,
    "ร้านค้า: " + (result.vendor_name || "ไม่ระบุ"),
    "ยอดรวม: " + formatReceiptAmount(result.total_amount),
    "วันที่: " + formatReceiptDate(result.date),
    "หมวดหมู่: " + getReceiptCategoryLabel(result.suggested_category),
    "",
    "ดูรายละเอียดหรือแก้ไขได้ที่ " + SEEPLA_DASHBOARD_URL
  ].join("\n");
}

async function processLineImage(
  token: string,
  lineUserId: string,
  userId: string,
  messageId: string,
  supabase: ReturnType<typeof createSupabaseAdminClient>
) {
  let imagePath: string | null = null;

  try {
    const image = await downloadLineImage(token, messageId);
    const scanResult = await scanReceiptImage(image);
    const receiptId = randomUUID();
    imagePath = userId + "/" + receiptId + "." + image.extension;

    const { error: uploadError } = await supabase.storage
      .from("receipt-images")
      .upload(imagePath, image.buffer, {
        cacheControl: "3600",
        contentType: image.mimeType,
        upsert: false
      });

    if (uploadError) {
      throw uploadError;
    }

    const result = scanResult.data;
    const { error: receiptError } = await supabase.from("receipts").insert({
      id: receiptId,
      user_id: userId,
      household_id: null,
      image_url: imagePath,
      vendor_name: result.vendor_name.trim() || null,
      tax_id: result.tax_id?.trim() || null,
      date: result.date?.trim() || null,
      amount: result.total_amount,
      vat_amount: result.vat_amount,
      is_tax_invoice: result.is_tax_invoice,
      memo: result.memo.trim() || null,
      category: result.suggested_category,
      is_shared_expense: false,
      raw_ai_json: null
    });

    if (receiptError) {
      throw receiptError;
    }

    await safePush(
      token,
      lineUserId,
      formatSavedReceiptMessage(result, "เพิ่มจาก LINE")
    );
  } catch (error) {
    if (imagePath) {
      await supabase.storage.from("receipt-images").remove([imagePath]).catch(() => undefined);
    }

    console.error(
      "LINE receipt processing failed",
      error instanceof Error ? error.message : "unknown error"
    );
    await safePush(
      token,
      lineUserId,
      "อ่านใบเสร็จไม่สำเร็จในตอนนี้ กรุณาลองส่งรูปใหม่อีกครั้ง"
    );
  }
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-line-signature");
  const channelSecret = process.env.LINE_CHANNEL_SECRET;

  if (!signature || !channelSecret) {
    return NextResponse.json({ error: "LINE webhook is not configured." }, { status: 503 });
  }

  if (!isValidLineSignature(rawBody, signature, channelSecret)) {
    return NextResponse.json({ error: "Invalid LINE signature." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const events = Array.isArray((body as { events?: unknown })?.events)
    ? (body as { events: unknown[] }).events.filter(isLineEvent)
    : [];

  let token: string;
  try {
    token = getLineAccessToken();
  } catch {
    return NextResponse.json({ error: "LINE webhook is not configured." }, { status: 503 });
  }

  let supabase: ReturnType<typeof createSupabaseAdminClient>;
  try {
    supabase = createSupabaseAdminClient();
  } catch {
    return NextResponse.json({ error: "Supabase admin is not configured." }, { status: 503 });
  }

  for (const event of events) {
    const lineUserId = event.source?.userId;
    if (!lineUserId || event.source?.type !== "user") {
      continue;
    }

    if (event.type === "message" && event.message?.type === "text") {
      await safeReply(
        token,
        event.replyToken,
        "ส่งรูปใบเสร็จมาได้เลย ระบบจะอ่านและบันทึกให้อัตโนมัติ\nดูรายการทั้งหมดได้ที่ " +
          SEEPLA_DASHBOARD_URL
      );
      continue;
    }

    if (event.type !== "message" || event.message?.type !== "image" || !event.message.id) {
      continue;
    }

    const { data: profile, error: profileError } = await supabase
      .from("users")
      .select("id")
      .eq("line_user_id", lineUserId)
      .maybeSingle<{ id: string }>();

    if (profileError) {
      console.error("LINE user lookup failed", profileError.message);
      await safeReply(token, event.replyToken, "ระบบเชื่อมต่อฐานข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      continue;
    }

    if (!profile) {
      await safeReply(
        token,
        event.replyToken,
        "กรุณาเชื่อมต่อ LINE กับบัญชี Seepla ก่อนใช้งาน\n" + SEEPLA_DASHBOARD_URL
      );
      continue;
    }

    await safeReply(token, event.replyToken, "ได้รับรูปแล้ว กำลังอ่านและบันทึกให้ครับ");
    const userId = profile.id;
    const messageId = event.message.id;
    after(() => processLineImage(token, lineUserId, userId, messageId, supabase));
  }

  return NextResponse.json({ ok: true });
}
