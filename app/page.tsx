export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-5 py-10">
      <div>
        <p className="text-sm font-medium text-primary">Thai household finance</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Receipt Scanner</h1>
        <p className="mt-3 max-w-xl text-muted-foreground">
          Step 1 และ Step 2 พร้อมต่อยอดด้วย Supabase RLS และ Gemini OCR แล้ว
        </p>
      </div>
      <section className="rounded-xl border bg-card p-5 shadow-sm">
        <h2 className="font-medium">Foundation status</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          <li>Supabase migration พร้อม household-aware RLS</li>
          <li>POST /api/scan-receipt พร้อม structured JSON output</li>
          <li>LINE webhook และ mobile review UI จะอยู่ในขั้นถัดไป</li>
        </ul>
      </section>
    </main>
  );
}
