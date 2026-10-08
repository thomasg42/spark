/**
 * Module H: is a hint's moment happening right now? The database decides for
 * real (hint_trigger_active in 20261008000700); this mirror keeps the demo
 * honest and lets the screen say why a hint is showing. Same rules:
 *   away             a trip or long work stretch logged 14 days back to 7 ahead
 *   excitement_drop  three weeks of falling excitement, counting only weeks
 *                    BOTH partners answered, and not older than two weeks
 *   feeling_distant  the hint's author raised the flag in the last 14 days
 * Pure functions.
 */
import type { DistanceFlag, HintMoment, LifeChangeKind, PulseEntry } from "@/lib/backend/types";
import { addDays, parseISODate, previousWeekStart, toISODate, weekStartOf } from "./dates";

export const FLAG_DAYS = 14;
export const AWAY_KINDS: readonly LifeChangeKind[] = ["trip", "work_stretch"];

export interface MomentInput {
  authorId: string;
  flags: DistanceFlag[];
  lifeChanges: Array<{ kind: LifeChangeKind; happenedOn: string }>;
  /** The couple's quick check-ins (both partners); unrevealed weeks are ignored here. */
  pulses: PulseEntry[];
  now: Date;
}

export function flagActive(flag: DistanceFlag | undefined, now: Date): boolean {
  return !!flag && now.getTime() - new Date(flag.raisedAt).getTime() < FLAG_DAYS * 86_400_000;
}

export function awayNow(changes: MomentInput["lifeChanges"], now: Date): boolean {
  const from = toISODate(addDays(now, -14));
  const to = toISODate(addDays(now, 7));
  return changes.some((c) => AWAY_KINDS.includes(c.kind) && c.happenedOn >= from && c.happenedOn <= to);
}

export function excitementDippedTogether(pulses: PulseEntry[], now: Date): boolean {
  const byWeek = new Map<string, Set<string>>();
  for (const p of pulses) byWeek.set(p.weekStart, (byWeek.get(p.weekStart) ?? new Set()).add(p.userId));
  const revealed = pulses.filter((p) => (byWeek.get(p.weekStart)?.size ?? 0) >= 2);
  const fresh = previousWeekStart(weekStartOf(now), 2);
  const users = new Set(revealed.map((p) => p.userId));
  for (const user of users) {
    const mine = new Map(revealed.filter((p) => p.userId === user).map((p) => [p.weekStart, p.excitement]));
    const latest = [...mine.keys()].sort().at(-1)!;
    if (latest < fresh) continue;
    const w0 = mine.get(latest);
    const w1 = mine.get(toISODate(addDays(parseISODate(latest), -7)));
    const w2 = mine.get(toISODate(addDays(parseISODate(latest), -14)));
    if (w0 !== undefined && w1 !== undefined && w2 !== undefined && w2 > w1 && w1 > w0) return true;
  }
  return false;
}

export function hintMomentActive(moment: HintMoment, input: MomentInput): boolean {
  switch (moment) {
    case "feeling_distant":
      return flagActive(input.flags.find((f) => f.userId === input.authorId), input.now);
    case "away":
      return awayNow(input.lifeChanges, input.now);
    case "excitement_drop":
      return excitementDippedTogether(input.pulses, input.now);
  }
}
