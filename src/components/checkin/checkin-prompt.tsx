"use client";
/**
 * Check-ins that come to you. The monthly check-in pops up until you have done it;
 * between monthly ones, the quick check-in pops up when your agreed rhythm says
 * it's due, or as soon as your partner has answered this week (so you both land
 * in the same week and see your trend together). "Not now" hides it for today
 * only. It re-checks whenever you come back to the app. Never on the check-in
 * screens themselves or the Support page. No streaks, no guilt copy.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { useApp } from "@/components/app-provider";
import { CADENCE_LABELS } from "@/lib/domain/cadence";
import { periodOf, toISODate, weekStartOf } from "@/lib/domain/dates";
import { quickCheckinDue } from "@/lib/domain/rhythm";
import { cx } from "@/lib/ui/cx";
import { useRhythm } from "@/lib/ui/rhythm";
import { loadCheckinHistory } from "./history";

type Due = { kind: "monthly" | "quick" | "catch-up"; key: string };

const DISMISS_KEY = "spark-checkin-prompt-dismissed";

function readDismissed(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(DISMISS_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

function remember(key: string) {
  try {
    sessionStorage.setItem(DISMISS_KEY, JSON.stringify([...readDismissed(), key]));
  } catch {
    // storage blocked: it stays hidden until the page reloads
  }
}

/** Latest time the signed-in person did a quick check-in (pulse). */
export function lastQuickCheckin(entries: Array<{ userId: string; weekStart: string; updatedAt?: string }>, userId: string): string | null {
  const own = entries.filter((e) => e.userId === userId).map((e) => e.updatedAt ?? e.weekStart);
  return own.length ? own.sort().at(-1)! : null;
}

/** Pages where a reminder would be in the way. */
export function isQuietPage(pathname: string): boolean {
  return pathname.startsWith("/checkin/") || pathname.startsWith("/support/");
}

export function CheckinPrompt({ aboveTabs }: { aboveTabs: boolean }) {
  const { backend, stage, user, partner } = useApp();
  const pathname = usePathname() ?? "/";
  const { rhythm, loading, reload: reloadRhythm } = useRhythm();
  const [due, setDue] = useState<Due | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const [resumes, setResumes] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const quiet = isQuietPage(pathname);

  useEffect(() => setHidden(readDismissed()), []);

  // Coming back to the app (a resumed phone tab or home-screen app) re-checks what's due.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") setResumes((n) => n + 1);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  // A vote revealed elsewhere can change the rhythm; refresh it on navigation and resume.
  useEffect(() => {
    if (stage === "ready") void reloadRhythm();
  }, [pathname, resumes, stage, reloadRhythm]);

  useEffect(() => {
    if (quiet) {
      setDue(null);
      return;
    }
    if (stage !== "ready" || !user || loading) return;
    let active = true;
    const today = new Date();
    const day = toISODate(today);
    const period = periodOf(today);
    (async () => {
      try {
        const [history, pulses, week] = await Promise.all([
          loadCheckinHistory(backend, 3),
          backend.pulse.history(8),
          backend.pulse.status(weekStartOf(today)),
        ]);
        if (!active) return;
        const monthlyDone = history.some((h) => h.period === period && h.iSubmitted);
        if (!monthlyDone) return setDue({ kind: "monthly", key: `monthly:${user.id}:${period}:${day}` });
        if (week.partnerSubmitted && !week.iSubmitted) return setDue({ kind: "catch-up", key: `quick:${user.id}:${day}` });
        const quick = quickCheckinDue(rhythm.current, lastQuickCheckin(pulses, user.id), today);
        setDue(quick.due && !week.iSubmitted ? { kind: "quick", key: `quick:${user.id}:${day}` } : null);
      } catch {
        if (active) setDue(null); // a reminder never blocks the app
      }
    })();
    return () => {
      active = false;
    };
  }, [backend, stage, user, loading, rhythm.current, pathname, quiet, resumes]);

  const visible = stage === "ready" && !quiet && !!due && !hidden.includes(due.key);

  // Reserve room at the bottom of the page so the card never covers the last content.
  useEffect(() => {
    const root = document.documentElement;
    if (!visible || !cardRef.current) {
      root.style.removeProperty("--checkin-prompt-h");
      return;
    }
    const el = cardRef.current;
    const apply = () => root.style.setProperty("--checkin-prompt-h", `${el.offsetHeight + 16}px`);
    apply();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(apply) : null;
    observer?.observe(el);
    return () => {
      observer?.disconnect();
      root.style.removeProperty("--checkin-prompt-h");
    };
  }, [visible]);

  const dismiss = () => {
    if (!due) return;
    const hadFocus = cardRef.current?.contains(document.activeElement) ?? false;
    remember(due.key);
    setHidden((h) => [...h, due.key]);
    if (hadFocus) document.getElementById("main")?.focus({ preventScroll: true });
  };

  const partnerName = partner?.nickname || partner?.displayName || "your partner";
  const copy = !due
    ? null
    : due.kind === "monthly"
      ? { title: "Time for your monthly check-in", body: `Five private questions and one about your pace. ${partnerName} sees your answers only after you both submit.`, href: "/checkin/monthly/", icon: "🗓️" }
      : due.kind === "catch-up"
        ? { title: "Quick check-in", body: `${partnerName} checked in this week. Add yours to see your trend together.`, href: "/checkin/pulse/", icon: "💓" }
        : { title: "Quick check-in", body: `Two taps on how exciting and how connected things feel.${rhythm.current ? ` Your rhythm: ${CADENCE_LABELS[rhythm.current].toLowerCase()}.` : ""}`, href: "/checkin/pulse/", icon: "💓" };

  return (
    <div aria-live="polite" className={cx("pointer-events-none fixed inset-x-0 z-40 px-4", aboveTabs ? "bottom-[calc(4.75rem+env(safe-area-inset-bottom))]" : "bottom-[calc(1rem+env(safe-area-inset-bottom))]")}>
      {visible && copy ? (
        <div
          ref={cardRef}
          role="region"
          aria-labelledby={titleId}
          onKeyDown={(e) => {
            if (e.key === "Escape") dismiss();
          }}
          className="fade-up pointer-events-auto mx-auto max-w-2xl rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-[0_10px_30px_rgba(43,27,46,0.18)]"
        >
          <div className="flex items-start gap-3">
            <span aria-hidden className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-xl">
              {copy.icon}
            </span>
            <div className="min-w-0 flex-1">
              <p id={titleId} className="font-bold text-ink">
                {copy.title}
              </p>
              <p className="mt-0.5 text-sm text-muted">{copy.body}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href={copy.href} className="inline-flex min-h-11 items-center rounded-full bg-accent px-5 font-semibold text-accent-ink">
                  Start now
                </Link>
                <button type="button" className="inline-flex min-h-11 items-center rounded-full px-4 font-semibold text-accent-text hover:bg-accent-soft" onClick={dismiss}>
                  Not now
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
