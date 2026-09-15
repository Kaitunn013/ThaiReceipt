"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  formatReceiptAmount,
  formatReceiptDate,
  getReceiptCategoryLabel,
  type ReceiptSummary
} from "@/lib/receipts";

const RECEIPT_POLL_INTERVAL_MS = 3000;
const INITIAL_VISIBLE_RECEIPTS = 5;

export function ReceiptHistory({
  receipts: initialReceipts,
  hasError: initialError
}: {
  receipts: ReceiptSummary[];
  hasError: boolean;
}) {
  const [receipts, setReceipts] = useState(initialReceipts);
  const [errorMessage, setErrorMessage] = useState<string | null>(
    initialError ? "โหลดประวัติไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" : null
  );
  const [showAll, setShowAll] = useState(false);
  const requestActive = useRef(false);
  const visibleReceipts = showAll ? receipts : receipts.slice(0, INITIAL_VISIBLE_RECEIPTS);

  const loadReceipts = useCallback(async (showError: boolean) => {
    if (requestActive.current) return;

    requestActive.current = true;

    try {
      const response = await fetch("/api/receipts?limit=20", {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" }
      });
      const body = (await response.json().catch(() => null)) as
        | { receipts?: ReceiptSummary[]; error?: string }
        | null;

      if (!response.ok || !Array.isArray(body?.receipts)) {
        throw new Error(body?.error ?? "โหลดประวัติไม่สำเร็จ");
      }

      setReceipts(body.receipts);
      setErrorMessage(null);
    } catch {
      if (showError) {
        setErrorMessage("โหลดประวัติไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      }
    } finally {
      requestActive.current = false;
    }
  }, []);

  useEffect(() => {
    void loadReceipts(true);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadReceipts(false);
      }
    }, RECEIPT_POLL_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [loadReceipts]);

  return (
    <section className="rounded-xl border bg-card p-5 shadow-sm" aria-labelledby="receipt-history-title">
      <div>
        <div>
          <h2 id="receipt-history-title" className="font-semibold">ประวัติใบเสร็จ</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            20 รายการล่าสุดของคุณ · อัปเดตอัตโนมัติทุก 3 วินาที
          </p>
        </div>
      </div>

      {errorMessage ? (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {errorMessage}
        </p>
      ) : receipts.length === 0 ? (
        <p className="mt-5 rounded-lg bg-muted p-5 text-center text-sm text-muted-foreground">
          ยังไม่มีใบเสร็จที่บันทึก เลือกรูปใบเสร็จเพื่อให้ระบบอ่านและบันทึกอัตโนมัติ
        </p>
      ) : (
        <>
          <ul className="mt-4 divide-y">
            {visibleReceipts.map((receipt) => (
              <li key={receipt.id}>
                <Link
                  href={"/dashboard/receipts/" + receipt.id}
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
          {receipts.length > INITIAL_VISIBLE_RECEIPTS && !showAll ? (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="mt-4 min-h-11 w-full rounded-lg border px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              ดูทั้งหมด ({receipts.length} รายการ)
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}
