/**
 * Pure helpers for the weekly pulse trend. Couple-level only: the trend note looks
 * at weeks where BOTH partners answered and never singles out either person.
 */
import { parseISODate, previousWeekStart, type ISODate } from "@/lib/domain/dates";
import type { PulseEntry } from "@/lib/backend/types";

export type PulseMetric = "excitement" | "connection";

export interface TrendWeek {
  weekStart: ISODate;
  /** Short label such as "Oct 5". */
  label: string;
  mine: PulseEntry | null;
  /** Only present for weeks the backend revealed (both answered). */
  partner: PulseEntry | null;
}

export function weekLabel(weekStart: ISODate, locale = "en-US"): string {
  return parseISODate(weekStart).toLocaleDateString(locale, { month: "short", day: "numeric" });
}

/** The last `count` weeks ending with `thisWeek`, oldest first. */
export function trendWeeks(history: PulseEntry[], myId: string, thisWeek: ISODate, count = 8): TrendWeek[] {
  const weeks: TrendWeek[] = [];
  for (let back = count - 1; back >= 0; back--) {
    const weekStart = previousWeekStart(thisWeek, back);
    weeks.push({
      weekStart,
      label: weekLabel(weekStart),
      mine: history.find((p) => p.userId === myId && p.weekStart === weekStart) ?? null,
      partner: history.find((p) => p.userId !== myId && p.weekStart === weekStart) ?? null,
    });
  }
  return weeks;
}

const coupleAverage = (weeks: TrendWeek[], metric: PulseMetric) =>
  weeks.reduce((sum, w) => sum + (w.mine![metric] + w.partner![metric]) / 2, 0) / weeks.length;

/**
 * A gentle, couple-level note about the recent trend, or null when there isn't
 * enough shared history yet. Never names or compares partners.
 */
export function trendNote(weeks: TrendWeek[]): string | null {
  const both = weeks.filter((w) => w.mine && w.partner);
  if (both.length < 3) return null;
  const recent = both.slice(-2);
  const earlier = both.slice(0, -2);
  const change = (metric: PulseMetric) => coupleAverage(recent, metric) - coupleAverage(earlier, metric);
  const excitement = change("excitement");
  const connection = change("connection");
  if (excitement <= -0.75) return "Excitement dipped a little lately. Maybe plan something new together?";
  if (connection <= -0.75) return "Connection dipped a little lately. A slow, unhurried evening together could help.";
  if (excitement >= 0.75 || connection >= 0.75) return "Things have been on the rise lately. Nice.";
  return "Things look steady lately.";
}
