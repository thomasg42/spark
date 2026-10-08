/**
 * Pattern cards (Module H, opt-in): "When I pull away, it usually looks like X.
 * It's not about you. What helps me is Y." Built ONLY from answers the author
 * shared openly, in their own words, so a pattern card exists exactly when
 * someone chose to make one. Hints never feed it (they're paraphrased advice).
 */
import type { PartnerShare } from "@/lib/backend/types";

/** The questions a pattern card is made of, in the order it reads. */
export const PATTERN_LINES: ReadonlyArray<{ questionId: string; lead: string }> = [
  { questionId: "conflict_tendency", lead: "When things get hard, I tend to" },
  { questionId: "dont_take_personally", lead: "It's not about you" },
  { questionId: "reset_time", lead: "Before I'm ready to talk, I usually need" },
  { questionId: "after_conflict_need", lead: "What helps me" },
  { questionId: "ready_signal", lead: "You'll know I'm ready when" },
];
export const PATTERN_QUESTION_IDS = PATTERN_LINES.map((l) => l.questionId);

export interface PatternCard {
  lines: Array<{ questionId: string; lead: string; text: string }>;
}

/** Null until at least two lines are shared openly: one line isn't a pattern. */
export function patternCardFrom(shares: PartnerShare[]): PatternCard | null {
  const open = new Map(shares.filter((s) => s.level === "open").map((s) => [s.questionId, s.text]));
  const lines = PATTERN_LINES.flatMap((l) => {
    const text = open.get(l.questionId)?.trim();
    return text ? [{ ...l, text: text.replace(/[.\s]+$/, "") }] : [];
  });
  return lines.length >= 2 ? { lines } : null;
}
