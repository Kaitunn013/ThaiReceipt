export const receiptCategoryOptions = [
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

export type ReceiptCategory = (typeof receiptCategoryOptions)[number]["value"];

export type ReceiptSummary = {
  id: string;
  vendor_name: string | null;
  date: string | null;
  amount: number;
  category: string;
  created_at: string;
};

export type ReceiptDetail = ReceiptSummary & {
  image_url: string;
  tax_id: string | null;
  vat_amount: number;
  withholding_tax: number;
  is_tax_invoice: boolean;
  memo: string | null;
};

export function createReceiptId() {
  const webCrypto = globalThis.crypto;

  if (typeof webCrypto?.randomUUID === "function") {
    return webCrypto.randomUUID();
  }

  if (typeof webCrypto?.getRandomValues !== "function") {
    throw new Error("เบราว์เซอร์นี้ไม่รองรับการสร้างรหัสใบเสร็จที่ปลอดภัย");
  }

  const bytes = new Uint8Array(16);
  webCrypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20)
  ].join("-");
}

export function getReceiptCategoryLabel(category: string) {
  return receiptCategoryOptions.find((option) => option.value === category)?.label ?? "อื่น ๆ";
}

export function formatReceiptAmount(amount: number) {
  return new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB" }).format(amount);
}

export function formatReceiptDate(value: string | null) {
  if (!value) return "ไม่ระบุวันที่";
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "ไม่ระบุวันที่";
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeZone: "UTC" }).format(date);
}
