import { redirect } from "next/navigation";

import { LogoutButton } from "@/components/auth/logout-button";
import { ReceiptUpload } from "@/components/receipts/receipt-upload";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-5 py-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-primary">Thai household finance</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-2 text-sm text-muted-foreground">เข้าสู่ระบบด้วย {user.email}</p>
        </div>
        <LogoutButton />
      </div>

      <ReceiptUpload />
    </main>
  );
}
