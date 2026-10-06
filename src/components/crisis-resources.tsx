import { CRISIS_RESOURCES, NOT_THERAPY_NOTE } from "@shared/crisis.ts";
import { cx } from "@/lib/ui/cx";

/** Crisis resources: 988 and the National DV Hotline, always one tap away. */
export function CrisisResources({ compact = false, urgent = false, className }: { compact?: boolean; urgent?: boolean; className?: string }) {
  return (
    <aside
      aria-label="Crisis support"
      role={urgent ? "alert" : undefined}
      className={cx("rounded-[var(--radius-card)] border p-4", urgent ? "border-danger bg-surface" : "border-line bg-surface-2", className)}
    >
      <p className="font-bold text-ink">{urgent ? "You don't have to handle this alone." : "Need support right now?"}</p>
      {urgent ? <p className="mt-1 text-sm text-ink">If you or someone else is in danger, reach out now. These are free and confidential.</p> : null}
      <ul className="mt-3 space-y-2">
        {CRISIS_RESOURCES.filter((r) => !compact || r.id !== "911").map((r) => (
          <li key={r.id} className="text-sm">
            <span className="font-semibold text-ink">{r.name}.</span> <span className="text-muted">{r.detail}</span>
            <span className="mt-1 flex flex-wrap gap-2">
              <a href={`tel:${r.tel}`} className="inline-flex min-h-11 items-center rounded-full bg-accent px-4 font-semibold text-accent-ink">
                Call {r.tel === "18007997233" ? "1-800-799-7233" : r.tel}
              </a>
              {r.sms ? (
                <a href={`sms:${r.sms}${r.id === "dv" ? "?&body=START" : ""}`} className="inline-flex min-h-11 items-center rounded-full border border-line bg-surface px-4 font-semibold text-ink">
                  Text {r.sms}
                </a>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      {!compact ? <p className="mt-3 text-xs text-muted">{NOT_THERAPY_NOTE}</p> : null}
    </aside>
  );
}
