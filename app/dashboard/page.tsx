import { redirect } from "next/navigation";

import { LogoutButton } from "@/components/auth/logout-button";
import { LineConnectButton } from "@/components/auth/line-connect-button";
import { MonthlySummary } from "@/components/dashboard/monthly-summary";
import { ReceiptUpload } from "@/components/receipts/receipt-upload";
import { ReceiptHistory } from "@/components/receipts/receipt-history";
import type { ReceiptSummary } from "@/lib/receipts";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type MonthlyReceipt = {
  amount: number;
  category: string;
};

function getCurrentBangkokMonth() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit"
  })
    .format(new Date())
    .slice(0, 7);
}

function isValidMonth(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value));
}

function getNextMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0, 10);
}

export default async function DashboardPage({
  searchParams
}: {
  searchParams?: Promise<{ line?: string; line_error?: string; month?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const summaryMonth = isValidMonth(params.month) ? params.month : getCurrentBangkokMonth();
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data: profile } = await supabase
    .from("users")
    .select("line_user_id")
    .eq("id", user.id)
    .maybeSingle();

  const lineMessage =
    params.line === "connected"
      ? { text: "เชื่อมต่อ LINE สำเร็จแล้ว", tone: "success" as const }
      : params.line_error === "not_configured"
        ? { text: "ระบบยังไม่ได้ตั้งค่า LINE Login บนเซิร์ฟเวอร์", tone: "error" as const }
        : params.line_error === "invalid_state"
          ? { text: "คำขอเชื่อมต่อหมดอายุ กรุณาลองใหม่อีกครั้ง", tone: "error" as const }
          : params.line_error === "already_linked"
            ? { text: "LINE บัญชีนี้ถูกเชื่อมกับบัญชีเว็บอื่นแล้ว", tone: "error" as const }
            : params.line_error === "oauth_failed"
              ? { text: "เชื่อมต่อ LINE ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง", tone: "error" as const }
              : null;

  const [monthlyResult, historyResult] = await Promise.all([
    supabase
      .from("receipts")
      .select("amount, category")
      .eq("user_id", user.id)
      .gte("date", summaryMonth + "-01")
      .lt("date", getNextMonth(summaryMonth))
      .returns<MonthlyReceipt[]>(),
    supabase
      .from("receipts")
      .select("id, vendor_name, date, amount, category, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(20)
      .returns<ReceiptSummary[]>()
  ]);
  const { data: monthlyReceipts, error: monthlyError } = monthlyResult;
  const { data: receipts, error } = historyResult;

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-5 py-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-primary">Thai household finance</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-2 text-sm text-muted-foreground">เข้าสู่ระบบด้วย {user.email}</p>
        </div>
        <LogoutButton />
      </div>

      <LineConnectButton connected={Boolean(profile?.line_user_id)} message={lineMessage} />
      <MonthlySummary
        month={summaryMonth}
        receipts={monthlyReceipts ?? []}
        hasError={Boolean(monthlyError)}
      />
      <ReceiptUpload />
      <ReceiptHistory receipts={receipts ?? []} hasError={Boolean(error)} />
    </main>
  );
}
