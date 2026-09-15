"use client";

import { useState, type FormEvent } from "react";

import { formatReceiptAmount, receiptCategoryOptions } from "@/lib/receipts";

type MonthlyReceipt = {
  amount: number;
  category: string;
};

type CategoryBudget = {
  category: string;
  amount: number;
};

type CategoryTotal = {
  value: string;
  label: string;
  amount: number;
  limit: number | null;
  percentage: number;
  progress: number;
  overLimit: boolean;
  color: string;
};

const chartColors = [
  "#2563eb",
  "#16a34a",
  "#ea580c",
  "#0891b2",
  "#dc2626",
  "#7c3aed",
  "#db2777",
  "#92400e",
  "#ca8a04",
  "#64748b"
];

function formatMonth(month: string) {
  return new Intl.DateTimeFormat("th-TH", {
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(month + "-01T00:00:00Z"));
}

function buildCategoryTotals(receipts: MonthlyReceipt[], budgets: CategoryBudget[]): CategoryTotal[] {
  const amounts = new Map<string, number>();
  const limits = new Map<string, number>();

  for (const receipt of receipts) {
    const amount = Number(receipt.amount);
    if (Number.isFinite(amount) && amount > 0) {
      amounts.set(receipt.category, (amounts.get(receipt.category) ?? 0) + amount);
    }
  }

  for (const budget of budgets) {
    const amount = Number(budget.amount);
    if (Number.isFinite(amount) && amount > 0) {
      limits.set(budget.category, amount);
    }
  }

  const total = Array.from(amounts.values()).reduce((sum, amount) => sum + amount, 0);

  return receiptCategoryOptions.map((option, index) => {
    const amount = amounts.get(option.value) ?? 0;
    const limit = limits.get(option.value) ?? null;
    const progress = limit ? Math.min((amount / limit) * 100, 100) : amount > 0 ? 100 : 0;
    return {
      value: option.value,
      label: option.label,
      amount,
      limit,
      percentage: total ? (amount / total) * 100 : 0,
      progress,
      overLimit: limit !== null && amount > limit,
      color: chartColors[index]
    };
  });
}

export function MonthlySummary({
  month,
  receipts,
  hasError,
  months,
  budgets
}: {
  month: string;
  receipts: MonthlyReceipt[];
  hasError: boolean;
  months: string[];
  budgets: CategoryBudget[];
}) {
  const [currentBudgets, setCurrentBudgets] = useState(budgets);
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [savingCategory, setSavingCategory] = useState<string | null>(null);
  const [budgetMessage, setBudgetMessage] = useState<string | null>(null);
  const [budgetError, setBudgetError] = useState(false);
  const categoryTotals = buildCategoryTotals(receipts, currentBudgets);
  const totalAmount = categoryTotals.reduce((sum, item) => sum + item.amount, 0);
  const largestCategory = categoryTotals
    .filter((item) => item.amount > 0)
    .reduce<CategoryTotal | null>(
      (largest, item) => (!largest || item.amount > largest.amount ? item : largest),
      null
    );

  async function handleBudgetSubmit(event: FormEvent<HTMLFormElement>, category: string) {
    event.preventDefault();
    const rawLimit = String(new FormData(event.currentTarget).get("limit") ?? "").trim();
    const limit = rawLimit ? Number(rawLimit) : null;

    if (limit !== null && (!Number.isFinite(limit) || limit <= 0 || limit > 100000000)) {
      setBudgetError(true);
      setBudgetMessage(null);
      return;
    }

    setSavingCategory(category);
    setBudgetError(false);
    setBudgetMessage(null);

    try {
      const response = await fetch("/api/category-budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, category, limit })
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(body?.error ?? "บันทึกวงเงินไม่สำเร็จ");
      }

      setCurrentBudgets((current) => {
        const withoutCurrent = current.filter((item) => item.category !== category);
        return limit === null ? withoutCurrent : [...withoutCurrent, { category, amount: limit }];
      });
      setBudgetMessage(category);
    } catch {
      setBudgetError(true);
    } finally {
      setSavingCategory(null);
    }
  }

  return (
    <section className="rounded-xl border bg-card p-5 shadow-sm" aria-labelledby="monthly-summary-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-primary">สรุปค่าใช้จ่าย</p>
          <h2 id="monthly-summary-title" className="mt-1 text-xl font-semibold">
            เดือน{formatMonth(month)}
          </h2>
        </div>
        <form action="/dashboard" method="get" className="flex items-end gap-2">
          <div>
            <label htmlFor="summary-month" className="text-sm font-medium">
              เลือกเดือน
            </label>
            <select
              id="summary-month"
              name="month"
              defaultValue={month}
              className="mt-1 h-11 min-w-0 rounded-lg border bg-card px-3 text-base"
            >
              {months.map((option) => (
                <option key={option} value={option}>
                  {formatMonth(option)}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="h-11 rounded-lg bg-primary px-4 font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            ดูสรุป
          </button>
        </form>
      </div>

      {hasError ? (
        <div className="mt-5 rounded-lg bg-red-50 p-4 text-sm text-red-700" role="alert">
          โหลดข้อมูลสรุปไม่สำเร็จ กรุณาลองใหม่อีกครั้ง
        </div>
      ) : (
        <>
          {budgetError ? (
            <div className="mt-5 rounded-lg bg-red-50 p-4 text-sm text-red-700" role="alert">
              บันทึกวงเงินไม่สำเร็จ กรุณาตรวจสอบตัวเลขและลองใหม่อีกครั้ง
            </div>
          ) : budgetMessage ? (
            <div className="mt-5 rounded-lg bg-green-50 p-4 text-sm text-green-700" role="status">
              บันทึกวงเงินหมวด{categoryTotals.find((item) => item.value === budgetMessage)?.label ?? ""} แล้ว
            </div>
          ) : null}

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <article className="rounded-lg bg-muted p-4">
              <p className="text-sm text-muted-foreground">ยอดรวม</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{formatReceiptAmount(totalAmount)}</p>
            </article>
            <article className="rounded-lg bg-muted p-4">
              <p className="text-sm text-muted-foreground">จำนวนรายการ</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{receipts.length} รายการ</p>
            </article>
            <article className="rounded-lg bg-muted p-4">
              <p className="text-sm text-muted-foreground">หมวดที่ใช้มากที่สุด</p>
              <p className="mt-1 break-words text-xl font-semibold">
                {largestCategory?.label ?? "ยังไม่มีรายการ"}
              </p>
            </article>
          </div>

          {receipts.length === 0 ? (
            <div className="mt-5 rounded-lg bg-muted p-4 text-center text-sm text-muted-foreground">
              ยังไม่มีรายการในเดือนนี้ แต่สามารถตั้งวงเงินล่วงหน้าได้จากการ์ดแต่ละหมวด
            </div>
          ) : null}

          <div className="mt-6">
            <h3 className="font-medium">ค่าใช้จ่ายและวงเงินรายหมวด</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              ตั้งวงเงินต่อเดือน แล้วระบบจะแจ้งเตือนเมื่อใช้เกินวงเงิน
            </p>
            <div className="mt-4 rounded-2xl border border-border/80 bg-muted/30 p-3 sm:p-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {categoryTotals.map((item) => {
                const ringColor = item.overLimit ? "#dc2626" : item.color;
                const ringBackground = item.limit
                  ? "conic-gradient(" +
                    ringColor +
                    " 0 " +
                    item.progress +
                    "%, hsl(var(--muted)) " +
                    item.progress +
                    "% 100%)"
                  : item.amount > 0
                    ? "conic-gradient(" + item.color + " 0 100%)"
                    : "hsl(var(--muted))";

                return (
                  <article
                    key={item.value}
                    className={
                      "rounded-xl p-1 " +
                      (item.overLimit ? "bg-red-50/70" : "bg-card/70")
                    }
                  >
                    <button
                      type="button"
                      aria-expanded={openCategory === item.value}
                      aria-label={
                        openCategory === item.value
                          ? "ซ่อนรายละเอียดหมวด" + item.label
                          : "ดูรายละเอียดและตั้งวงเงินหมวด" + item.label
                      }
                      onClick={() =>
                        setOpenCategory((current) => (current === item.value ? null : item.value))
                      }
                      className="group flex aspect-square w-full flex-col items-center justify-center rounded-xl p-2 text-center transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <div className="flex w-full items-start justify-between gap-1">
                        <h4 className="text-xs font-semibold leading-4">{item.label}</h4>
                        {item.overLimit ? (
                          <span className="shrink-0 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
                            เกิน
                          </span>
                        ) : null}
                      </div>
                      <div
                        className="mt-2 flex size-[72px] shrink-0 items-center justify-center rounded-full"
                        style={{ background: ringBackground }}
                        role="img"
                        aria-label={
                          item.limit
                            ? item.label +
                              " ใช้ " +
                              formatReceiptAmount(item.amount) +
                              " จากวงเงิน " +
                              formatReceiptAmount(item.limit)
                            : item.label + " ใช้ " + formatReceiptAmount(item.amount) + " ยังไม่ตั้งวงเงิน"
                        }
                      >
                        <div className="flex size-11 flex-col items-center justify-center rounded-full bg-card text-center shadow-sm">
                          <span className="text-[10px] text-muted-foreground">ใช้ไป</span>
                          <span className="mt-0.5 text-[10px] font-semibold tabular-nums">
                            {formatReceiptAmount(item.amount)}
                          </span>
                        </div>
                      </div>
                      <span className="mt-2 text-xs font-semibold tabular-nums">
                        {formatReceiptAmount(item.amount)}
                      </span>
                      <span className="mt-1 text-[11px] text-muted-foreground">
                        {openCategory === item.value ? "แตะเพื่อซ่อน" : "แตะเพื่อดู"}
                      </span>
                    </button>

                    {openCategory === item.value ? (
                      <div className="mt-2 border-t pt-3">
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="rounded-lg bg-muted p-2">
                            <p className="text-muted-foreground">สัดส่วน</p>
                            <p className="mt-1 font-semibold tabular-nums">{item.percentage.toFixed(1)}%</p>
                          </div>
                          <div className="rounded-lg bg-muted p-2">
                            <p className="text-muted-foreground">วงเงิน</p>
                            <p className="mt-1 font-semibold tabular-nums">
                              {item.limit ? formatReceiptAmount(item.limit) : "ยังไม่ตั้ง"}
                            </p>
                          </div>
                        </div>

                        {item.limit ? (
                          <div className="mt-3">
                            <div className="flex items-center justify-between gap-2 text-xs">
                              <span>ความคืบหน้าวงเงิน</span>
                              <span
                                className={
                                  item.overLimit ? "font-medium text-red-700" : "text-muted-foreground"
                                }
                              >
                                {item.overLimit
                                  ? "เกิน " + formatReceiptAmount(item.amount - item.limit)
                                  : item.progress.toFixed(0) + "%"}
                              </span>
                            </div>
                            <div
                              className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
                              role="progressbar"
                              aria-label={"ใช้วงเงินหมวด" + item.label}
                              aria-valuemin={0}
                              aria-valuemax={item.limit}
                              aria-valuenow={Math.min(item.amount, item.limit)}
                            >
                              <div
                                className="h-full rounded-full"
                                style={{ width: item.progress + "%", backgroundColor: ringColor }}
                              />
                            </div>
                          </div>
                        ) : null}

                        <form
                          key={item.value + "-" + (item.limit ?? "none")}
                          onSubmit={(event) => void handleBudgetSubmit(event, item.value)}
                          className="mt-3"
                        >
                          <input type="hidden" name="month" value={month} />
                          <input type="hidden" name="category" value={item.value} />
                          <label htmlFor={"budget-" + item.value} className="text-xs font-medium">
                            วงเงินต่อเดือน
                          </label>
                          <div className="mt-1 flex gap-2">
                            <input
                              id={"budget-" + item.value}
                              name="limit"
                              type="number"
                              min="0.01"
                              step="0.01"
                              inputMode="decimal"
                              defaultValue={item.limit ?? ""}
                              placeholder="เช่น 5000"
                              className="h-11 min-w-0 flex-1 rounded-lg border bg-card px-3 text-sm"
                            />
                            <button
                              type="submit"
                              disabled={savingCategory === item.value}
                              className="h-11 shrink-0 rounded-lg border px-3 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {savingCategory === item.value ? "กำลังบันทึก..." : "บันทึก"}
                            </button>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">เว้นว่างเพื่อล้างวงเงิน</p>
                        </form>
                      </div>
                    ) : null}
                  </article>
                  );
                })}
              </div>
            </div>
          </div>

          <table className="sr-only">
            <caption>สรุปค่าใช้จ่ายและวงเงินเดือน{formatMonth(month)}</caption>
            <thead>
              <tr>
                <th scope="col">หมวดหมู่</th>
                <th scope="col">ยอดใช้จ่าย</th>
                <th scope="col">วงเงิน</th>
                <th scope="col">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {categoryTotals.map((item) => (
                <tr key={item.value}>
                  <td>{item.label}</td>
                  <td>{formatReceiptAmount(item.amount)}</td>
                  <td>{item.limit ? formatReceiptAmount(item.limit) : "ยังไม่ตั้งวงเงิน"}</td>
                  <td>{item.overLimit ? "เกินวงเงิน" : "ปกติ"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
