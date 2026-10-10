/**
 * Our Goals. Both people own the goal. Private versions stay hidden until both submit.
 * Module L still holds private dreams, weekly forecasts, and support asks. This does not copy them.
 */

export const GOAL_TYPES = ["money", "home", "health", "travel", "business", "relationship", "custom"] as const;
export type GoalType = (typeof GOAL_TYPES)[number];
export const GOAL_TYPE_LABELS: Record<GoalType, string> = {
  money: "Money",
  home: "Home",
  health: "Health",
  travel: "Travel",
  business: "Business",
  relationship: "Relationship",
  custom: "Custom",
};

export type GoalStatus = "drafting" | "active" | "paused" | "archived";

export interface GoalDraft {
  goalId: string;
  authorId: string;
  version: string;
  why: string;
  submittedAt: string | null;
}

export interface GoalMilestone {
  id: string;
  goalId: string;
  title: string;
  done: boolean;
  parts: Record<string, string>;
}

export interface GoalEvent {
  id: string;
  goalId: string;
  actorId: string;
  note: string;
  at: string;
}

export interface GoalCheckin {
  goalId: string;
  userId: string;
  week: string;
  win: string;
  myPart: string;
  need: string;
  blocker: string;
}

export interface GoalRecord {
  id: string;
  coupleId: string;
  type: GoalType;
  title: string;
  status: GoalStatus;
  createdAt: string;
  updatedAt: string;
}

export interface GoalCard {
  id: string;
  type: GoalType;
  title: string;
  status: GoalStatus;
  mine: { version: string; why: string } | null;
  partner: { version: string; why: string } | null;
  bothSubmitted: boolean;
  milestones: Array<{ id: string; title: string; done: boolean; myPart: string; partnerPart: string }>;
  progress: number;
  history: GoalEvent[];
  checkins: GoalCheckin[];
}

/** Shown in the product. Tested so guilt, streaks, and shame never slip in. */
export const GOALS_UI_COPY = [
  "Both of you own this. Neither person is only the helper.",
  "Write your version privately. Your partner's version appears after you have both submitted.",
  "Ten quiet minutes: one win, your part this week, what you need, and one blocker.",
  "Milestone complete. That is worth noticing.",
  "Pausing this goal leaves the others as they are.",
  "Private dreams stay on Shared Dreams until you choose to share one.",
  "Weekly forecast and support asks still live with Shared Dreams.",
] as const;

const GUILT = /streak|guilt|shame|you failed|fell behind|disappoint/i;

export function goalsCopyIsClean(lines: readonly string[] = GOALS_UI_COPY): boolean {
  return lines.every((line) => !GUILT.test(line));
}

export function bothDraftsSubmitted(drafts: GoalDraft[], memberIds: string[]): boolean {
  return memberIds.every((id) => drafts.some((draft) => draft.authorId === id && draft.submittedAt));
}

export function projectGoal(input: {
  goal: GoalRecord;
  drafts: GoalDraft[];
  milestones: GoalMilestone[];
  events: GoalEvent[];
  checkins: GoalCheckin[];
  uid: string;
  partnerId: string | null;
  memberIds: string[];
}): GoalCard {
  const mine = input.drafts.find((draft) => draft.authorId === input.uid) ?? null;
  const revealed = bothDraftsSubmitted(input.drafts, input.memberIds);
  const partner = revealed && input.partnerId ? input.drafts.find((draft) => draft.authorId === input.partnerId) ?? null : null;
  const milestones = input.goal.status === "drafting"
    ? []
    : input.milestones.filter((item) => item.goalId === input.goal.id).map((item) => ({
        id: item.id,
        title: item.title,
        done: item.done,
        myPart: item.parts[input.uid] ?? "",
        partnerPart: input.partnerId ? item.parts[input.partnerId] ?? "" : "",
      }));
  const progress = milestones.length ? Math.round((milestones.filter((item) => item.done).length / milestones.length) * 100) : 0;
  return {
    id: input.goal.id,
    type: input.goal.type,
    title: input.goal.title,
    status: input.goal.status,
    mine: mine ? { version: mine.version, why: mine.why } : null,
    partner: partner ? { version: partner.version, why: partner.why } : null,
    bothSubmitted: revealed,
    milestones,
    progress,
    history: input.goal.status === "drafting" ? [] : input.events.filter((event) => event.goalId === input.goal.id),
    checkins: input.checkins.filter((item) => item.goalId === input.goal.id && (item.userId === input.uid || revealed)),
  };
}

export function cleanLine(value: string, label: string, max = 200): string {
  const text = value.trim();
  if (!text) throw new Error(`Add ${label}.`);
  if (text.length > max) throw new Error(`${label} needs to stay under ${max} characters.`);
  return text;
}

export function pauseChangesOnly(goals: GoalRecord[], id: string): GoalRecord[] {
  return goals.map((goal) => (goal.id === id ? { ...goal, status: goal.status === "active" ? "paused" : goal.status } : goal));
}
