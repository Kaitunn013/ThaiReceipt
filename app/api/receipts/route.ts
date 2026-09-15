import { NextResponse } from "next/server";

import { type ReceiptSummary } from "@/lib/receipts";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const requestedLimit = Number(new URL(request.url).searchParams.get("limit") ?? 20);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.floor(requestedLimit), 1), 50)
    : 20;
  const { data, error } = await supabase
    .from("receipts")
    .select("id, vendor_name, date, amount, category, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit)
    .returns<ReceiptSummary[]>();

  if (error) {
    return NextResponse.json({ error: "Unable to load receipts right now." }, { status: 500 });
  }

  return NextResponse.json(
    { receipts: data ?? [] },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } }
  );
}
