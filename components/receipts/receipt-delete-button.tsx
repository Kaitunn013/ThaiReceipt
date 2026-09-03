"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ReceiptDeleteButton({ receiptId }: { receiptId: string }) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleDelete() {
    if (isDeleting || !window.confirm("ต้องการลบใบเสร็จและรูปนี้อย่างถาวรใช่หรือไม่?")) return;

    setErrorMessage(null);
    setIsDeleting(true);

    try {
      const response = await fetch(`/api/receipts/${receiptId}`, { method: "DELETE" });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "ไม่สามารถลบใบเสร็จได้");

      router.push("/dashboard");
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "ไม่สามารถลบใบเสร็จได้");
      setIsDeleting(false);
    }
  }

  return (
    <section className="rounded-xl border border-red-200 bg-red-50 p-5">
      <h2 className="font-semibold text-red-900">ลบข้อมูล</h2>
      <p className="mt-2 text-sm text-red-800">
        การลบจะนำข้อมูลใบเสร็จและรูปออกจากระบบ และไม่สามารถกู้คืนจากหน้านี้ได้
      </p>
      {errorMessage ? (
        <p role="alert" className="mt-3 text-sm text-red-800">
          {errorMessage}
        </p>
      ) : null}
      <button
        type="button"
        disabled={isDeleting}
        onClick={handleDelete}
        className="mt-4 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-800 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isDeleting ? "กำลังลบ..." : "ลบใบเสร็จถาวร"}
      </button>
    </section>
  );
}
