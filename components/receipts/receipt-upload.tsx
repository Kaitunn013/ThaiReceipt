"use client";

import { ChangeEvent, useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";

import { createReceiptId } from "@/lib/receipts";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 1600;
const JPEG_QUALITY = 0.82;
const supportedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

type ReceiptScanResult = {
  vendor_name: string;
  tax_id: string | null;
  date: string | null;
  total_amount: number;
  vat_amount: number;
  is_tax_invoice: boolean;
  memo: string;
  suggested_category: string;
};

type UploadJob = {
  id: string;
  file: File;
  status: "queued" | "scanning" | "saved" | "error";
  errorMessage?: string;
};

function getFileExtension(file: File) {
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

function getJobStatusLabel(job: UploadJob) {
  if (job.status === "queued") return "รออ่าน";
  if (job.status === "scanning") return "กำลังอ่านและบันทึก";
  if (job.status === "saved") return "บันทึกแล้ว";
  return "อ่านไม่สำเร็จ";
}

async function optimizeReceiptImage(file: File) {
  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("ไม่สามารถเตรียมรูปใบเสร็จได้"));
      element.src = objectUrl;
    });

    const longEdge = Math.max(image.naturalWidth, image.naturalHeight);
    if (!longEdge) return file;

    const scale = Math.min(1, MAX_IMAGE_DIMENSION / longEdge);
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return file;

    context.drawImage(image, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY);
    });

    if (!blob || (scale === 1 && blob.size >= file.size)) return file;

    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
      type: "image/jpeg",
      lastModified: file.lastModified
    });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function ReceiptUpload() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [uploadJobs, setUploadJobs] = useState<UploadJob[]>([]);

  function updateJob(jobId: string, update: Partial<UploadJob>) {
    setUploadJobs((current) =>
      current.map((job) => (job.id === jobId ? { ...job, ...update } : job))
    );
  }

  async function processFiles(jobs: UploadJob[]) {
    setIsProcessing(true);
    let savedCount = 0;
    let failedCount = 0;

    try {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { user },
        error: userError
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
      }

      for (const job of jobs) {
        updateJob(job.id, { status: "scanning", errorMessage: undefined });
        let uploadedImagePath: string | null = null;

        try {
          const preparedFile = await optimizeReceiptImage(job.file);
          const receiptId = createReceiptId();
          const imagePath = user.id + "/" + receiptId + "." + getFileExtension(preparedFile);
          uploadedImagePath = imagePath;

          const formData = new FormData();
          formData.append("image", preparedFile);
          const uploadTask = supabase.storage.from("receipt-images").upload(imagePath, preparedFile, {
            cacheControl: "3600",
            contentType: preparedFile.type,
            upsert: false
          });
          const scanTask = fetch("/api/scan-receipt", {
            method: "POST",
            body: formData
          });

          const [uploadResult, scanResult] = await Promise.allSettled([uploadTask, scanTask]);
          if (uploadResult.status === "rejected") {
            throw uploadResult.reason instanceof Error
              ? uploadResult.reason
              : new Error("ไม่สามารถอัปโหลดรูปใบเสร็จได้");
          }
          if (uploadResult.value.error) throw new Error(uploadResult.value.error.message);
          if (scanResult.status === "rejected") {
            throw scanResult.reason instanceof Error
              ? scanResult.reason
              : new Error("ไม่สามารถอ่านใบเสร็จได้");
          }

          const scanResponse = scanResult.value;
          const scanBody = (await scanResponse.json().catch(() => null)) as
            | { data?: ReceiptScanResult; error?: string }
            | null;

          if (!scanResponse.ok) {
            throw new Error(scanBody?.error ?? "ไม่สามารถอ่านใบเสร็จได้");
          }
          if (!scanBody?.data) {
            throw new Error("ไม่พบข้อมูลจากการอ่านใบเสร็จ");
          }

          const result = scanBody.data;
          const { error: receiptError } = await supabase.from("receipts").insert({
            id: receiptId,
            user_id: user.id,
            household_id: null,
            image_url: imagePath,
            vendor_name: result.vendor_name.trim() || null,
            tax_id: result.tax_id?.trim() || null,
            date: result.date?.trim() || null,
            amount: result.total_amount,
            vat_amount: result.vat_amount,
            is_tax_invoice: result.is_tax_invoice,
            memo: result.memo.trim() || null,
            category: result.suggested_category,
            is_shared_expense: false,
            raw_ai_json: null
          });

          if (receiptError) throw new Error(receiptError.message);
          updateJob(job.id, { status: "saved" });
          savedCount += 1;
        } catch (error) {
          if (uploadedImagePath) {
            await supabase.storage.from("receipt-images").remove([uploadedImagePath]);
          }
          failedCount += 1;
          updateJob(job.id, {
            status: "error",
            errorMessage: error instanceof Error ? error.message : "ไม่สามารถบันทึกใบเสร็จได้"
          });
        }
      }
    } catch (error) {
      failedCount = jobs.length;
      const message = error instanceof Error ? error.message : "ไม่สามารถอัปโหลดใบเสร็จได้";
      jobs.forEach((job) => updateJob(job.id, { status: "error", errorMessage: message }));
    } finally {
      setIsProcessing(false);
      if (savedCount > 0) {
        setSuccessMessage("บันทึกใบเสร็จสำเร็จ " + savedCount + " รายการ");
        router.refresh();
      }
      if (failedCount > 0) {
        setErrorMessage("มี " + failedCount + " รายการที่บันทึกไม่สำเร็จ กรุณาตรวจสอบผลรายรูป");
      }
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;

    setErrorMessage(null);
    setSuccessMessage(null);

    const invalidType = files.find((file) => !supportedMimeTypes.has(file.type));
    if (invalidType) {
      setErrorMessage("กรุณาเลือกเฉพาะไฟล์ JPEG, PNG หรือ WebP");
    }

    const validFiles = files.filter(
      (file) => supportedMimeTypes.has(file.type) && file.size <= MAX_IMAGE_BYTES
    );
    const oversizedCount = files.filter((file) => file.size > MAX_IMAGE_BYTES).length;
    if (oversizedCount > 0) {
      setErrorMessage("มี " + oversizedCount + " ไฟล์ที่ใหญ่เกินไป (สูงสุด 10MB)");
    }
    if (!validFiles.length) return;

    const jobs = validFiles.map((file) => ({
      id: createReceiptId(),
      file,
      status: "queued" as const
    }));
    setUploadJobs((current) => [...current, ...jobs]);
    void processFiles(jobs);
  }

  function retryFailedJobs() {
    if (isProcessing) return;

    const failedJobs = uploadJobs.filter((job) => job.status === "error");
    if (!failedJobs.length) return;

    setErrorMessage(null);
    setSuccessMessage(null);
    void processFiles(failedJobs);
  }

  return (
    <section className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-medium">อัปโหลดใบเสร็จ</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            เลือกได้หลายรูป ระบบจะย่อรูป อ่าน และบันทึกให้อัตโนมัติ
          </p>
          <p className="mt-2 text-xs text-amber-700" role="note">
            เพื่อความปลอดภัย กรุณาปิดบัง QR Code เลขบัญชี และข้อมูลที่ไม่เกี่ยวข้องก่อนอัปโหลด
          </p>
        </div>

        <input
          ref={inputRef}
          className="hidden"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={handleFileChange}
        />
        <button
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
          type="button"
          disabled={isProcessing}
          onClick={() => inputRef.current?.click()}
        >
          {isProcessing ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          {isProcessing ? "กำลังอ่านและบันทึก..." : "เลือกรูปใบเสร็จ"}
        </button>
      </div>

      {errorMessage ? (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {errorMessage}
        </p>
      ) : null}

      {successMessage ? (
        <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700" role="status">
          {successMessage} แก้ไขรายละเอียดได้จากรายการในประวัติ
        </p>
      ) : null}

      {uploadJobs.length ? (
        <div className="mt-5 rounded-lg border bg-background p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-medium">ผลการอัปโหลด</h3>
            {uploadJobs.some((job) => job.status === "error") ? (
              <button
                type="button"
                disabled={isProcessing}
                onClick={retryFailedJobs}
                className="rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-60"
              >
                ลองใหม่เฉพาะรายการที่ล้มเหลว
              </button>
            ) : null}
          </div>
          <ul className="mt-3 divide-y text-sm">
            {uploadJobs.map((job) => (
              <li key={job.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                <span className="min-w-0 break-words">{job.file.name}</span>
                <span className={job.status === "error" ? "text-red-700" : job.status === "saved" ? "text-emerald-700" : "text-muted-foreground"}>
                  {getJobStatusLabel(job)}
                </span>
                {job.errorMessage ? <span className="text-xs text-red-700">{job.errorMessage}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
