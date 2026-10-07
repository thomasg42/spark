"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "@/lib/ui/cx";

/**
 * A list row: everything on the left, an arrow on the right. Tapping anywhere on
 * the row opens that screen full-size (it slides in from the right).
 */
export function DrillRow({ href, icon, title, status, badge, className }: { href: string; icon: string; title: string; status?: ReactNode; badge?: string | null; className?: string }) {
  return (
    <Link
      href={href}
      className={cx(
        "group flex min-h-16 items-center gap-4 rounded-[var(--radius-card)] border border-line bg-surface px-4 py-3 transition hover:bg-surface-2",
        className,
      )}
    >
      <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-xl">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="min-w-0 break-words font-bold text-ink">{title}</span>
          {badge ? <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent-text">{badge}</span> : null}
        </span>
        {status ? <span className="mt-0.5 line-clamp-2 text-sm text-muted">{status}</span> : null}
      </span>
      <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line text-xl leading-none text-accent-text transition group-hover:translate-x-0.5">
        ›
      </span>
    </Link>
  );
}

export function DrillList({ label, children }: { label: string; children: ReactNode }) {
  return (
    <nav aria-label={label}>
      <ul className="space-y-2.5">{children}</ul>
    </nav>
  );
}
