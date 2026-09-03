import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ReceiptImage } from "@/components/receipts/receipt-image";
import { ReceiptEditForm } from "@/components/receipts/receipt-edit-form";
import { RefreshButton } from "@/components/receipts/refresh-button";
import {
  formatReceiptAmount,
  formatReceiptDate,
  getReceiptCategoryLabel,
  receiptCategoryOptions,
  type ReceiptCategory,
  type ReceiptDetail
} from "@/lib/receipts";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ReceiptDeleteButton } from "@/components/receipts/receipt-delete-button";

export const dynamic = "force-dynamic";

export default async function ReceiptDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();

  const { data: receipt, error } = await supabase
    .from("receipts")
    .select("id, vendor_name, date, amount, category, created_at, image_url, tax_id, vat_amount, withholding_tax, is_tax_invoice, memo")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle<ReceiptDetail>();

  if (error) {
    return (
      <main className="mx-auto min-h-screen max-w-3xl space-y-5 px-5 py-10">
        <Link href="/dashboard" className="text-sm text-primary underline">← กลับ Dashboard</Link>
        <h1 className="text-2xl font-semibold">รายละเอียดใบเสร็จ</h1>
        <p role="alert">โหลดรายละเอียดไม่สำเร็จ กรุณาลองใหม่อีกครั้ง</p>
        <RefreshButton />
      </main>
    );
  }
  if (!receipt) notFound();

  const { data: image } = await supabase.storage
    .from("receipt-images")
    .createSignedUrl(receipt.image_url, 300);
  const imageUrl = image?.signedUrl ?? null;
  const fields = [
    ["ร้านค้า", receipt.vendor_name || "ไม่ระบุร้านค้า"],
    ["วันที่", formatReceiptDate(receipt.date)],
    ["ยอดรวม", formatReceiptAmount(receipt.amount)],
    ["VAT", formatReceiptAmount(receipt.vat_amount)],
    ["ภาษีหัก ณ ที่จ่าย", formatReceiptAmount(receipt.withholding_tax)],
    ["หมวดหมู่", getReceiptCategoryLabel(receipt.category)],
    ["เลขประจำตัวผู้เสียภาษี", receipt.tax_id || "ไม่ระบุ"],
    ["ใบกำกับภาษีเต็มรูป", receipt.is_tax_invoice ? "ใช่" : "ไม่ใช่"]
  ];

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-5 py-10">
      <Link href="/dashboard" className="self-start text-sm text-primary underline underline-offset-4">← กลับ Dashboard</Link>
      <div>
        <p className="text-sm text-muted-foreground">ใบเสร็จที่บันทึกแล้ว</p>
        <h1 className="mt-2 break-words text-3xl font-semibold">{receipt.vendor_name || "รายละเอียดใบเสร็จ"}</h1>
      </div>
      <section className="rounded-xl border bg-card p-5 shadow-sm" aria-label="ข้อมูลใบเสร็จ">
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          {fields.map(([label, value]) => (
            <div key={label}>
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="mt-1 break-words font-medium">{value}</dd>
            </div>
          ))}
        </dl>
        {receipt.memo ? <p className="mt-5 whitespace-pre-wrap break-words text-sm">หมายเหตุ: {receipt.memo}</p> : null}
      </section>
      <ReceiptEditForm
        receiptId={receipt.id}
        initialValues={{
          vendorName: receipt.vendor_name ?? "",
          date: receipt.date ?? "",
          amount: String(receipt.amount),
          vatAmount: String(receipt.vat_amount),
          taxId: receipt.tax_id ?? "",
          category: receiptCategoryOptions.some((option) => option.value === receipt.category)
            ? (receipt.category as ReceiptCategory)
            : "other",
          isTaxInvoice: receipt.is_tax_invoice,
          memo: receipt.memo ?? ""
        }}
      />
      <section className="rounded-xl border bg-card p-5 shadow-sm" aria-label="รูปใบเสร็จ">
        <h2 className="mb-4 font-semibold">รูปใบเสร็จ</h2>
        <ReceiptImage key={imageUrl ?? "unavailable"} url={imageUrl} vendorName={receipt.vendor_name} />
      </section>
      <ReceiptDeleteButton receiptId={receipt.id} />
    </main>
  );
}
