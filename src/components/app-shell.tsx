"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useApp } from "./app-provider";
import { cx } from "@/lib/ui/cx";

const TABS = [
  { href: "/home/", label: "Home", icon: "⌂" },
  { href: "/moments/", label: "Moments", icon: "✦" },
  { href: "/checkin/", label: "Check-in", icon: "♡" },
  { href: "/plans/", label: "Plans", icon: "◷" },
  { href: "/us/", label: "Us", icon: "∞" },
] as const;

function DemoBar() {
  const { backend, refresh } = useApp();
  const router = useRouter();
  const demo = backend.demo;
  if (!demo) return null;
  const acting = demo.actingAs();
  const other = demo.personas.find((p) => p.id !== acting);
  const me = demo.personas.find((p) => p.id === acting);
  return (
    <div className="border-b border-line bg-accent-soft px-4 py-2 text-sm text-ink">
      <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-2">
        <p>
          <span className="font-semibold">Demo mode.</span> Sample data, kept only in this browser. Viewing as <span className="font-semibold">{me?.name}</span>.
        </p>
        <span className="flex gap-2">
          {other ? (
            <button
              type="button"
              className="min-h-10 rounded-full bg-surface px-3 font-semibold text-accent-text"
              onClick={async () => {
                demo.actAs(other.id);
                await refresh();
              }}
            >
              Switch to {other.name}
            </button>
          ) : null}
          <button type="button" className="min-h-10 rounded-full px-3 font-semibold text-accent-text underline" onClick={() => router.push("/demo/")}>
            Demo options
          </button>
        </span>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { stage, profile, partner } = useApp();
  const pathname = usePathname() ?? "/";
  const showTabs = stage === "ready";

  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only-focusable fixed left-2 top-2 z-50 rounded-full bg-accent px-4 py-2 font-semibold text-accent-ink">
        Skip to content
      </a>
      <DemoBar />
      <header className="border-b border-line bg-bg/90 backdrop-blur supports-[backdrop-filter]:bg-bg/75">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <Link href={stage === "ready" ? "/home/" : "/"} className="flex min-h-11 items-center gap-2 font-display text-xl font-bold text-ink">
            <span aria-hidden className="text-deco">✦</span> Spark
          </Link>
          {stage === "ready" && profile && partner ? (
            <p className="truncate text-sm text-muted">
              {profile.nickname || profile.displayName} <span aria-hidden className="text-deco">♥</span>
              <span className="sr-only"> and </span> {partner.nickname || partner.displayName}
            </p>
          ) : null}
        </div>
      </header>

      <main id="main" className={cx("mx-auto w-full max-w-2xl flex-1 px-4 pt-6", showTabs ? "pb-nav" : "pb-12")}>
        {children}
      </main>

      <footer className={cx("mx-auto w-full max-w-2xl px-4 pb-6 text-center text-xs text-muted", showTabs && "mb-20")}>
        <p>
          <Link href="/support/" className="font-semibold text-accent-text underline">
            Need support now?
          </Link>{" "}
          · <Link href="/privacy/" className="underline">What's private</Link> · Spark is not therapy. 18+ only.
        </p>
      </footer>

      {showTabs ? (
        <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
          <ul className="mx-auto flex max-w-2xl">
            {TABS.map((tab) => {
              const active = pathname === tab.href || pathname.startsWith(tab.href);
              return (
                <li key={tab.href} className="flex-1">
                  <Link
                    href={tab.href}
                    aria-current={active ? "page" : undefined}
                    className={cx("flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs font-semibold", active ? "text-accent-text" : "text-muted")}
                  >
                    <span aria-hidden className={cx("text-xl leading-none", active && "pop")}>
                      {tab.icon}
                    </span>
                    {tab.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}
    </div>
  );
}
