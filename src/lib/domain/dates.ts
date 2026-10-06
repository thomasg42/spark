/** Date helpers that work in the user's LOCAL calendar (no UTC drift). */

export type ISODate = string; // YYYY-MM-DD

const pad = (n: number) => String(n).padStart(2, "0");

export function toISODate(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseISODate(s: ISODate): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) throw new Error(`Invalid date: ${s}`);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function addDays(d: Date, days: number): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  out.setDate(out.getDate() + days);
  return out;
}

/** Whole calendar days from a to b (b - a). */
export function daysBetween(a: Date, b: Date): number {
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ub - ua) / 86_400_000);
}

/** Monday of the ISO week containing d, as YYYY-MM-DD. */
export function weekStartOf(d: Date): ISODate {
  const dow = (d.getDay() + 6) % 7; // Monday = 0
  return toISODate(addDays(d, -dow));
}

export function previousWeekStart(weekStart: ISODate, weeksBack = 1): ISODate {
  return toISODate(addDays(parseISODate(weekStart), -7 * weeksBack));
}

/** YYYY-MM for the month containing d. */
export function periodOf(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function previousPeriod(period: string): string {
  const [y, m] = period.split("-").map(Number) as [number, number];
  return m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`;
}

export function formatPeriod(period: string, locale = "en-US"): string {
  const [y, m] = period.split("-").map(Number) as [number, number];
  return new Date(y, m - 1, 1).toLocaleDateString(locale, { month: "long", year: "numeric" });
}

export function formatDate(iso: ISODate | null | undefined, locale = "en-US"): string {
  if (!iso) return "";
  return parseISODate(iso).toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" });
}

/** Whole years between birthday and today. */
export function ageOn(birthday: ISODate, today: Date): number {
  const b = parseISODate(birthday);
  let age = today.getFullYear() - b.getFullYear();
  const beforeBirthday =
    today.getMonth() < b.getMonth() || (today.getMonth() === b.getMonth() && today.getDate() < b.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export function isAdult(birthday: ISODate, today: Date): boolean {
  return ageOn(birthday, today) >= 18;
}

export interface AnniversarySource {
  id: string;
  title: string;
  happenedOn: ISODate | null;
  remindYearly: boolean;
}

export interface UpcomingAnniversary<T extends AnniversarySource> {
  entry: T;
  date: ISODate;
  inDays: number;
  years: number;
}

/**
 * Next yearly recurrence of each entry marked remindYearly, within `withinDays`.
 * Feb 29 dates fall on Feb 28 in non-leap years.
 */
export function upcomingAnniversaries<T extends AnniversarySource>(
  entries: T[],
  today: Date,
  withinDays = 30,
): UpcomingAnniversary<T>[] {
  const out: UpcomingAnniversary<T>[] = [];
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  for (const entry of entries) {
    if (!entry.remindYearly || !entry.happenedOn) continue;
    const orig = parseISODate(entry.happenedOn);
    for (const year of [start.getFullYear(), start.getFullYear() + 1]) {
      let candidate = new Date(year, orig.getMonth(), orig.getDate());
      if (candidate.getMonth() !== orig.getMonth()) candidate = new Date(year, orig.getMonth() + 1, 0);
      const inDays = daysBetween(start, candidate);
      if (inDays < 0) continue;
      const years = year - orig.getFullYear();
      if (years < 1) break;
      if (inDays <= withinDays) out.push({ entry, date: toISODate(candidate), inDays, years });
      break;
    }
  }
  return out.sort((a, b) => a.inDays - b.inDays);
}
