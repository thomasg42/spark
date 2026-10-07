import Link from "next/link";
import { cx } from "@/lib/ui/cx";

export const PRIVATE_ANSWERS_PROMISE =
  "Only you will ever see these answers. Your partner can't read them unless you choose to share one through Spark Buddy, and Spark never sends them to AI unless you turn on AI for your Spark Buddy.";

/** Says what is private BEFORE any question is asked (consent first). */
export function PrivacyExplainer({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <section aria-labelledby="answers-privacy-title" className={cx("rounded-[var(--radius-card)] border border-line bg-accent-soft p-5", className)}>
      <h2 id="answers-privacy-title" className="flex items-center gap-2 text-lg font-bold text-ink">
        <span aria-hidden>🔒</span> Just for you
      </h2>
      <p className="mt-1 text-ink">{PRIVATE_ANSWERS_PROMISE}</p>
      {compact ? null : (
        <ul className="mt-3 space-y-1.5 text-sm text-ink">
          <li className="flex gap-2">
            <span aria-hidden className="text-accent-text">✓</span> Locked with encryption before they&apos;re saved.
          </li>
          <li className="flex gap-2">
            <span aria-hidden className="text-accent-text">✓</span> Every question is optional. Skip anything, for any reason.
          </li>
          <li className="flex gap-2">
            <span aria-hidden className="text-accent-text">✓</span> Change or clear an answer whenever you like.
          </li>
        </ul>
      )}
      <Link href="/privacy/" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-accent-text underline-offset-4 hover:underline">
        See exactly what&apos;s private
      </Link>
    </section>
  );
}
