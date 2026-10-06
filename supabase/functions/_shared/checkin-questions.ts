/**
 * Module D: the five monthly check-in questions. Each partner answers privately;
 * answers stay hidden until both submit, then appear side by side. Shared by the
 * browser app and the Edge Function (which validates and summarizes them).
 */
export const CHECKIN_QUESTIONS = [
  { id: "best", prompt: "What felt best about us this month?", placeholder: "A moment, a habit, a feeling…" },
  { id: "closest", prompt: "When did you feel closest to your partner?", placeholder: "Be specific if you can." },
  { id: "distant", prompt: "Was there a moment you felt distant or unseen?", placeholder: "Gently. It's okay to say 'not really'." },
  { id: "more_of", prompt: "What's one thing you'd love more of next month?", placeholder: "Time, touch, plans, quiet, fun…" },
  { id: "talk_about", prompt: "Anything you'd like to talk about together?", placeholder: "Optional. A topic, a worry, a dream." },
] as const;

export type CheckinQuestionId = (typeof CHECKIN_QUESTIONS)[number]["id"];
export type CheckinAnswers = Record<CheckinQuestionId, string>;

export const CHECKIN_ANSWER_MAX = 1000;

/** Validates and normalizes a submission. Empty answers are allowed except all-empty. */
export function normalizeCheckinAnswers(input: unknown): CheckinAnswers {
  if (!input || typeof input !== "object") throw new Error("Answers are required.");
  const raw = input as Record<string, unknown>;
  const out = {} as CheckinAnswers;
  let any = false;
  for (const q of CHECKIN_QUESTIONS) {
    const value = raw[q.id];
    if (value !== undefined && value !== null && typeof value !== "string") throw new Error(`Answer "${q.id}" must be text.`);
    const text = (value ?? "").trim();
    if (text.length > CHECKIN_ANSWER_MAX) throw new Error(`Answer "${q.id}" is too long.`);
    if (text) any = true;
    out[q.id] = text;
  }
  for (const key of Object.keys(raw)) {
    if (!CHECKIN_QUESTIONS.some((q) => q.id === key)) throw new Error(`Unknown question "${key}".`);
  }
  if (!any) throw new Error("Answer at least one question.");
  return out;
}

export interface CheckinSummary {
  overlaps: string[];
  gaps: string[];
  conversationStarter: string;
  safetyFlag: boolean;
  source: "claude" | "fallback";
}
