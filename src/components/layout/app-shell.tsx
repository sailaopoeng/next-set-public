"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Dumbbell,
  History,
  Home,
  Library,
  ListChecks,
  LogIn,
  NotebookTabs,
} from "lucide-react";

import { AppLink } from "@/components/ui/app-activity";
import { PlateCalculatorButton } from "@/components/ui/plate-calculator";
import { ThemeToggle } from "@/components/ui/theme-toggle";

const navItems = [
  { href: "/", label: "Home", icon: Home },
  { href: "/templates", label: "Templates", icon: NotebookTabs },
  { href: "/sessions/new", label: "Log", icon: Dumbbell },
  { href: "/exercises", label: "Exercises", icon: Library },
  { href: "/history", label: "History", icon: History },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
];

export function AppShell({
  children,
  isOwner,
  hideMobileNav = false,
  wide = false,
}: {
  children: ReactNode;
  isOwner: boolean;
  hideMobileNav?: boolean;
  wide?: boolean;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-dvh bg-slate-100 text-slate-950">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-slate-200 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <AppLink href="/" className="flex items-center gap-2 font-bold tracking-tight">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
              <ListChecks size={18} />
            </span>
            <span className="text-base">NextSet</span>
          </AppLink>
          <div className="flex items-center gap-2">
            <PlateCalculatorButton />
            <ThemeToggle />
            {!isOwner ? (
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-800">
                Read only
              </span>
            ) : null}
            <nav className="hidden items-center gap-1 md:flex">
              {navItems.map((item) => (
                <AppLink
                  aria-current={isNavItemActive(pathname, item.href) ? "page" : undefined}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                    isNavItemActive(pathname, item.href)
                      ? "bg-emerald-50 text-emerald-700"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                  href={item.href}
                  key={item.href}
                >
                  {getNavLabel(item, isOwner)}
                </AppLink>
              ))}
            </nav>
            {!isOwner ? (
              <AppLink
                aria-label="Owner login"
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
                href="/login"
              >
                <LogIn size={18} />
              </AppLink>
            ) : null}
          </div>
        </div>
      </header>
      <main
        className={`mx-auto w-full px-4 pt-20 md:pb-8 ${
          wide ? "max-w-7xl" : "max-w-6xl"
        } ${
          hideMobileNav
            ? "pb-8"
            : "pb-[calc(5.75rem+env(safe-area-inset-bottom))]"
        }`}
      >
        {children}
      </main>
      {hideMobileNav ? null : (
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
          <div className="grid grid-cols-6">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isNavItemActive(pathname, item.href);
              return (
                <AppLink
                  aria-current={active ? "page" : undefined}
                  href={item.href}
                  className={`flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 pb-1 pt-1.5 text-[10px] font-semibold ${
                    active ? "text-emerald-700" : "text-slate-500"
                  }`}
                  key={item.href}
                >
                  <span
                    className={`flex h-7 w-12 items-center justify-center rounded-full transition ${
                      active ? "bg-emerald-100 text-emerald-700" : ""
                    }`}
                  >
                    <Icon size={19} />
                  </span>
                  {getNavLabel(item, isOwner)}
                </AppLink>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}

function isNavItemActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/sessions/new") return pathname === "/sessions/new";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function getNavLabel(item: (typeof navItems)[number], isOwner: boolean) {
  return !isOwner && item.href === "/sessions/new" ? "Plans" : item.label;
}
