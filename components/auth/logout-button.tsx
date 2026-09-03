"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function logout() {
    setIsSubmitting(true);
    await fetch("/auth/logout", { method: "POST" });
    router.push("/auth/login");
    router.refresh();
  }

  return (
    <button
      className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
      type="button"
      disabled={isSubmitting}
      onClick={logout}
    >
      ออกจากระบบ
    </button>
  );
}
