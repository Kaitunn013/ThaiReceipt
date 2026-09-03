import Link from "next/link";

import {
  formatReceiptAmount,
  formatReceiptDate,
  getReceiptCategoryLabel,
  type ReceiptSummary
} from "@/lib/receipts";
import { RefreshButton } from "@/components/receipts/refresh-button";

export function ReceiptHistory({
  receipts,
  hasError
}: {
  receipts: ReceiptSummary[];
  hasError: boolean;
}) {
  return (
    <section className="rounded-xl border bg-card p-5 shadow-sm" aria-labelledby="receipt-history-title">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="receipt-history-title" className="font-semibold">ประวัติใบเสร็จ</h2>
          <p className="mt-1 text-sm text-muted-foreground">20 รายการล่าสุดของคุณ เรียงตามเวลาที่บันทึก</p>
        </div>
        <RefreshButton />
      </div>

      {hasError ? (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          โหลดประวัติไม่สำเร็จ กรุณากดโหลดใหม่อีกครั้ง
        </p>
      ) : receipts.length === 0 ? (
        <p className="mt-5 rounded-lg bg-muted p-5 text-center text-sm text-muted-foreground">
          ยังไม่มีใบเสร็จที่บันทึก เลือกรูปใบเสร็จเพื่อให้ระบบอ่านและบันทึกอัตโนมัติ
        </p>
      ) : (
        <ul className="mt-4 divide-y">
          {receipts.map((receipt) => (
            <li key={receipt.id}>
              <Link
                href={`/dashboard/receipts/${receipt.id}`}
                prefetch={false}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg px-2 py-4 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <div className="min-w-0 flex-1">
                  <p className="break-words font-medium">{receipt.vendor_name || "ไม่ระบุร้านค้า"}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {formatReceiptDate(receipt.date)} · {getReceiptCategoryLabel(receipt.category)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold tabular-nums">{formatReceiptAmount(receipt.amount)}</p>
                  <p className="mt-1 text-sm text-primary">ดูรายละเอียด →</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
