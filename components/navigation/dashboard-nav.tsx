"use client";

import { History, Home, LayoutDashboard, UserRound, Moon, Sun } from "lucide-react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { LogoutButton } from "@/components/auth/logout-button";

const navItems = [
  { id: "home", label: "Home", icon: Home },
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "history", label: "History", icon: History }
] as const;

export function DashboardNav({ userEmail }: { userEmail: string | null }) {
  const pathname = usePathname();
  const [activeSection, setActiveSection] = useState(() =>
    pathname.startsWith("/dashboard/receipts") ? "history" : "home"
  );
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggleTheme() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    setIsDark(next);
    try { localStorage.setItem("seepla-theme", next ? "dark" : "light"); } catch {}
  }

  useEffect(() => {
    const syncFromHash = () => {
      const hash = window.location.hash.slice(1);
      if (navItems.some((item) => item.id === hash)) setActiveSection(hash);
    };

    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];

        if (visible) setActiveSection(visible.target.id);
      },
      { rootMargin: "-88px 0px -55% 0px", threshold: 0.01 }
    );

    navItems
      .map((item) => document.getElementById(item.id))
      .filter((element): element is HTMLElement => Boolean(element))
      .forEach((element) => observer.observe(element));

    return () => {
      window.removeEventListener("hashchange", syncFromHash);
      observer.disconnect();
    };
  }, []);

  return (
    <header className="sticky top-0 z-30 border-b border-border/80 bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2 px-4 py-2 sm:gap-1 sm:px-6">
        <a
          href="/dashboard#home"
          className="flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-2 text-lg font-semibold tracking-tight text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Image
            src="/images/icon%20web/seepla_icon.png"
            alt="Seepla"
            width={2736}
            height={912}
            priority
            className="h-8 w-auto object-contain"
          />
        </a>

        <nav aria-label="เมนูหลัก" className="order-3 flex w-full justify-end gap-1 sm:order-2 sm:ml-auto sm:w-auto sm:flex-none">
          {navItems.map(({ id, label, icon: Icon }) => {
            const isActive = activeSection === id;
            const className =
              "flex min-h-10 items-center justify-center gap-1 rounded-lg px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:gap-2 sm:px-3 sm:text-sm " +
              (isActive
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground");

            return (
              <a
                key={id}
                href={"/dashboard#" + id}
                aria-current={isActive ? "location" : undefined}
                className={className}
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                <span>{label}</span>
              </a>
            );
          })}
        </nav>

        <div className="relative order-2 sm:order-3">
          <button
            type="button"
            aria-label="เปิดเมนูบัญชีผู้ใช้"
            aria-expanded={isUserMenuOpen}
            aria-controls="user-account-menu"
            onClick={() => setIsUserMenuOpen((current) => !current)}
            className="flex size-11 items-center justify-center rounded-full border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <UserRound className="size-5" aria-hidden="true" />
          </button>

          {isUserMenuOpen ? (
            <div
              id="user-account-menu"
              className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-64 rounded-xl border bg-card p-3 shadow-lg"
            >
              <p className="text-xs font-medium text-muted-foreground">บัญชีผู้ใช้</p>
              <p className="mt-1 truncate text-sm font-medium">{userEmail ?? "ไม่พบอีเมล"}</p>
              <button
                type="button"
                onClick={toggleTheme}
                aria-pressed={isDark}
                className="mt-3 flex min-h-11 w-full items-center gap-2 rounded-lg border bg-muted px-3 text-sm font-medium transition-colors hover:bg-primary/10"
              >
                {isDark ? <Sun className="size-4" aria-hidden="true" /> : <Moon className="size-4" aria-hidden="true" />}
                {isDark ? "เปลี่ยนเป็นธีมสว่าง" : "เปลี่ยนเป็นธีมมืด"}
              </button>
              <div className="mt-3 border-t pt-3 [&>button]:w-full">
                <LogoutButton />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
