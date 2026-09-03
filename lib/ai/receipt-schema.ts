import { z } from "zod";

export const receiptCategories = [
  "food",
  "groceries",
  "transportation",
  "utilities",
  "healthcare",
  "education",
  "shopping",
  "housing",
  "tax_deductible",
  "other"
] as const;

export const receiptScanJsonSchema = {
  type: "object",
  properties: {
    vendor_name: {
      type: "string",
      description: "ร้านค้าหรือผู้ขายตามที่ปรากฏบนใบเสร็จ"
    },
    tax_id: {
      type: "string",
      description: "เลขประจำตัวผู้เสียภาษี 13 หลัก; ใช้สตริงว่างเมื่อไม่พบ"
    },
    date: {
      type: "string",
      description: "วันที่ในรูปแบบ Gregorian YYYY-MM-DD; ใช้สตริงว่างเมื่อไม่แน่ใจ"
    },
    total_amount: {
      type: "number",
      description: "ยอดรวมสุทธิเป็นบาท; ใช้ 0 เมื่อไม่พบ"
    },
    vat_amount: {
      type: "number",
      description: "จำนวน VAT เป็นบาท; ใช้ 0 เมื่อไม่พบหรือไม่มี VAT"
    },
    is_tax_invoice: {
      type: "boolean",
      description: "true เฉพาะใบกำกับภาษีเต็มรูป; ใบเสร็จอย่างย่อให้เป็น false"
    },
    memo: {
      type: "string",
      description: "หมายเหตุสั้น ๆ เช่น เลขที่เอกสารหรือข้อมูลที่อ่านไม่ชัด"
    },
    suggested_category: {
      type: "string",
      enum: receiptCategories,
      description: "หมวดหมู่ค่าใช้จ่ายที่เหมาะสมที่สุด"
    }
  },
  required: [
    "vendor_name",
    "tax_id",
    "date",
    "total_amount",
    "vat_amount",
    "is_tax_invoice",
    "memo",
    "suggested_category"
  ],
  additionalProperties: false
} as const;

export const receiptScanSchema = z
  .object({
    vendor_name: z.string().trim(),
    tax_id: z.string().trim().regex(/^$|^\d{13}$/, "tax_id must be empty or 13 digits"),
    date: z.string().trim().regex(/^$|^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
    total_amount: z.number().finite().nonnegative(),
    vat_amount: z.number().finite().nonnegative(),
    is_tax_invoice: z.boolean(),
    memo: z.string().trim(),
    suggested_category: z.enum(receiptCategories)
  })
  .strict();

export type ReceiptScan = z.infer<typeof receiptScanSchema>;

export function isValidThaiTaxId(taxId: string): boolean {
  if (!/^\d{13}$/.test(taxId)) {
    return false;
  }

  const checksum = taxId
    .slice(0, 12)
    .split("")
    .reduce((sum, digit, index) => sum + Number(digit) * (13 - index), 0);
  const expectedDigit = (11 - (checksum % 11)) % 10;

  return expectedDigit === Number(taxId[12]);
}

export function normalizeReceiptScan(scan: ReceiptScan) {
  return {
    ...scan,
    tax_id: scan.tax_id && isValidThaiTaxId(scan.tax_id) ? scan.tax_id : null,
    date: scan.date || null
  };
}
