/**
 * Validation for the shared calendar (date plans), projects and money goals,
 * shared by the live backend, the demo backend and the forms. Mirrors the
 * database constraints in 20261006000300/20261006000400.
 */
import { UserFacingError, type DatePlanInput, type MoneyGoalInput, type ProjectInput, type ProjectKind, type ProjectStatus } from "@/lib/backend/types";
import { parseISODate } from "./dates";

export const PLAN_TITLE_MAX = 120;
export const PLAN_NOTE_MAX = 500;
export const PROJECT_TITLE_MAX = 120;
export const PROJECT_NOTE_MAX = 1000;
export const GOAL_TITLE_MAX = 80;
/** $10,000,000 in cents: a sanity ceiling, not a judgment. */
export const MONEY_MAX_CENTS = 1_000_000_000;

export const PROJECT_KINDS: readonly ProjectKind[] = ["home", "family", "money", "trip", "other"];
export const PROJECT_STATUSES: readonly ProjectStatus[] = ["planned", "active", "done"];

export const PROJECT_KIND_COPY: Record<ProjectKind, { label: string; emoji: string }> = {
  home: { label: "Home", emoji: "🔨" },
  family: { label: "Family", emoji: "🍼" },
  money: { label: "Money", emoji: "💵" },
  trip: { label: "Trip", emoji: "🧳" },
  other: { label: "Other", emoji: "📌" },
};

export const PROJECT_STATUS_COPY: Record<ProjectStatus, string> = {
  planned: "Not started",
  active: "In progress",
  done: "Done",
};

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const chars = (s: string) => Array.from(s).length;

function checkDate(value: string | null | undefined, label: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  try {
    parseISODate(value);
  } catch {
    throw new UserFacingError(`Pick a valid ${label}.`);
  }
  return value;
}

function checkCents(value: number | null | undefined, label: string, allowNull: boolean): number | null {
  if (value === null || value === undefined) {
    if (allowNull) return null;
    return 0;
  }
  if (!Number.isInteger(value) || value < 0 || value > MONEY_MAX_CENTS) throw new UserFacingError(`Enter a valid ${label}.`);
  return value;
}

export function checkDatePlan(input: DatePlanInput): Required<DatePlanInput> {
  const title = (input.title ?? "").replace(/\s+/g, " ").trim();
  if (!title) throw new UserFacingError("Give the plan a short title.");
  if (chars(title) > PLAN_TITLE_MAX) throw new UserFacingError(`Keep the title under ${PLAN_TITLE_MAX} characters.`);
  const plannedFor = checkDate(input.plannedFor, "day");
  if (!plannedFor) throw new UserFacingError("Pick a day.");
  const time = input.time ? input.time : null;
  if (time && !TIME_RE.test(time)) throw new UserFacingError("Pick a valid time.");
  const note = input.note?.trim() || null;
  if (note && chars(note) > PLAN_NOTE_MAX) throw new UserFacingError(`Keep the note under ${PLAN_NOTE_MAX} characters.`);
  return { title, plannedFor, time, note };
}

export function checkProject(input: Partial<ProjectInput>, partial = false): Partial<ProjectInput> {
  const out: Partial<ProjectInput> = {};
  if (!partial || input.title !== undefined) {
    const title = (input.title ?? "").replace(/\s+/g, " ").trim();
    if (!title) throw new UserFacingError("Give the project a short name.");
    if (chars(title) > PROJECT_TITLE_MAX) throw new UserFacingError(`Keep the name under ${PROJECT_TITLE_MAX} characters.`);
    out.title = title;
  }
  if (!partial || input.kind !== undefined) {
    if (!PROJECT_KINDS.includes(input.kind as ProjectKind)) throw new UserFacingError("Pick what kind of project it is.");
    out.kind = input.kind;
  }
  if (input.status !== undefined) {
    if (!PROJECT_STATUSES.includes(input.status)) throw new UserFacingError("Pick a valid status.");
    out.status = input.status;
  }
  if (input.targetDate !== undefined) out.targetDate = checkDate(input.targetDate, "target date");
  if (input.budgetCents !== undefined) out.budgetCents = checkCents(input.budgetCents, "budget", true);
  if (input.note !== undefined) {
    const note = input.note?.trim() || null;
    if (note && chars(note) > PROJECT_NOTE_MAX) throw new UserFacingError(`Keep the note under ${PROJECT_NOTE_MAX} characters.`);
    out.note = note;
  }
  return out;
}

export function checkGoal(input: Partial<MoneyGoalInput>, partial = false): Partial<MoneyGoalInput> {
  const out: Partial<MoneyGoalInput> = {};
  if (!partial) {
    if (input.scope !== "mine" && input.scope !== "joint") throw new UserFacingError("Pick whose goal this is.");
    out.scope = input.scope;
  }
  if (!partial || input.title !== undefined) {
    const title = (input.title ?? "").replace(/\s+/g, " ").trim();
    if (!title) throw new UserFacingError("Name the goal.");
    if (chars(title) > GOAL_TITLE_MAX) throw new UserFacingError(`Keep the name under ${GOAL_TITLE_MAX} characters.`);
    out.title = title;
  }
  if (!partial || input.savedCents !== undefined) out.savedCents = checkCents(input.savedCents, "amount saved", false) ?? 0;
  if (input.targetCents !== undefined) out.targetCents = checkCents(input.targetCents, "target", true);
  if (input.targetDate !== undefined) out.targetDate = checkDate(input.targetDate, "target date");
  if (input.visibleToPartner !== undefined) out.visibleToPartner = !!input.visibleToPartner;
  return out;
}

/** "$1,250" or "$1,250.50" from cents. */
export function formatMoney(cents: number | null | undefined): string {
  const value = (cents ?? 0) / 100;
  return value.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2 });
}

/** Parses "1,250", "$1250.50" or "1250" into cents, or null when it isn't a number. */
export function parseMoney(text: string): number | null {
  const clean = (text ?? "").replace(/[$,\s]/g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(clean)) return null;
  return Math.round(Number(clean) * 100);
}

/** Monthly amount still needed to reach a target by its date (null when no date/target or already met). */
export function monthlyToTarget(savedCents: number, targetCents: number | null, targetDate: string | null, today = new Date()): number | null {
  if (!targetCents || !targetDate || savedCents >= targetCents) return null;
  const target = parseISODate(targetDate);
  const months = (target.getFullYear() - today.getFullYear()) * 12 + (target.getMonth() - today.getMonth());
  const remaining = targetCents - savedCents;
  return months <= 0 ? remaining : Math.ceil(remaining / months);
}
