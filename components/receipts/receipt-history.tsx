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
  const [isRefreshing, setIsRefreshing] = useState(false);
  const requestActive = useRef(false);

  const loadReceipts = useCallback(async (showError: boolean) => {
    if (requestActive.current) return;

    requestActive.current = true;
    if (showError) setIsRefreshing(true);

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
      if (showError) setIsRefreshing(false);
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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="receipt-history-title" className="font-semibold">ประวัติใบเสร็จ</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            20 รายการล่าสุดของคุณ · อัปเดตอัตโนมัติทุก 3 วินาที
          </p>
        </div>
        <button
          type="button"
          className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
          disabled={isRefreshing}
          onClick={() => void loadReceipts(true)}
        >
          {isRefreshing ? "กำลังโหลด..." : "โหลดใหม่"}
        </button>
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
        <ul className="mt-4 divide-y">
          {receipts.map((receipt) => (
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
      )}
    </section>
  );
}
