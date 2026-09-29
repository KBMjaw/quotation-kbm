"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { DataProvider, useData } from "./DataProvider";
import { ToastProvider, cx } from "./ui";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <DataProvider>
        <Nav />
        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">{children}</main>
      </DataProvider>
    </ToastProvider>
  );
}

function Nav() {
  const path = usePathname();
  const { mode, userEmail, signOut, isAdmin } = useData();
  const links = [
    { href: "/", label: "Quotations", active: path === "/" },
    { href: "/quotations/new", label: "+ New", active: path.startsWith("/quotations/new") },
    { href: "/settings", label: "Settings", active: path.startsWith("/settings") },
  ];
  return (
    <header className="sticky top-0 z-40 h-14 border-b border-slate-200 bg-white/90 backdrop-blur print:hidden">
      <div className="mx-auto flex h-full max-w-7xl items-center gap-3 px-4 sm:gap-6 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-xs font-bold text-white">QM</span>
          <span className="hidden leading-tight md:block">
            <span className="block text-sm font-semibold text-slate-800">KIPIPL Quotation Maker</span>
            <span className="block text-[11px] text-slate-400">
              {mode === "supabase" ? `Cloud · ${userEmail ?? ""}${isAdmin ? " · admin" : ""}` : "Saved in this browser"}
            </span>
          </span>
        </Link>
        <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cx(
                "shrink-0 rounded-lg px-2.5 py-1.5 text-sm font-medium whitespace-nowrap sm:px-3",
                l.active ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100",
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        {mode === "supabase" && (
          <button onClick={signOut} className="shrink-0 text-xs text-slate-500 hover:text-slate-800">
            Sign out
          </button>
        )}
      </div>
    </header>
  );
}
