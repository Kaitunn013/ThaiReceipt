import { NextResponse } from "next/server";

import { receiptCategoryOptions } from "@/lib/receipts";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function getCurrentBangkokMonth() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit"
  })
    .format(new Date())
    .slice(0, 7);
}

function isValidMonth(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    month?: unknown;
    category?: unknown;
    limit?: unknown;
  } | null;
  const month = body?.month;
  const category = body?.category;
  const limit = body?.limit === null ? null : Number(body?.limit);
  const validCategory =
    typeof category === "string" &&
    receiptCategoryOptions.some((option) => option.value === category);

  if (
    !isValidMonth(month) ||
    month > getCurrentBangkokMonth() ||
    !validCategory ||
    (limit !== null && (!Number.isFinite(limit) || limit <= 0 || limit > 100000000))
  ) {
    return NextResponse.json({ error: "ข้อมูลวงเงินไม่ถูกต้อง" }, { status: 400 });
  }

  const monthDate = month + "-01";
  const result =
    limit === null
      ? await supabase
          .from("category_budgets")
          .delete()
          .eq("user_id", user.id)
          .eq("month", monthDate)
          .eq("category", category)
      : await supabase.from("category_budgets").upsert(
          {
            user_id: user.id,
            month: monthDate,
            category,
            amount: limit
          },
          { onConflict: "user_id,month,category" }
        );

  if (result.error) {
    return NextResponse.json({ error: "บันทึกวงเงินไม่สำเร็จ" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    budget: limit === null ? null : { category, amount: limit }
  });
}
