/**
 * Module C: cadence negotiation.
 *
 * Each partner picks how often they want relationship check-ins (daily, weekly or
 * monthly). The couple's rhythm "splits the difference" by taking the midpoint on
 * this ladder:
 *
 *   daily · twice_weekly · weekly · biweekly · monthly
 *
 *   daily   + monthly -> weekly        (spec example)
 *   weekly  + monthly -> biweekly      (spec example)
 *   daily   + weekly  -> twice_weekly
 *   same    + same    -> same
 *
 * If a future option made the midpoint fall between two rungs, it rounds toward the
 * LESS frequent rung: the partner who needs more space is never pushed past the
 * middle. Both choices are always shown openly next to the result. A big life change
 * (Phase 2) moves the rhythm one rung more frequent for six weeks.
 */
import { addDays, daysBetween, parseISODate, type ISODate } from "./dates";

export const CADENCE_LADDER = ["daily", "twice_weekly", "weekly", "biweekly", "monthly"] as const;
export type Cadence = (typeof CADENCE_LADDER)[number];

export const PICKABLE_CADENCES = ["daily", "weekly", "monthly"] as const;
export type PickableCadence = (typeof PICKABLE_CADENCES)[number];

export const CADENCE_LABELS: Record<Cadence, string> = {
  daily: "Every day",
  twice_weekly: "Twice a week",
  weekly: "Every week",
  biweekly: "Every two weeks",
  monthly: "Every month",
};

export const CADENCE_INTERVAL_DAYS: Record<Cadence, number> = {
  daily: 1,
  twice_weekly: 3,
  weekly: 7,
  biweekly: 14,
  monthly: 30,
};

export const LIFE_CHANGE_BOOST_DAYS = 42; // six weeks
export const CADENCE_REVIEW_DAYS = 90; // revisit every quarter

const rung = (c: Cadence) => CADENCE_LADDER.indexOf(c);

export function isCadence(value: unknown): value is Cadence {
  return typeof value === "string" && (CADENCE_LADDER as readonly string[]).includes(value);
}

/** Splits the difference between two partners' picks. */
export function negotiateCadence(a: Cadence, b: Cadence): Cadence {
  if (!isCadence(a) || !isCadence(b)) throw new Error("Unknown cadence");
  const mid = Math.ceil((rung(a) + rung(b)) / 2);
  return CADENCE_LADDER[mid]!;
}

/** One or more rungs more frequent, never past daily. */
export function boostCadence(c: Cadence, steps = 1): Cadence {
  return CADENCE_LADDER[Math.max(0, rung(c) - steps)]!;
}

export interface LifeChange {
  date: ISODate;
}

/** True while any logged life change is within the six-week boost window. */
export function lifeChangeBoostActive(changes: LifeChange[], today: Date): boolean {
  return changes.some((c) => {
    const age = daysBetween(parseISODate(c.date), today);
    return age >= 0 && age < LIFE_CHANGE_BOOST_DAYS;
  });
}

export interface CoupleCadence {
  mine: Cadence | null;
  partner: Cadence | null;
  agreed: Cadence | null;
  effective: Cadence | null;
  boosted: boolean;
}

/** The couple's rhythm, showing both choices openly. Null until both have picked. */
export function coupleCadence(
  mine: Cadence | null,
  partner: Cadence | null,
  lifeChanges: LifeChange[] = [],
  today: Date = new Date(),
): CoupleCadence {
  if (!mine || !partner) return { mine, partner, agreed: null, effective: null, boosted: false };
  const agreed = negotiateCadence(mine, partner);
  const boosted = lifeChangeBoostActive(lifeChanges, today) && agreed !== "daily";
  return { mine, partner, agreed, effective: boosted ? boostCadence(agreed) : agreed, boosted };
}

/** When the next check-in is due given the last one (or today if none yet). */
export function nextCheckinDue(cadence: Cadence, last: ISODate | null, today: Date): Date {
  if (!last) return new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return addDays(parseISODate(last), CADENCE_INTERVAL_DAYS[cadence]);
}

export function isCheckinDue(cadence: Cadence, last: ISODate | null, today: Date): boolean {
  return daysBetween(nextCheckinDue(cadence, last, today), today) >= 0;
}

/** Quarterly prompt to revisit the agreed rhythm. */
export function cadenceReviewDue(reviewedAt: string | Date, today: Date): boolean {
  const reviewed = typeof reviewedAt === "string" ? new Date(reviewedAt) : reviewedAt;
  return daysBetween(reviewed, today) >= CADENCE_REVIEW_DAYS;
}
