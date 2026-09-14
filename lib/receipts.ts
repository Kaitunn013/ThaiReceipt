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
  image_url: string | null;
  tax_id: string | null;
  vat_amount: number;
  withholding_tax: number;
  is_tax_invoice: boolean;
  memo: string | null;
};

const receiptCategoryKeywords: Record<ReceiptCategory, readonly string[]> = {
  food: ["อาหาร", "กะเพรา", "ข้าว", "ก๋วยเตี๋ยว", "ผัด", "แกง", "กาแฟ", "ชา", "ขนม", "เบเกอรี่", "ชาบู", "หมูกระทะ", "สุกี้", "พิซซ่า", "cafe", "food"],
  groceries: ["ของชำ", "ของใช้", "ตลาด", "ซูเปอร์", "supermarket", "grocery", "โลตัส", "บิ๊กซี", "ท็อปส์", "แม็คโคร", "สบู่", "แชมพู", "ทิชชู", "7-11"],
  transportation: ["แท็กซี่", "taxi", "grab", "bolt", "bts", "mrt", "รถไฟฟ้า", "รถเมล์", "น้ำมัน", "ทางด่วน", "ที่จอด", "วิน"],
  utilities: ["ค่าไฟ", "ค่าน้ำ", "อินเทอร์เน็ต", "internet", "wifi", "โทรศัพท์", "มือถือ", "ค่าโทร"],
  healthcare: ["ยา", "โรงพยาบาล", "คลินิก", "หมอ", "ทันตแพทย์", "สุขภาพ", "health"],
  education: ["ค่าเรียน", "โรงเรียน", "มหาวิทยาลัย", "หนังสือ", "คอร์ส", "เรียน", "tuition"],
  shopping: ["เสื้อ", "รองเท้า", "เสื้อผ้า", "ช้อป", "shopping", "ห้าง"],
  housing: ["ค่าเช่า", "เช่าบ้าน", "คอนโด", "หอพัก", "ซ่อมบ้าน", "ที่อยู่อาศัย"],
  tax_deductible: ["ประกัน", "บริจาค", "ลดหย่อนภาษี"],
  other: []
};

export function inferReceiptCategory(text: string, fallback: ReceiptCategory = "other") {
  const normalized = text.trim().toLocaleLowerCase("th-TH");

  for (const option of receiptCategoryOptions) {
    if (option.value !== "other" && receiptCategoryKeywords[option.value].some((keyword) => normalized.includes(keyword))) {
      return option.value;
    }
  }

  return fallback;
}

export function resolveReceiptCategory(category: string, text: string) {
  const validCategory = receiptCategoryOptions.some((option) => option.value === category)
    ? (category as ReceiptCategory)
    : "other";

  return validCategory === "other" ? inferReceiptCategory(text) : validCategory;
}

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
