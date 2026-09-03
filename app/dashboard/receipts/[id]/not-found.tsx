import Link from "next/link";

export default function ReceiptNotFound() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl space-y-4 px-5 py-10">
      <h1 className="text-2xl font-semibold">ไม่พบใบเสร็จ</h1>
      <p className="text-muted-foreground">รายการนี้ไม่มีอยู่ หรือคุณไม่มีสิทธิ์เข้าถึง</p>
      <Link href="/dashboard" className="inline-block text-primary underline">กลับ Dashboard</Link>
    </main>
  );
}
