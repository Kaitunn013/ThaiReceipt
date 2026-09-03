"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

export function RefreshButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
      disabled={isPending}
      onClick={() => startTransition(() => router.refresh())}
    >
      {isPending ? "กำลังโหลด..." : "โหลดใหม่"}
    </button>
  );
}
