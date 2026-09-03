import { NextResponse } from "next/server";
import { z } from "zod";

import { receiptCategories } from "@/lib/ai/receipt-schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const receiptUpdateSchema = z.object({
  vendor_name: z.string().trim().max(200),
  date: z.string().trim().regex(/^$|^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().finite().nonnegative(),
  vat_amount: z.number().finite().nonnegative(),
  tax_id: z.string().trim().regex(/^$|^\d{13}$/),
  category: z.enum(receiptCategories),
  is_tax_invoice: z.boolean(),
  memo: z.string().trim().max(1000)
}).strict();

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { id } = await params;
  if (!uuidPattern.test(id)) {
    return NextResponse.json({ error: "Receipt not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = receiptUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "ข้อมูลแก้ไขไม่ถูกต้อง" }, { status: 400 });
  }

  const { data: receipt, error: lookupError } = await supabase
    .from("receipts")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle<{ id: string }>();

  if (lookupError) {
    return NextResponse.json({ error: "Unable to update receipt right now." }, { status: 500 });
  }
  if (!receipt) {
    return NextResponse.json({ error: "Receipt not found." }, { status: 404 });
  }

  const { error: updateError } = await supabase
    .from("receipts")
    .update({
      vendor_name: parsed.data.vendor_name || null,
      date: parsed.data.date || null,
      amount: parsed.data.amount,
      vat_amount: parsed.data.vat_amount,
      tax_id: parsed.data.tax_id || null,
      category: parsed.data.category,
      is_tax_invoice: parsed.data.is_tax_invoice,
      memo: parsed.data.memo || null
    })
    .eq("id", id)
    .eq("user_id", user.id);

  if (updateError) {
    return NextResponse.json({ error: "Unable to update receipt right now." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { id } = await params;
  if (!uuidPattern.test(id)) {
    return NextResponse.json({ error: "Receipt not found." }, { status: 404 });
  }

  const { data: receipt, error: lookupError } = await supabase
    .from("receipts")
    .select("image_url")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle<{ image_url: string }>();

  if (lookupError) {
    return NextResponse.json({ error: "Unable to delete receipt right now." }, { status: 500 });
  }

  if (!receipt) {
    return NextResponse.json({ error: "Receipt not found." }, { status: 404 });
  }

  const { error: imageError } = await supabase.storage
    .from("receipt-images")
    .remove([receipt.image_url]);

  if (imageError) {
    return NextResponse.json({ error: "Unable to delete receipt image right now." }, { status: 500 });
  }

  const { error: deleteError } = await supabase
    .from("receipts")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (deleteError) {
    return NextResponse.json({ error: "Unable to delete receipt right now." }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
