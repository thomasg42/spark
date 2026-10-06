"use client";
/** Yearly reminders that fall within the next 30 days, nearest first. */
import { Badge } from "@/components/ui";
import { STORY_KIND_COPY } from "@/lib/domain/categories";
import { parseISODate, upcomingAnniversaries } from "@/lib/domain/dates";
import type { StoryEntry } from "@/lib/backend/types";

const WINDOW_DAYS = 30;

function countdown(inDays: number): string {
  if (inDays === 0) return "Today";
  if (inDays === 1) return "Tomorrow";
  return `In ${inDays} days`;
}

export function ComingUp({ entries, today }: { entries: StoryEntry[]; today: Date }) {
  const upcoming = upcomingAnniversaries(entries, today, WINDOW_DAYS);
  return (
    <section aria-labelledby="story-coming-up" className="fade-up">
      <h2 id="story-coming-up" className="mb-3 mt-2 text-xl font-bold text-ink">
        Coming up
      </h2>
      {upcoming.length ? (
        <ul className="space-y-2">
          {upcoming.map(({ entry, date, inDays, years }) => {
            const when = parseISODate(date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
            return (
              <li key={entry.id} className="flex items-center gap-4 rounded-[var(--radius-card)] border border-line bg-accent-soft p-4">
                <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface text-xl">
                  {STORY_KIND_COPY[entry.kind].emoji}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold text-ink">{entry.title}</span>
                  <span className="block text-sm text-ink">
                    {years} {years === 1 ? "year" : "years"} on <time dateTime={date}>{when}</time>
                  </span>
                </span>
                <Badge>{countdown(inDays)}</Badge>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-2xl bg-surface-2 px-4 py-3 text-sm text-muted">
          Nothing in the next {WINDOW_DAYS} days. Moments set to remind you every year show up here a month ahead.
        </p>
      )}
    </section>
  );
}
