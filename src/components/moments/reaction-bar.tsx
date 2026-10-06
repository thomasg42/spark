"use client";
/** Five reactions as toggle buttons (aria-pressed). One reaction per person; tapping yours again removes it. */
import type { Reaction } from "@/lib/backend/types";
import { cx } from "@/lib/ui/cx";
import { REACTIONS, reactionSummary, tallyReactions } from "./helpers";

export function ReactionBar({
  reactions,
  meId,
  nameOf,
  onReact,
  label,
}: {
  reactions: Record<string, Reaction>;
  meId: string;
  nameOf: (userId: string) => string;
  onReact: (reaction: Reaction | null) => void;
  /** Accessible name for the group, e.g. "React to Sam's photo". */
  label: string;
}) {
  const mine = reactions[meId] ?? null;
  const tally = tallyReactions(reactions);
  const summary = reactionSummary(reactions, meId, nameOf);

  return (
    <div className="mt-3">
      <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
        {REACTIONS.map((r) => {
          const count = tally[r.value].length;
          const pressed = mine === r.value;
          return (
            <button
              key={r.value}
              type="button"
              aria-pressed={pressed}
              aria-label={count ? `${r.label}, ${count}` : r.label}
              title={r.label}
              onClick={() => onReact(pressed ? null : r.value)}
              className={cx(
                "inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-full border px-3 text-lg transition active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100",
                pressed ? "border-accent bg-accent-soft" : "border-line bg-surface hover:bg-surface-2",
              )}
            >
              <span aria-hidden key={pressed ? "on" : "off"} className={cx("leading-none", pressed && "pop")}>
                {r.emoji}
              </span>
              {count ? (
                <span aria-hidden className="text-sm font-semibold tabular-nums text-ink">
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {summary ? <p className="mt-1.5 text-sm text-muted">{summary}</p> : null}
    </div>
  );
}
