"use client";

import { ChangeEvent, useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const supportedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

const receiptCategoryOptions = [
  { value: "food", label: "อาหาร" },
  { value: "groceries", label: "ของใช้ในบ้าน/ของชำ" },
  { value: "transportation", label: "การเดินทาง" },
  { value: "utilities", label: "สาธารณูปโภค" },
  { value: "healthcare", label: "สุขภาพ" },
  { value: "education", label: "การศึกษา" },
  { value: "shopping", label: "ช้อปปิ้ง" },
  { value: "housing", label: "ที่อยู่อาศัย" },
  { value: "tax_deductible", label: "ลดหย่อนภาษี" },
  { value: "other", label: "อื่น ๆ" }
] as const;

type ReceiptCategory = (typeof receiptCategoryOptions)[number]["value"];

type ReceiptScanResult = {
  vendor_name: string;
  tax_id: string | null;
  date: string | null;
  total_amount: number;
  vat_amount: number;
  is_tax_invoice: boolean;
  memo: string;
  suggested_category: ReceiptCategory;
};

type ReviewValues = {
  vendor_name: string;
  tax_id: string;
  date: string;
  total_amount: string;
  vat_amount: string;
  is_tax_invoice: boolean;
  memo: string;
  suggested_category: ReceiptCategory;
};

function toReviewValues(result: ReceiptScanResult): ReviewValues {
  return {
    vendor_name: result.vendor_name,
    tax_id: result.tax_id ?? "",
    date: result.date ?? "",
    total_amount: String(result.total_amount),
    vat_amount: String(result.vat_amount),
    is_tax_invoice: result.is_tax_invoice,
    memo: result.memo,
    suggested_category: result.suggested_category
  };
}

function getFileExtension(file: File) {
  if (file.type === "image/png") {
    return "png";
  }

  if (file.type === "image/webp") {
    return "webp";
  }

  return "jpg";
}

export function ReceiptUpload() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [result, setResult] = useState<ReceiptScanResult | null>(null);
  const [reviewValues, setReviewValues] = useState<ReviewValues | null>(null);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    setErrorMessage(null);
    setSuccessMessage(null);
    setResult(null);
    setReviewValues(null);
    setIsSaved(false);

    if (!supportedMimeTypes.has(file.type)) {
      setErrorMessage("กรุณาเลือกไฟล์ JPEG, PNG หรือ WebP");
      return;
    }

    if (file.size > MAX_IMAGE_BYTES) {
      setErrorMessage("ไฟล์มีขนาดใหญ่เกินไป (สูงสุด 10MB)");
      return;
    }

    setSelectedFile(file);

    const formData = new FormData();
    formData.append("image", file);
    setIsScanning(true);

    try {
      const response = await fetch("/api/scan-receipt", {
        method: "POST",
        body: formData
      });
      const body = (await response.json().catch(() => null)) as
        | { data?: ReceiptScanResult; error?: string }
        | null;

      if (!response.ok) {
        throw new Error(body?.error ?? "ไม่สามารถอ่านใบเสร็จได้");
      }

      if (!body?.data) {
        throw new Error("ไม่พบข้อมูลจากการอ่านใบเสร็จ");
      }

      setResult(body.data);
      setReviewValues(toReviewValues(body.data));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "ไม่สามารถอ่านใบเสร็จได้");
    } finally {
      setIsScanning(false);
    }
  }

  async function handleSave() {
    if (!selectedFile || !result || !reviewValues) {
      return;
    }

    setErrorMessage(null);
    setSuccessMessage(null);
    setIsSaving(true);

    try {
      const totalAmount = Number(reviewValues.total_amount);
      const vatAmount = Number(reviewValues.vat_amount);
      const taxId = reviewValues.tax_id.trim() || null;
      const date = reviewValues.date.trim() || null;

      if (!Number.isFinite(totalAmount) || totalAmount < 0) {
        throw new Error("กรุณาระบุยอดรวมเป็นจำนวนที่ถูกต้อง");
      }

      if (!Number.isFinite(vatAmount) || vatAmount < 0) {
        throw new Error("กรุณาระบุ VAT เป็นจำนวนที่ถูกต้อง");
      }

      if (taxId && !/^\d{13}$/.test(taxId)) {
        throw new Error("เลขประจำตัวผู้เสียภาษีต้องมี 13 หลัก");
      }

      if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new Error("กรุณาระบุวันที่ให้ถูกต้อง");
      }

      const supabase = createSupabaseBrowserClient();
      const {
        data: { user },
        error: userError
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
      }

      const receiptId = crypto.randomUUID();
      const imagePath = `${user.id}/${receiptId}.${getFileExtension(selectedFile)}`;
      let uploadedImagePath: string | null = null;

      try {
        const { error: uploadError } = await supabase.storage
          .from("receipt-images")
          .upload(imagePath, selectedFile, {
            cacheControl: "3600",
            contentType: selectedFile.type,
            upsert: false
          });

        if (uploadError) {
          throw new Error(uploadError.message);
        }

        uploadedImagePath = imagePath;

        const { error: receiptError } = await supabase.from("receipts").insert({
          id: receiptId,
          user_id: user.id,
          household_id: null,
          image_url: imagePath,
          vendor_name: reviewValues.vendor_name.trim() || null,
          tax_id: taxId,
          date,
          amount: totalAmount,
          vat_amount: vatAmount,
          is_tax_invoice: reviewValues.is_tax_invoice,
          category: reviewValues.suggested_category,
          is_shared_expense: false,
          raw_ai_json: {
            ...result,
            vendor_name: reviewValues.vendor_name.trim(),
            tax_id: taxId,
            date,
            total_amount: totalAmount,
            vat_amount: vatAmount,
            is_tax_invoice: reviewValues.is_tax_invoice,
            memo: reviewValues.memo.trim(),
            suggested_category: reviewValues.suggested_category
          }
        });

        if (receiptError) {
          throw new Error(receiptError.message);
        }
      } catch (error) {
        if (uploadedImagePath) {
          await supabase.storage.from("receipt-images").remove([uploadedImagePath]);
        }
        throw error;
      }

      setIsSaved(true);
      setSuccessMessage("บันทึกใบเสร็จเรียบร้อยแล้ว");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "ไม่สามารถบันทึกใบเสร็จได้");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-medium">อัปโหลดใบเสร็จ</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            เลือกรูปใบเสร็จเพื่อให้ระบบช่วยอ่านข้อมูลด้วย AI
          </p>
        </div>

        <input
          ref={inputRef}
          className="hidden"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileChange}
        />
        <button
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
          type="button"
          disabled={isScanning}
          onClick={() => inputRef.current?.click()}
        >
          {isScanning ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          {isScanning ? "กำลังอ่านใบเสร็จ..." : "อัปโหลดใบเสร็จ"}
        </button>
      </div>

      {errorMessage ? (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {errorMessage}
        </p>
      ) : null}

      {successMessage ? (
        <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700" role="status">
          {successMessage}
        </p>
      ) : null}

      {reviewValues ? (
        <div className="mt-5 rounded-lg border bg-background p-4">
          <div className="flex items-center justify-between gap-4">
            <h3 className="font-medium">ตรวจสอบข้อมูลก่อนบันทึก</h3>
            <span className="text-sm text-muted-foreground">{isSaved ? "บันทึกแล้ว" : "ยังไม่ได้บันทึก"}</span>
          </div>
          <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
            <label className="block font-medium">
              ร้านค้า
              <input
                className="mt-2 w-full rounded-lg border bg-card px-3 py-2 outline-none ring-primary focus:ring-2"
                value={reviewValues.vendor_name}
                onChange={(event) =>
                  setReviewValues((current) =>
                    current ? { ...current, vendor_name: event.target.value } : current
                  )
                }
              />
            </label>
            <label className="block font-medium">
              วันที่
              <input
                className="mt-2 w-full rounded-lg border bg-card px-3 py-2 outline-none ring-primary focus:ring-2"
                type="date"
                value={reviewValues.date}
                onChange={(event) =>
                  setReviewValues((current) => (current ? { ...current, date: event.target.value } : current))
                }
              />
            </label>
            <label className="block font-medium">
              ยอดรวม
              <input
                className="mt-2 w-full rounded-lg border bg-card px-3 py-2 outline-none ring-primary focus:ring-2"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={reviewValues.total_amount}
                onChange={(event) =>
                  setReviewValues((current) =>
                    current ? { ...current, total_amount: event.target.value } : current
                  )
                }
              />
            </label>
            <label className="block font-medium">
              VAT
              <input
                className="mt-2 w-full rounded-lg border bg-card px-3 py-2 outline-none ring-primary focus:ring-2"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={reviewValues.vat_amount}
                onChange={(event) =>
                  setReviewValues((current) =>
                    current ? { ...current, vat_amount: event.target.value } : current
                  )
                }
              />
            </label>
            <label className="block font-medium">
              เลขประจำตัวผู้เสียภาษี
              <input
                className="mt-2 w-full rounded-lg border bg-card px-3 py-2 outline-none ring-primary focus:ring-2"
                inputMode="numeric"
                maxLength={13}
                value={reviewValues.tax_id}
                onChange={(event) =>
                  setReviewValues((current) => (current ? { ...current, tax_id: event.target.value } : current))
                }
              />
            </label>
            <label className="block font-medium">
              หมวดหมู่
              <select
                className="mt-2 w-full rounded-lg border bg-card px-3 py-2 outline-none ring-primary focus:ring-2"
                value={reviewValues.suggested_category}
                onChange={(event) =>
                  setReviewValues((current) =>
                    current
                      ? { ...current, suggested_category: event.target.value as ReceiptCategory }
                      : current
                  )
                }
              >
                {receiptCategoryOptions.map((category) => (
                  <option key={category.value} value={category.value}>
                    {category.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-3 sm:col-span-2">
              <input
                className="size-4 accent-primary"
                type="checkbox"
                checked={reviewValues.is_tax_invoice}
                onChange={(event) =>
                  setReviewValues((current) =>
                    current ? { ...current, is_tax_invoice: event.target.checked } : current
                  )
                }
              />
              เป็นใบกำกับภาษีเต็มรูป
            </label>
            <label className="block font-medium sm:col-span-2">
              หมายเหตุ
              <textarea
                className="mt-2 min-h-20 w-full rounded-lg border bg-card px-3 py-2 outline-none ring-primary focus:ring-2"
                value={reviewValues.memo}
                onChange={(event) =>
                  setReviewValues((current) => (current ? { ...current, memo: event.target.value } : current))
                }
              />
            </label>
          </div>
          <button
            className="mt-5 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            disabled={isSaving || isSaved}
            onClick={handleSave}
          >
            {isSaving ? <Loader2 className="size-4 animate-spin" /> : null}
            {isSaving ? "กำลังบันทึก..." : isSaved ? "บันทึกแล้ว" : "ยืนยันและบันทึก"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
