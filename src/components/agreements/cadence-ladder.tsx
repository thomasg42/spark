"use client";
import { useId } from "react";
import { cx } from "@/lib/ui/cx";
import type { LadderStep } from "./view-model";

/**
 * The five-rung rhythm ladder with both picks and the shared rhythm marked.
 * The visual is decorative; each rung carries a screen-reader sentence, so the
 * whole thing reads as a plain ordered list.
 */
export function CadenceLadder({ steps, partnerName }: { steps: LadderStep[]; partnerName: string }) {
  const labelId = useId();
  return (
    <div className="mt-5">
      <p id={labelId} className="text-sm font-semibold text-ink">
        From most often to least often
      </p>
      <div className="relative mt-3">
        <div aria-hidden className="absolute left-[10%] right-[10%] top-[11px] h-0.5 rounded-full bg-line" />
        <ol aria-labelledby={labelId} className="relative grid grid-cols-5 gap-1">
          {steps.map((step) => (
            <li key={step.cadence} className="flex min-w-0 flex-col items-center text-center">
              <span
                aria-hidden
                className={cx(
                  "flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs leading-none",
                  step.agreed
                    ? "pop border-accent bg-accent text-accent-ink"
                    : step.mine || step.partner
                      ? "border-deco bg-surface"
                      : "border-line bg-surface",
                )}
              >
                {step.agreed ? "♥" : null}
              </span>
              <span aria-hidden className={cx("mt-1.5 text-[11px] leading-tight sm:text-xs", step.agreed ? "font-bold text-ink" : "text-muted")}>
                {step.shortLabel}
              </span>
              {step.mine || step.partner ? (
                <span aria-hidden className="mt-1 flex w-full flex-col items-center gap-1">
                  {step.mine ? <Marker>You</Marker> : null}
                  {step.partner ? <Marker>{partnerName}</Marker> : null}
                </span>
              ) : null}
              <span className="sr-only">{step.srText}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function Marker({ children }: { children: string }) {
  return (
    <span className="block max-w-full truncate rounded-full border border-line bg-surface-2 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-ink">
      {children}
    </span>
  );
}
