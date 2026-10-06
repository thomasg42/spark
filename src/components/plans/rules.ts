/**
 * Activity log rules shared by the live backend, the demo backend and the form,
 * mirroring the database constraints (title 1..120, note <= 2000, rating 1..5).
 * Plain module: safe to import anywhere.
 */
import { UserFacingError, type ActivityInput, type IdeaStatus } from "@/lib/backend/types";
import { isActivityCategory } from "@/lib/domain/categories";
import { addDays, parseISODate, toISODate } from "@/lib/domain/dates";

export const ACTIVITY_TITLE_MAX = 120;
export const ACTIVITY_NOTE_MAX = 2000;
export const IDEA_STATUSES: readonly IdeaStatus[] = ["new", "saved", "done", "dismissed"];

/** Latest allowed date: tomorrow (time zones and late-night logging), in local time. */
export function latestActivityDate(today = new Date()): string {
  return toISODate(addDays(today, 1));
}

export function isValidRating(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5;
}

export function isIdeaStatus(value: unknown): value is IdeaStatus {
  return typeof value === "string" && (IDEA_STATUSES as readonly string[]).includes(value);
}

/** Returns a friendly problem for each invalid field (empty object when valid). */
export function activityProblems(
  input: Pick<ActivityInput, "title" | "happenedOn" | "category" | "note">,
  today = new Date(),
): Partial<Record<"title" | "happenedOn" | "category" | "note", string>> {
  const problems: Partial<Record<"title" | "happenedOn" | "category" | "note", string>> = {};
  const title = (input.title ?? "").trim();
  if (!title) problems.title = "Give it a short title.";
  else if (Array.from(title).length > ACTIVITY_TITLE_MAX) problems.title = `Keep the title under ${ACTIVITY_TITLE_MAX} characters.`;

  let date: Date | null = null;
  try {
    date = input.happenedOn ? parseISODate(input.happenedOn) : null;
  } catch {
    date = null;
  }
  if (!date || Number.isNaN(date.getTime()) || toISODate(date) !== input.happenedOn) problems.happenedOn = "Pick the date it happened.";
  else if (input.happenedOn > latestActivityDate(today)) problems.happenedOn = "That date is in the future. Log it once it happens.";
  else if (input.happenedOn < "1900-01-01") problems.happenedOn = "Please pick a real date.";

  if (!isActivityCategory(input.category)) problems.category = "Pick a category.";
  if (input.note && Array.from(input.note.trim()).length > ACTIVITY_NOTE_MAX) problems.note = `Keep the note under ${ACTIVITY_NOTE_MAX} characters.`;
  return problems;
}

/** Validates and normalizes an activity, throwing the first problem as a UserFacingError. */
export function checkActivityInput(input: ActivityInput, today = new Date()) {
  const problems = activityProblems(input, today);
  const first = problems.title ?? problems.happenedOn ?? problems.category ?? problems.note;
  if (first) throw new UserFacingError(first);
  return {
    title: input.title.trim(),
    happenedOn: input.happenedOn,
    category: input.category,
    note: input.note?.trim() || null,
    sourceIdeaId: input.sourceIdeaId || null,
  };
}

export function checkRating(rating: number) {
  if (!isValidRating(rating)) throw new UserFacingError("Pick a rating from 1 to 5.");
}
