"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

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

const categoryEmoji: Record<string, string> = {
  food: "🍱", groceries: "🛒", transportation: "🚗", utilities: "💡",
  healthcare: "💊", education: "📚", shopping: "🛍️", housing: "🏠",
  tax_deductible: "🧾", other: "📦"
};

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
  const router = useRouter();
  const [currentBudgets, setCurrentBudgets] = useState(budgets);
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [isMonthMenuOpen, setIsMonthMenuOpen] = useState(false);
  const monthMenuRef = useRef<HTMLDivElement>(null);
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
  const budgetTotal = categoryTotals.reduce((sum, item) => sum + (item.limit ?? 0), 0);
  const remainingBudget = budgetTotal - totalAmount;
  const usedCategoryCount = categoryTotals.filter((item) => item.amount > 0).length;

  useEffect(() => {
    if (!isMonthMenuOpen) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!monthMenuRef.current?.contains(event.target as Node)) {
        setIsMonthMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsMonthMenuOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isMonthMenuOpen]);

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
      router.refresh();
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
        <div className="flex flex-wrap items-end gap-2">
          <div ref={monthMenuRef} className="relative w-full sm:w-64">
            <label htmlFor="summary-month" className="text-sm font-medium">
              เลือกเดือน
            </label>
            <button
              type="button"
              id="summary-month"
              aria-haspopup="listbox"
              aria-expanded={isMonthMenuOpen}
              aria-controls="summary-month-options"
              onClick={() => setIsMonthMenuOpen((open) => !open)}
              className="mt-1 flex h-11 w-full items-center justify-between rounded-xl border bg-card px-3 text-left text-base transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <span>{formatMonth(month)}</span>
              <span aria-hidden="true">⌄</span>
            </button>
            {isMonthMenuOpen ? (
              <div
                id="summary-month-options"
                role="listbox"
                aria-label="รายการเดือน"
                className="absolute left-0 top-full z-50 mt-2 max-h-64 w-full overflow-y-auto rounded-xl border bg-card p-1 shadow-xl"
              >
                {months.map((option) => {
                  const isSelected = option === month;
                  return (
                    <button
                      key={option}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        setIsMonthMenuOpen(false);
                        router.push("/dashboard?month=" + option + "#dashboard");
                      }}
                      className={
                        "flex min-h-11 w-full items-center justify-between rounded-lg px-3 text-left text-sm transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary " +
                        (isSelected ? "bg-primary/10 font-medium text-primary" : "text-foreground")
                      }
                    >
                      <span>{formatMonth(option)}</span>
                      {isSelected ? <span aria-hidden="true">✓</span> : null}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => {
              const input = document.getElementById("receipt-file-input") as HTMLInputElement | null;
              if (input?.disabled) {
                document.getElementById("upload-receipt")?.scrollIntoView();
              } else {
                input?.click();
              }
            }}
            className="h-11 rounded-xl border border-primary/20 bg-secondary px-4 font-medium text-secondary-foreground transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            + เพิ่มสลิป
          </button>
        </div>
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

          <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <article className="relative overflow-visible rounded-2xl border bg-card p-4 shadow-sm">
              <div className="relative z-10 pr-14">
                  <p className="text-sm text-muted-foreground">ยอดใช้จ่ายเดือนนี้</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">
                    {formatReceiptAmount(totalAmount)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{receipts.length} รายการ</p>
              </div>
              <Image
                src="/images/mascots/expense.png"
                alt="มาสคอตตรวจสอบรายจ่าย"
                width={1600}
                height={1600}
                sizes="70px"
                className="pointer-events-none absolute -top-[50px] right-3 z-0 size-[90px] object-contain drop-shadow-[0_4px_8px_rgba(0,0,0,0.1)]"
              />
            </article>
            <article className="relative overflow-visible rounded-2xl border bg-card p-4 shadow-sm">
              <div className="relative z-10 pr-14">
                  <p className="text-sm text-muted-foreground">วงเงินเดือนนี้</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">
                    {budgetTotal ? formatReceiptAmount(budgetTotal) : "—"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">จาก limit ที่ตั้งไว้</p>
              </div>
              <Image
                src="/images/mascots/budget.png"
                alt="มาสคอตผู้พิทักษ์วงเงิน"
                width={1600}
                height={1600}
                sizes="70px"
                className="pointer-events-none absolute -top-[60px] right-3 z-0 size-[80px] object-contain drop-shadow-[0_4px_8px_rgba(0,0,0,0.1)]"
              />
            </article>
            <article className="relative overflow-visible rounded-2xl border bg-card p-4 shadow-sm">
              <div className="relative z-10 pr-16">
                  <p className="text-sm text-muted-foreground">วงเงินคงเหลือ</p>
                  <p
                    className={
                      "mt-1 text-xl font-semibold tabular-nums " +
                      (budgetTotal && remainingBudget < 0 ? "text-red-700 dark:text-red-300" : "")
                    }
                  >
                    {budgetTotal ? formatReceiptAmount(remainingBudget) : "—"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">เทียบกับค่าใช้จ่ายเดือนนี้</p>
              </div>
              <Image
                src="/images/mascots/remaining.png"
                alt="มาสคอตวงเงินคงเหลือ"
                width={1600}
                height={1600}
                sizes="120px"
                className="pointer-events-none absolute -top-[75px] right-3 z-0 size-[120px] object-contain drop-shadow-[0_4px_8px_rgba(0,0,0,0.1)]"
              />
            </article>
            <article className="relative overflow-visible rounded-2xl border bg-card p-4 shadow-sm">
              <div className="relative z-10 pr-14">
                  <p className="text-sm text-muted-foreground">หมวดที่มีรายการ</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">
                    {usedCategoryCount} <span className="text-sm font-normal text-muted-foreground">/ 10</span>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">หมวดที่ใช้งานในเดือนนี้</p>
              </div>
              <Image
                src="/images/mascots/categories.png"
                alt="มาสคอตจัดหมวดหมู่รายจ่าย"
                width={1920}
                height={1280}
                sizes="120px"
                className="pointer-events-none absolute -top-[60px] right-3 z-0 size-[85px] object-contain drop-shadow-[0_4px_8px_rgba(0,0,0,0.1)]"
              />
            </article>
          </div>

          {receipts.length === 0 ? (
            <div className="mt-5 rounded-lg bg-muted p-4 text-center text-sm text-muted-foreground">
              ยังไม่มีรายการในเดือนนี้ แต่สามารถตั้งวงเงินล่วงหน้าได้จากการ์ดแต่ละหมวด
            </div>
          ) : null}

          <div className="mt-6">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h3 className="font-medium">สรุปค่าใช้จ่ายตามหมวด</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  แตะ donut เพื่อดูรายละเอียดและตั้งวงเงิน
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                {usedCategoryCount} / 10 หมวด
              </span>
            </div>
            <div className="mt-4 rounded-2xl border border-border/80 bg-muted/30 p-3 sm:p-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
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
                      (item.overLimit ? "bg-red-50/70 dark:bg-red-950/40" : "bg-card/70")
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
                        <div className="flex size-14 items-center justify-center rounded-full bg-card text-center">
                          <span className="text-2xl" aria-hidden="true">{categoryEmoji[item.value] ?? "📦"}</span>
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
                                  item.overLimit ? "font-medium text-red-700 dark:text-red-300" : "text-muted-foreground"
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
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-border/70 pt-3 text-xs">
                {categoryTotals.some((item) => item.amount > 0) ? (
                  categoryTotals
                    .filter((item) => item.amount > 0)
                    .map((item) => (
                      <span key={item.value} className="inline-flex items-center gap-1.5">
                        <span
                          className="size-2 rounded-full"
                          style={{ backgroundColor: item.color }}
                          aria-hidden="true"
                        />
                        <span>{item.label}</span>
                        <span className="text-muted-foreground">
                          {item.percentage.toFixed(1)}%
                        </span>
                      </span>
                    ))
                ) : (
                  <span className="text-muted-foreground">ยังไม่มีค่าใช้จ่ายในเดือนนี้</span>
                )}
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

export function CategoryBudgetHealth({
  receipts,
  budgets
}: {
  receipts: MonthlyReceipt[];
  budgets: CategoryBudget[];
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const categoryTotals = buildCategoryTotals(receipts, budgets);
  const trackedCategories = categoryTotals
    .filter((item) => item.limit !== null)
    .sort((a, b) => Number(b.overLimit) - Number(a.overLimit) || b.amount - a.amount)
    .slice(0, 6);
  const budgetTotal = categoryTotals.reduce((sum, item) => sum + (item.limit ?? 0), 0);
  const totalAmount = categoryTotals.reduce((sum, item) => sum + item.amount, 0);
  const overallProgress = budgetTotal ? Math.min((totalAmount / budgetTotal) * 100, 100) : 0;
  const isOverBudget = budgetTotal > 0 && totalAmount > budgetTotal;
  const isNearBudget = budgetTotal > 0 && totalAmount >= budgetTotal * 0.8;
  const healthLabel = isOverBudget ? "เกินวงเงิน" : isNearBudget ? "ใกล้ถึงวงเงิน" : "อยู่ในแผน";
  const healthImageSrc =
    overallProgress < 80
      ? "/images/budget-health/green.png"
      : overallProgress < 100
        ? "/images/budget-health/yellow.png"
        : "/images/budget-health/red.png";
  const healthTone = isOverBudget
    ? "bg-red-50 text-red-900 dark:bg-red-950/50 dark:text-red-200"
    : isNearBudget
      ? "bg-amber-50 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200"
      : "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200";

  return (
    <section className="relative rounded-2xl border bg-card p-5 shadow-sm transition-colors hover:border-primary/50" aria-labelledby="budget-health-title">
      <button
        type="button"
        className="absolute inset-0 z-10 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={isExpanded ? "ย่อรายละเอียดสุขภาพการเงิน" : "ดูรายละเอียดสุขภาพการเงิน"}
        aria-expanded={isExpanded}
        aria-controls="budget-health-details"
        onClick={() => setIsExpanded((value) => !value)}
      />
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="budget-health-title" className="font-semibold">
            สุขภาพการเงิน
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">ติดตามการใช้จ่ายเทียบกับวงเงิน</p>
        </div>
        <span
          className={
            "rounded-full px-2.5 py-1 text-xs font-medium " +
            (budgetTotal ? healthTone : "bg-muted text-muted-foreground")
          }
        >
          {budgetTotal ? healthLabel : "ยังไม่ตั้งวงเงิน"}
        </span>
      </div>

      {budgetTotal ? (
        <>
          <div className={"mt-5 flex items-center gap-3 rounded-xl p-3 " + healthTone} role="status">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {isOverBudget
                  ? "ใช้เกินวงเงินรวมเดือนนี้"
                  : isNearBudget
                    ? "ใช้ถึง 80% ของวงเงินรวมแล้ว ควรระวัง"
                    : "การใช้จ่ายยังอยู่ในวงเงินรวม"}
              </p>
              <p className="mt-1 text-xs">
                ใช้ {formatReceiptAmount(totalAmount)} จาก {formatReceiptAmount(budgetTotal)}
              </p>
            </div>
            <Image
              src={healthImageSrc}
              alt="ภาพประกอบสุขภาพการเงิน"
              width={170}
              height={112}
              sizes="(max-width: 639px) 96px, 128px"
              className="h-auto w-24 shrink-0 rounded-lg object-contain sm:w-32"
            />
          </div>

          <div className="mt-5">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span>วงเงินรวม</span>
              <span className={isOverBudget ? "font-medium text-red-700 dark:text-red-300" : "text-muted-foreground"}>
                {overallProgress.toFixed(0)}%
              </span>
            </div>
            <div
              className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-label="การใช้วงเงินรวม"
              aria-valuemin={0}
              aria-valuemax={budgetTotal}
              aria-valuenow={Math.min(totalAmount, budgetTotal)}
            >
              <div
                className={"h-full rounded-full " + (isOverBudget ? "bg-red-500" : isNearBudget ? "bg-amber-500" : "bg-emerald-500")}
                style={{ width: overallProgress + "%" }}
              />
            </div>
          </div>

          <div id="budget-health-details" hidden={!isExpanded} className="mt-5 space-y-3">
            {trackedCategories.map((item) => (
              <div key={item.value}>
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="min-w-0 truncate">{item.label}</span>
                  <span className={item.overLimit ? "font-medium text-red-700 dark:text-red-300" : "text-muted-foreground"}>
                    {formatReceiptAmount(item.amount)} / {formatReceiptAmount(item.limit ?? 0)}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className={"h-full rounded-full " + (item.overLimit ? "bg-red-500" : "bg-primary/70")}
                    style={{ width: item.progress + "%" }}
                  />
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="mt-5 rounded-xl bg-muted p-4 text-sm text-muted-foreground">
          ยังไม่ได้ตั้งวงเงิน แตะ donut ของแต่ละหมวดเพื่อเริ่มตั้ง limit
        </div>
      )}
    </section>
  );
}
