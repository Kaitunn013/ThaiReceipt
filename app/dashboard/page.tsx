import { redirect } from "next/navigation";

import { LineConnectButton } from "@/components/auth/line-connect-button";
import { CategoryBudgetHealth, MonthlySummary } from "@/components/dashboard/monthly-summary";
import { DashboardNav } from "@/components/navigation/dashboard-nav";
import { ReceiptUpload } from "@/components/receipts/receipt-upload";
import { ReceiptHistory } from "@/components/receipts/receipt-history";
import type { ReceiptSummary } from "@/lib/receipts";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type MonthlyReceipt = {
  amount: number;
  category: string;
};

type ReceiptDate = {
  date: string | null;
};

type CategoryBudget = {
  category: string;
  amount: number;
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

function getMonthOptions(currentMonth: string, dates: ReceiptDate[]) {
  const savedMonths = dates
    .map(({ date }) => date?.slice(0, 7))
    .filter((month): month is string => Boolean(month && isValidMonth(month) && month <= currentMonth))
    .sort();
  const firstMonth = savedMonths[0] ?? currentMonth;
  const months: string[] = [];

  for (let month = firstMonth; month <= currentMonth; month = getNextMonth(month).slice(0, 7)) {
    months.push(month);
  }

  return months.reverse();
}

export default async function DashboardPage({
  searchParams
}: {
  searchParams?: Promise<{
    line?: string;
    line_error?: string;
    month?: string;
  }>;
}) {
  const params = searchParams ? await searchParams : {};
  const currentMonth = getCurrentBangkokMonth();
  const requestedMonth = isValidMonth(params.month) ? params.month : currentMonth;
  const summaryMonth = requestedMonth > currentMonth ? currentMonth : requestedMonth;
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

  const [monthlyResult, historyResult, datesResult, budgetResult] = await Promise.all([
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
      .returns<ReceiptSummary[]>(),
    supabase
      .from("receipts")
      .select("date")
      .eq("user_id", user.id)
      .not("date", "is", null)
      .returns<ReceiptDate[]>(),
    supabase
      .from("category_budgets")
      .select("category, amount")
      .eq("user_id", user.id)
      .eq("month", summaryMonth + "-01")
      .returns<CategoryBudget[]>()
  ]);
  const { data: monthlyReceipts, error: monthlyError } = monthlyResult;
  const { data: receipts, error } = historyResult;
  const { data: budgets } = budgetResult;
  const monthOptions = getMonthOptions(currentMonth, datesResult.data ?? []);
  if (!monthOptions.includes(summaryMonth)) {
    monthOptions.push(summaryMonth);
    monthOptions.sort((a, b) => b.localeCompare(a));
  }

  return (
    <div className="min-h-screen">
      <DashboardNav userEmail={user.email ?? null} />
      <main id="home" className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">

        <div id="dashboard" className="scroll-mt-24 space-y-6">
          <LineConnectButton connected={Boolean(profile?.line_user_id)} message={lineMessage} />
          <MonthlySummary
            month={summaryMonth}
            receipts={monthlyReceipts ?? []}
            hasError={Boolean(monthlyError)}
            months={monthOptions}
            budgets={budgets ?? []}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
          <div id="history" className="scroll-mt-24">
            <ReceiptHistory receipts={receipts ?? []} hasError={Boolean(error)} />
          </div>
          <CategoryBudgetHealth receipts={monthlyReceipts ?? []} budgets={budgets ?? []} />
        </div>
        <div id="upload-receipt" className="scroll-mt-24">
          <ReceiptUpload compact />
        </div>
      </main>
    </div>
  );
}
