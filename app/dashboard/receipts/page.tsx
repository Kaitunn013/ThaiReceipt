import Link from "next/link";
import { redirect } from "next/navigation";

import { DashboardNav } from "@/components/navigation/dashboard-nav";
import { RefreshButton } from "@/components/receipts/refresh-button";
import {
  formatReceiptAmount,
  formatReceiptDate,
  getReceiptCategoryLabel,
  type ReceiptSummary
} from "@/lib/receipts";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 10;

function getPageNumber(value: string | undefined) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

export default async function ReceiptsPage({
  searchParams
}: {
  searchParams?: Promise<{ page?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const requestedPage = getPageNumber(params.page);
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const from = (requestedPage - 1) * PAGE_SIZE;
  const { data: receipts, count, error } = await supabase
    .from("receipts")
    .select("id, vendor_name, date, amount, category, created_at", { count: "exact" })
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + PAGE_SIZE - 1)
    .returns<ReceiptSummary[]>();

  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  if (!error && requestedPage > totalPages) {
    redirect("/dashboard/receipts?page=" + totalPages);
  }

  const currentPage = Math.min(requestedPage, totalPages);
  const firstItem = totalCount === 0 ? 0 : from + 1;
  const lastItem = Math.min(from + (receipts?.length ?? 0), totalCount);

  return (
    <div className="min-h-screen">
      <DashboardNav userEmail={user.email ?? null} />
      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">
        <Link
          href="/dashboard#history"
          className="inline-flex min-h-11 self-start items-center rounded-lg border px-4 text-sm font-medium text-primary transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          ← กลับ Dashboard
        </Link>

        <div>
          <p className="text-sm text-primary">รายการทั้งหมด</p>
          <h1 className="mt-1 text-2xl font-semibold">ประวัติรายจ่าย</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {totalCount === 0
              ? "ยังไม่มีรายการ"
              : "แสดง " + firstItem + "-" + lastItem + " จาก " + totalCount + " รายการ"}
          </p>
        </div>

        <section className="rounded-xl border bg-card p-5 shadow-sm" aria-labelledby="all-receipts-title">
          <h2 id="all-receipts-title" className="sr-only">
            รายการใบเสร็จทั้งหมด
          </h2>

          {error ? (
            <div className="space-y-4">
              <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
                โหลดประวัติไม่สำเร็จ กรุณาลองใหม่อีกครั้ง
              </p>
              <RefreshButton />
            </div>
          ) : receipts?.length ? (
            <>
              <ul className="divide-y">
                {receipts.map((receipt) => (
                  <li key={receipt.id}>
                    <Link
                      href={"/dashboard/receipts/" + receipt.id}
                      prefetch={false}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg px-2 py-4 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="break-words font-medium">{receipt.vendor_name || "ไม่ระบุร้านค้า"}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {formatReceiptDate(receipt.date)} · {getReceiptCategoryLabel(receipt.category)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold tabular-nums">{formatReceiptAmount(receipt.amount)}</p>
                        <p className="mt-1 text-sm text-primary">ดูรายละเอียด →</p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>

              <nav
                className="mt-5 flex items-center justify-between gap-3 border-t pt-4"
                aria-label="การแบ่งหน้าประวัติรายจ่าย"
              >
                {currentPage > 1 ? (
                  <Link
                    href={"/dashboard/receipts?page=" + (currentPage - 1)}
                    className="inline-flex min-h-11 items-center rounded-lg border px-4 text-sm font-medium text-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    ← ก่อนหน้า
                  </Link>
                ) : (
                  <span className="inline-flex min-h-11 items-center rounded-lg border border-transparent px-4 text-sm text-muted-foreground">
                    ← ก่อนหน้า
                  </span>
                )}
                <span className="text-sm text-muted-foreground">
                  หน้า {currentPage} / {totalPages}
                </span>
                {currentPage < totalPages ? (
                  <Link
                    href={"/dashboard/receipts?page=" + (currentPage + 1)}
                    className="inline-flex min-h-11 items-center rounded-lg border px-4 text-sm font-medium text-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    ถัดไป →
                  </Link>
                ) : (
                  <span className="inline-flex min-h-11 items-center rounded-lg border border-transparent px-4 text-sm text-muted-foreground">
                    ถัดไป →
                  </span>
                )}
              </nav>
            </>
          ) : (
            <p className="rounded-lg bg-muted p-5 text-center text-sm text-muted-foreground">
              ยังไม่มีใบเสร็จที่บันทึก
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
