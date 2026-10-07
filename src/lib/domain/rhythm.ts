/**
 * The couple's living check-in rhythm.
 *
 * 1. It STARTS as the split of both partners' picks (cadence.ts, Module C).
 * 2. On every monthly check-in each partner votes: sooner / same pace / later.
 *    Once both have submitted (votes are revealed with the answers), the rhythm
 *    moves ONE step only when they agree: both "sooner" = one step more often,
 *    both "later" = one step more space. Any other combination keeps the pace,
 *    so nobody is pushed by the other's vote.
 * 3. The rhythm decides how often the quick check-in pops up between monthly
 *    check-ins. The monthly check-in itself pops up every month until done.
 */
import { CADENCE_INTERVAL_DAYS, CADENCE_LADDER, negotiateCadence, type Cadence } from "./cadence";
import { addDays, daysBetween, parseISODate, type ISODate } from "./dates";

export type PaceVote = "sooner" | "same" | "later";

export interface PaceRound {
  period: string; // YYYY-MM of the monthly check-in
  mine: PaceVote | null;
  partner: PaceVote | null; // only known once the check-in is revealed
}

export type PaceShift = -1 | 0 | 1;

/** -1 = more often, +1 = more space, 0 = keep. Moves only when both agree. */
export function paceShift(a: PaceVote | null | undefined, b: PaceVote | null | undefined): PaceShift {
  if (a === "sooner" && b === "sooner") return -1;
  if (a === "later" && b === "later") return 1;
  return 0;
}

export interface Rhythm {
  /** Split of the two picks, before any votes. */
  base: Cadence | null;
  /** The rhythm in effect now. */
  current: Cadence | null;
  /** Net steps the votes moved it (negative = more often). */
  steps: number;
  /** Each counted round with its effect, oldest first. */
  rounds: Array<PaceRound & { shift: PaceShift; from: Cadence; to: Cadence }>;
}

const rung = (c: Cadence) => CADENCE_LADDER.indexOf(c);

export function agreedRhythm(mine: Cadence | null, partner: Cadence | null, rounds: PaceRound[]): Rhythm {
  if (!mine || !partner) return { base: null, current: null, steps: 0, rounds: [] };
  const base = negotiateCadence(mine, partner);
  let index = rung(base);
  const applied: Rhythm["rounds"] = [];
  for (const round of [...rounds].sort((a, b) => (a.period < b.period ? -1 : a.period > b.period ? 1 : 0))) {
    const shift = paceShift(round.mine, round.partner);
    const from = CADENCE_LADDER[index]!;
    index = Math.min(CADENCE_LADDER.length - 1, Math.max(0, index + shift));
    applied.push({ ...round, shift, from, to: CADENCE_LADDER[index]! });
  }
  const current = CADENCE_LADDER[index]!;
  return { base, current, steps: index - rung(base), rounds: applied };
}

/** Plain-language result of one revealed round, for the monthly check-in page. */
export function paceOutcome(
  mine: PaceVote | null | undefined,
  partner: PaceVote | null | undefined,
  partnerName: string,
  effect?: { from: Cadence; to: Cadence },
): string {
  if (!mine || !partner) return "One of you skipped the pace question, so the rhythm stays as it is.";
  const shift = paceShift(mine, partner);
  const atEdge = effect ? effect.from === effect.to : false;
  if (shift === -1) return atEdge ? "You both asked for sooner. Quick check-ins already come every day, so they stay daily." : "You both asked for sooner, so quick check-ins now come a step more often.";
  if (shift === 1) return atEdge ? "You both asked for more space. Quick check-ins are already at the most relaxed pace, so they stay monthly." : "You both asked for more space, so quick check-ins now come a step less often.";
  if (mine === partner) return "You both like the current pace, so it stays the same.";
  return `You and ${partnerName} voted differently, so the pace stays the same for now. Worth a quick chat, and you can vote again next month.`;
}

/** The quick check-in is due once the rhythm's interval has passed since the last one. */
export function quickCheckinDue(current: Cadence | null, lastCheckin: string | null, today: Date): { due: boolean; nextDue: Date | null } {
  if (!current) return { due: false, nextDue: null };
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (!lastCheckin) return { due: true, nextDue: start };
  const last = /^\d{4}-\d{2}-\d{2}$/.test(lastCheckin) ? parseISODate(lastCheckin as ISODate) : new Date(lastCheckin);
  const lastDay = new Date(last.getFullYear(), last.getMonth(), last.getDate());
  const nextDue = addDays(lastDay, CADENCE_INTERVAL_DAYS[current]);
  return { due: daysBetween(nextDue, start) >= 0, nextDue };
}
