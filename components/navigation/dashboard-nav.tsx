"use client";

import { History, Home, LayoutDashboard, Upload, UserRound } from "lucide-react";
import { useEffect, useState } from "react";

import { LogoutButton } from "@/components/auth/logout-button";

const navItems = [
  { id: "home", label: "Home", icon: Home },
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "upload-receipt", label: "Upload", icon: Upload },
  { id: "history", label: "History", icon: History }
] as const;

export function DashboardNav({ userEmail }: { userEmail: string | null }) {
  const [activeSection, setActiveSection] = useState("home");

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
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2 px-4 py-2 sm:gap-4 sm:px-6">
        <a
          href="/dashboard#home"
          className="flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-2 text-lg font-semibold tracking-tight text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex size-8 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">
            S
          </span>
          Seepla
        </a>

        <nav aria-label="เมนูหลัก" className="order-3 grid w-full grid-cols-4 gap-1 sm:order-2 sm:w-auto sm:flex-1 sm:justify-end">
          {navItems.map(({ id, label, icon: Icon }) => {
            const isActive = activeSection === id;
            const className =
              "flex min-h-11 items-center justify-center gap-1 rounded-lg px-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:gap-2 sm:px-3 sm:text-sm " +
              (isActive
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground");

            if (id === "upload-receipt") {
              return (
                <button
                  key={id}
                  type="button"
                  className={className}
                  onClick={() => document.getElementById("receipt-file-input")?.click()}
                >
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  <span>{label}</span>
                </button>
              );
            }

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

        <div className="order-2 ml-auto flex min-w-0 items-center gap-2 sm:order-3">
          <UserRound className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="max-w-[160px] truncate text-sm text-muted-foreground sm:max-w-[220px]">
            {userEmail ?? "ผู้ใช้"}
          </span>
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
