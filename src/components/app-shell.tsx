"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import {useIntimacy} from "./intimacy/use-intimacy";
import { LAST_TAB_KEY } from "@/lib/ui/last-tab";
import { isBackSwipe, isBackTo, readStack, recordVisit, swipeBackTarget } from "@/lib/ui/nav-stack";
import { useApp } from "./app-provider";
import { CheckinPrompt } from "./checkin/checkin-prompt";
import { cx } from "@/lib/ui/cx";

const TABS = [
  { href: "/home/", label: "Home", icon: "⌂" },
  { href: "/moments/", label: "Moments", icon: "✦" },
  { href: "/checkin/", label: "Check-in", icon: "♡" },
  { href: "/plans/", label: "Plans", icon: "◷" },
  { href: "/activities/", label: "Activities", icon: "◇" },
  { href: "/history/", label: "History", icon: "↶" },
  { href: "/intimacy/", label: "Intimacy", icon: "♡" },
  { href: "/people/", label: "Family & Friends", icon: "♧" },
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

/**
 * A drill-down screen sits one level below a tab (for example /checkin/pulse/ or
 * /plans/ideas/). It slides in from the right with its own back link. The tab
 * bar stays put so Home and every tab are one tap away (Thomas, 2026-10-08:
 * "you can't just go back by hitting the home button").
 */
export function isDrillDown(pathname: string): boolean {
  const path = pathname.endsWith("/") ? pathname : `${pathname}/`;
  return TABS.some((tab) => path !== tab.href && path.startsWith(tab.href));
}

export function AppShell({ children }: { children: ReactNode }) {
  const { stage, profile, partner } = useApp();
  const intimacy=useIntimacy();
  const visibleTabs=TABS.filter(t=>t.href!=="/intimacy/"||intimacy.data?.enabled);
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const drill = stage === "ready" && isDrillDown(pathname);
  const showTabs = stage === "ready";

  useEffect(()=>{document.querySelector<HTMLAnchorElement>('nav[aria-label="Main"] a[aria-current="page"]')?.scrollIntoView?.({block:"nearest",inline:"nearest"});},[pathname,intimacy.data?.enabled]);

  // The app's own back stack, so the back arrow, the tabs and swipe-back agree.
  useEffect(() => {
    recordVisit(pathname);
  }, [pathname]);

  // In the installed app (Home Screen) there is no browser swipe-back, so a swipe
  // from the left edge goes back here. In Safari the browser's own swipe does it.
  useEffect(() => {
    if (stage !== "ready" || typeof window === "undefined") return;
    const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia?.("(display-mode: standalone)").matches;
    if (!standalone) return;
    let start: { x: number; y: number } | null = null;
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      start = t && e.touches.length === 1 ? { x: t.clientX, y: t.clientY } : null;
    };
    const onEnd = (e: TouchEvent) => {
      const t = e.changedTouches[0];
      const from = start;
      start = null;
      if (!from || !t || !isBackSwipe(from, { x: t.clientX, y: t.clientY })) return;
      const target = swipeBackTarget(readStack(), pathname, isDrillDown(pathname));
      if (target === "history") window.history.back();
      else if (target) router.push(target);
    };
    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchend", onEnd);
    };
  }, [stage, pathname, router]);

  // Remember which tab a drill-down was opened from, so its back link can return there.
  useEffect(() => {
    if (stage !== "ready" || drill) return;
    try {
      sessionStorage.setItem(LAST_TAB_KEY, TABS.some((t) => t.href === (pathname.endsWith("/") ? pathname : `${pathname}/`)) ? pathname : "");
    } catch {
      // storage blocked: back links keep their default target
    }
  }, [stage, drill, pathname]);

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

      <main id="main" tabIndex={-1} className={cx("mx-auto w-full max-w-2xl flex-1 px-4 pt-6 focus:outline-none", showTabs ? "pb-nav" : "pb-12")}>
        <div key={pathname} className={drill ? "slide-in-right" : undefined}>
          {children}
        </div>
      </main>

      <footer className={cx("mx-auto w-full max-w-2xl px-4 text-center text-xs text-muted", showTabs && "mb-20")} style={{ paddingBottom: "calc(1.5rem + var(--checkin-prompt-h, 0px))" }}>
        <p>
          <Link href="/support/" className="font-semibold text-accent-text underline">
            Need support now?
          </Link>{" "}
          · <Link href="/privacy/" className="underline">What's private</Link> · Spark is not therapy. 18+ only.
        </p>
      </footer>

      <CheckinPrompt aboveTabs={showTabs} />

      {showTabs ? (
        <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
          <ul className="mx-auto flex max-w-2xl overflow-x-auto overscroll-x-contain">
            {visibleTabs.map((tab) => {
              const active = pathname === tab.href || pathname.startsWith(tab.href);
              return (
                <li key={tab.href} className="min-w-[84px] shrink-0 flex-1">
                  <Link
                    href={tab.href}
                    onClick={(e) => {
                      // From an inner screen, its own tab goes BACK to the tab (no loop in history).
                      if (isBackTo(readStack(), tab.href)) {
                        e.preventDefault();
                        window.history.back();
                      }
                    }}
                    aria-current={active ? "page" : undefined}
                    className={cx("flex min-h-16 flex-col items-center justify-center gap-0.5 px-2 text-center text-xs font-semibold", active ? "text-accent-text" : "text-muted")}
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
