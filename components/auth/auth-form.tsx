"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type AuthMode = "sign_in" | "sign_up";

export function AuthForm() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("sign_in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setNotice(null);
    setIsSubmitting(true);

    try {
      const supabase = createSupabaseBrowserClient();
      const result =
        mode === "sign_in"
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({
              email,
              password,
              options: {
                emailRedirectTo: `${window.location.origin}/auth/callback`
              }
            });

      if (result.error) {
        throw result.error;
      }

      if (mode === "sign_up" && !result.data.session) {
        setNotice("สมัครสำเร็จ กรุณาตรวจอีเมลเพื่อยืนยันบัญชี");
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "ไม่สามารถเข้าสู่ระบบได้");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-sm">
      <p className="text-sm font-medium text-primary">Thai household finance</p>
      <h1 className="mt-2 text-2xl font-semibold">
        {mode === "sign_in" ? "เข้าสู่ระบบ" : "สร้างบัญชี"}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        ใช้อีเมลเพื่อเข้าถึงรายการค่าใช้จ่ายส่วนตัวและของครัวเรือน
      </p>

      <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
        <label className="block text-sm font-medium">
          อีเมล
          <input
            className="mt-2 w-full rounded-lg border bg-background px-3 py-2 outline-none ring-primary focus:ring-2"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>

        <label className="block text-sm font-medium">
          รหัสผ่าน
          <input
            className="mt-2 w-full rounded-lg border bg-background px-3 py-2 outline-none ring-primary focus:ring-2"
            type="password"
            autoComplete={mode === "sign_in" ? "current-password" : "new-password"}
            minLength={6}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        {errorMessage ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p>
        ) : null}
        {notice ? (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>
        ) : null}

        <button
          className="w-full rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
          type="submit"
          disabled={isSubmitting}
        >
          {isSubmitting ? "กำลังดำเนินการ..." : mode === "sign_in" ? "เข้าสู่ระบบ" : "สมัครบัญชี"}
        </button>
      </form>

      <button
        className="mt-4 w-full text-sm text-muted-foreground underline-offset-4 hover:underline"
        type="button"
        onClick={() => {
          setMode(mode === "sign_in" ? "sign_up" : "sign_in");
          setErrorMessage(null);
          setNotice(null);
        }}
      >
        {mode === "sign_in" ? "ยังไม่มีบัญชี? สมัครใช้งาน" : "มีบัญชีแล้ว? เข้าสู่ระบบ"}
      </button>
    </section>
  );
}
