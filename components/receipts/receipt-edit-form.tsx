"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { receiptCategoryOptions, type ReceiptCategory } from "@/lib/receipts";

type ReceiptEditValues = {
  vendorName: string;
  date: string;
  amount: string;
  vatAmount: string;
  taxId: string;
  category: ReceiptCategory;
  isTaxInvoice: boolean;
  memo: string;
};

export function ReceiptEditForm({
  receiptId,
  initialValues
}: {
  receiptId: string;
  initialValues: ReceiptEditValues;
}) {
  const router = useRouter();
  const [values, setValues] = useState(initialValues);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  function updateValue<Key extends keyof ReceiptEditValues>(key: Key, value: ReceiptEditValues[Key]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function cancelEditing() {
    setValues(initialValues);
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsEditing(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const amount = Number(values.amount);
    const vatAmount = Number(values.vatAmount);
    const taxId = values.taxId.trim();
    const date = values.date.trim();

    if (!Number.isFinite(amount) || amount < 0) {
      setErrorMessage("กรุณาระบุยอดรวมเป็นจำนวนที่ถูกต้อง");
      return;
    }
    if (!Number.isFinite(vatAmount) || vatAmount < 0) {
      setErrorMessage("กรุณาระบุ VAT เป็นจำนวนที่ถูกต้อง");
      return;
    }
    if (taxId && !/^\d{13}$/.test(taxId)) {
      setErrorMessage("เลขประจำตัวผู้เสียภาษีต้องมี 13 หลัก");
      return;
    }
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setErrorMessage("กรุณาระบุวันที่ให้ถูกต้อง");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch("/api/receipts/" + receiptId, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendor_name: values.vendorName.trim(),
          date,
          amount,
          vat_amount: vatAmount,
          tax_id: taxId,
          category: values.category,
          is_tax_invoice: values.isTaxInvoice,
          memo: values.memo.trim()
        })
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "ไม่สามารถบันทึกการแก้ไขได้");

      setIsEditing(false);
      setSuccessMessage("บันทึกการแก้ไขแล้ว");
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "ไม่สามารถบันทึกการแก้ไขได้");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="rounded-xl border bg-card p-5 shadow-sm" aria-label="แก้ไขข้อมูลใบเสร็จ">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-semibold">ข้อมูลที่บันทึก</h2>
        {!isEditing ? (
          <button
            type="button"
            onClick={() => {
              setErrorMessage(null);
              setSuccessMessage(null);
              setIsEditing(true);
            }}
            className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            แก้ไขข้อมูล
          </button>
        ) : null}
      </div>

      {successMessage ? (
        <p role="status" className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">
          {successMessage}
        </p>
      ) : null}
      {errorMessage ? (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {errorMessage}
        </p>
      ) : null}

      {isEditing ? (
        <form className="mt-4 grid gap-4 text-sm sm:grid-cols-2" onSubmit={handleSubmit}>
          <label className="block font-medium">
            ร้านค้า
            <input className="mt-2 w-full rounded-lg border bg-card px-3 py-2" value={values.vendorName} onChange={(event) => updateValue("vendorName", event.target.value)} />
          </label>
          <label className="block font-medium">
            วันที่
            <input className="mt-2 w-full rounded-lg border bg-card px-3 py-2" type="date" value={values.date} onChange={(event) => updateValue("date", event.target.value)} />
          </label>
          <label className="block font-medium">
            ยอดรวม
            <input className="mt-2 w-full rounded-lg border bg-card px-3 py-2" type="number" min="0" step="0.01" inputMode="decimal" value={values.amount} onChange={(event) => updateValue("amount", event.target.value)} />
          </label>
          <label className="block font-medium">
            VAT
            <input className="mt-2 w-full rounded-lg border bg-card px-3 py-2" type="number" min="0" step="0.01" inputMode="decimal" value={values.vatAmount} onChange={(event) => updateValue("vatAmount", event.target.value)} />
          </label>
          <label className="block font-medium">
            เลขประจำตัวผู้เสียภาษี
            <input className="mt-2 w-full rounded-lg border bg-card px-3 py-2" inputMode="numeric" maxLength={13} value={values.taxId} onChange={(event) => updateValue("taxId", event.target.value)} />
          </label>
          <label className="block font-medium">
            หมวดหมู่
            <select className="mt-2 w-full rounded-lg border bg-card px-3 py-2" value={values.category} onChange={(event) => updateValue("category", event.target.value as ReceiptCategory)}>
              {receiptCategoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-3 sm:col-span-2">
            <input type="checkbox" checked={values.isTaxInvoice} onChange={(event) => updateValue("isTaxInvoice", event.target.checked)} />
            เป็นใบกำกับภาษีเต็มรูป
          </label>
          <label className="block font-medium sm:col-span-2">
            หมายเหตุ
            <textarea className="mt-2 min-h-20 w-full rounded-lg border bg-card px-3 py-2" value={values.memo} onChange={(event) => updateValue("memo", event.target.value)} />
          </label>
          <div className="flex flex-wrap gap-3 sm:col-span-2">
            <button type="submit" disabled={isSaving} className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-60">
              {isSaving ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}
            </button>
            <button type="button" disabled={isSaving} onClick={cancelEditing} className="rounded-lg border px-4 py-2 font-medium disabled:opacity-60">
              ยกเลิก
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
