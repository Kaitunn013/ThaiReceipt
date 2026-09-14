import {
  formatReceiptAmount,
  getReceiptCategoryLabel,
  receiptCategoryOptions
} from "@/lib/receipts";

type MonthlyReceipt = {
  amount: number;
  category: string;
};

type CategoryTotal = {
  value: string;
  label: string;
  amount: number;
  percentage: number;
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

function buildCategoryTotals(receipts: MonthlyReceipt[]): CategoryTotal[] {
  const amounts = new Map<string, number>();

  for (const receipt of receipts) {
    const category = receiptCategoryOptions.some((option) => option.value === receipt.category)
      ? receipt.category
      : "other";
    const amount = Number(receipt.amount);
    if (Number.isFinite(amount) && amount > 0) {
      amounts.set(category, (amounts.get(category) ?? 0) + amount);
    }
  }

  const total = Array.from(amounts.values()).reduce((sum, amount) => sum + amount, 0);
  if (!total) return [];

  return receiptCategoryOptions
    .map((option, index) => {
      const amount = amounts.get(option.value) ?? 0;
      return {
        value: option.value,
        label: option.label,
        amount,
        percentage: (amount / total) * 100,
        color: chartColors[index]
      };
    })
    .filter((item) => item.amount > 0);
}

export function MonthlySummary({
  month,
  receipts,
  hasError
}: {
  month: string;
  receipts: MonthlyReceipt[];
  hasError: boolean;
}) {
  const categoryTotals = buildCategoryTotals(receipts);
  const totalAmount = categoryTotals.reduce((sum, item) => sum + item.amount, 0);
  const largestCategory = categoryTotals.reduce<CategoryTotal | null>(
    (largest, item) => (!largest || item.amount > largest.amount ? item : largest),
    null
  );
  let cursor = 0;
  const chartSegments = categoryTotals.map((item) => {
    const start = cursor;
    cursor += item.percentage;
    return item.color + " " + start + "% " + cursor + "%";
  });
  const chartBackground = chartSegments.length
    ? "conic-gradient(" + chartSegments.join(", ") + ")"
    : undefined;

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
            <input
              id="summary-month"
              name="month"
              type="month"
              defaultValue={month}
              className="mt-1 h-11 rounded-lg border bg-card px-3 text-base"
            />
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
      ) : categoryTotals.length === 0 ? (
        <div className="mt-5 rounded-lg bg-muted p-5 text-center text-sm text-muted-foreground">
          ยังไม่มีรายการในเดือนนี้ ลองเพิ่มสลิปหรือพิมพ์รายการผ่าน LINE
        </div>
      ) : (
        <>
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
                {largestCategory?.label ?? "ไม่ระบุ"}
              </p>
            </article>
          </div>

          <div className="mt-6 grid items-center gap-6 md:grid-cols-[220px_minmax(0,1fr)]">
            <div
              className="mx-auto flex size-52 items-center justify-center rounded-full"
              style={{ background: chartBackground }}
              role="img"
              aria-label={"กราฟวงกลมสัดส่วนค่าใช้จ่ายเดือน" + formatMonth(month)}
            >
              <div className="flex size-28 flex-col items-center justify-center rounded-full bg-card text-center shadow-sm">
                <span className="text-xs text-muted-foreground">รวม</span>
                <span className="mt-1 text-sm font-semibold tabular-nums">
                  {formatReceiptAmount(totalAmount)}
                </span>
              </div>
            </div>

            <div>
              <h3 className="font-medium">แยกตามหมวดหมู่</h3>
              <ul className="mt-3 space-y-2" aria-label="รายการยอดใช้จ่ายตามหมวดหมู่">
                {categoryTotals.map((item) => (
                  <li key={item.value} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className="size-3 shrink-0 rounded-full"
                        style={{ backgroundColor: item.color }}
                        aria-hidden="true"
                      />
                      <span className="break-words">{item.label}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block font-medium tabular-nums">{formatReceiptAmount(item.amount)}</span>
                      <span className="block text-xs text-muted-foreground">{item.percentage.toFixed(1)}%</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <table className="sr-only">
            <caption>สรุปยอดค่าใช้จ่ายเดือน{formatMonth(month)}</caption>
            <thead>
              <tr>
                <th scope="col">หมวดหมู่</th>
                <th scope="col">ยอดเงิน</th>
                <th scope="col">สัดส่วน</th>
              </tr>
            </thead>
            <tbody>
              {categoryTotals.map((item) => (
                <tr key={item.value}>
                  <td>{getReceiptCategoryLabel(item.value)}</td>
                  <td>{formatReceiptAmount(item.amount)}</td>
                  <td>{item.percentage.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
