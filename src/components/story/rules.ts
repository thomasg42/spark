/**
 * Our Story rules shared by the live backend, the demo backend and the form.
 * Plain module (no React): the limits mirror the story_entries CHECK
 * constraints, and the timeline order is oldest first with undated entries last.
 */
import { STORY_KINDS, type StoryKind } from "@/lib/domain/categories";
import type { ISODate } from "@/lib/domain/dates";
import { UserFacingError, type StoryEntry, type StoryInput } from "@/lib/backend/types";

export const STORY_TITLE_MAX = 120;
export const STORY_BODY_MAX = 4000;

/** The classic firsts offered as quick starts on an empty (or young) timeline. */
export const CLASSIC_FIRSTS: readonly StoryKind[] = ["how_we_met", "together", "first_date", "first_kiss", "met_family"];

/** Yearly reminders start ON for the dates couples usually celebrate. */
export function remindsByDefault(kind: StoryKind): boolean {
  return kind === "together" || kind === "anniversary";
}

export function isStoryKind(value: unknown): value is StoryKind {
  return typeof value === "string" && (STORY_KINDS as readonly string[]).includes(value);
}

/** True for a real calendar date written as YYYY-MM-DD (rejects 2026-02-31). */
export function isRealDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 1900 || y > 2199) return false;
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

export interface StoryFields {
  kind: StoryKind;
  title: string;
  happenedOn: ISODate | null;
  body: string | null;
  remindYearly: boolean;
}

/**
 * Trims and validates an entry before anything is uploaded or written.
 * Lengths are checked in UTF-16 units, which is never more lenient than the
 * database's character count.
 */
export function cleanStoryInput(input: StoryInput): StoryFields {
  if (!isStoryKind(input.kind)) throw new UserFacingError("Pick what kind of moment this is.");
  const title = (input.title ?? "").trim();
  if (!title) throw new UserFacingError("Give this moment a short title.");
  if (title.length > STORY_TITLE_MAX) throw new UserFacingError(`Titles can be up to ${STORY_TITLE_MAX} characters.`);
  const body = (input.body ?? "").trim();
  if (body.length > STORY_BODY_MAX) throw new UserFacingError("Notes can be up to 4,000 characters.");
  const happenedOn = (input.happenedOn ?? "").trim();
  if (happenedOn && !isRealDate(happenedOn)) throw new UserFacingError("That date doesn't look right. Try picking it again.");
  return {
    kind: input.kind,
    title,
    happenedOn: happenedOn || null,
    body: body || null,
    remindYearly: Boolean(input.remindYearly),
  };
}

type Sortable = Pick<StoryEntry, "id" | "happenedOn" | "createdAt">;

function compareTimestamps(a: string, b: string): number {
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (!Number.isNaN(ta) && !Number.isNaN(tb) && ta !== tb) return ta - tb;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Timeline order: by date (oldest first), undated last, then by when it was added. */
export function compareStory(a: Sortable, b: Sortable): number {
  if (a.happenedOn !== b.happenedOn) {
    if (!a.happenedOn) return 1;
    if (!b.happenedOn) return -1;
    return a.happenedOn < b.happenedOn ? -1 : 1;
  }
  const byCreated = compareTimestamps(a.createdAt, b.createdAt);
  if (byCreated !== 0) return byCreated;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function sortStory<T extends Sortable>(entries: readonly T[]): T[] {
  return [...entries].sort(compareStory);
}

/** Replaces an entry by id (or adds it) and keeps timeline order. */
export function upsertStory(entries: readonly StoryEntry[], entry: StoryEntry): StoryEntry[] {
  return sortStory([...entries.filter((e) => e.id !== entry.id), entry]);
}

export interface StoryYearGroup {
  key: string;
  label: string;
  entries: StoryEntry[];
}

/** Groups an already sorted timeline by year; undated entries form the last group. */
export function groupByYear(entries: readonly StoryEntry[]): StoryYearGroup[] {
  const groups: StoryYearGroup[] = [];
  for (const entry of entries) {
    const key = entry.happenedOn ? entry.happenedOn.slice(0, 4) : "undated";
    let group = groups.find((g) => g.key === key);
    if (!group) {
      group = { key, label: key === "undated" ? "No date yet" : key, entries: [] };
      groups.push(group);
    }
    group.entries.push(entry);
  }
  return groups;
}

/** Classic firsts the couple has not added yet, in their natural order. */
export function missingFirsts(entries: readonly Pick<StoryEntry, "kind">[]): StoryKind[] {
  const have = new Set(entries.map((e) => e.kind));
  return CLASSIC_FIRSTS.filter((k) => !have.has(k));
}
