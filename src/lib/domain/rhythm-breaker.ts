/**
 * Rhythm Breaker (Module E, 2026-10-08): turns the rut signals in triggers.ts
 * into a few cards with something specific to do, plus the life-change log
 * that raises the check-in rhythm for six weeks.
 *
 * Cards never name or blame a partner, never nag (each can be put off for a
 * week, per person), and only use what both partners can already see: the
 * shared activity log, quick check-ins from weeks you BOTH answered, life
 * changes and standing dates. Pure functions.
 */
import { UserFacingError, type Activity, type DateRule, type LifeChangeInput, type LifeChangeKind, type PulseEntry } from "@/lib/backend/types";
import { addDays, parseISODate, previousWeekStart, toISODate, weekStartOf, type ISODate } from "./dates";
import { evaluateRhythm, type SignalKind, type SuggestionKind } from "./triggers";

export const LIFE_CHANGE_KINDS: readonly LifeChangeKind[] = ["new_job", "new_schedule", "move", "other", "trip", "work_stretch"];
export const LIFE_CHANGE_COPY: Record<LifeChangeKind, { label: string; emoji: string; effect: string }> = {
  new_job: { label: "New job", emoji: "💼", effect: "Check-ins come a little more often for six weeks." },
  new_schedule: { label: "New schedule", emoji: "🗓", effect: "Check-ins come a little more often for six weeks." },
  move: { label: "A move", emoji: "📦", effect: "Check-ins come a little more often for six weeks." },
  other: { label: "Something else big", emoji: "✨", effect: "Check-ins come a little more often for six weeks." },
  trip: { label: "A trip apart", emoji: "🧳", effect: "Any hints set for times apart show while it's on." },
  work_stretch: { label: "A long work stretch", emoji: "🛠", effect: "Any hints set for times apart show while it's on." },
};

/** Big changes speed up the rhythm; time apart (a trip, a long work stretch) only unlocks "when we're apart" hints. */
export const BOOSTING_KINDS: readonly LifeChangeKind[] = ["new_job", "new_schedule", "move", "other"];
export function boostingChanges<T extends { kind: LifeChangeKind }>(changes: T[]): T[] {
  return changes.filter((c) => BOOSTING_KINDS.includes(c.kind));
}
export const LIFE_CHANGE_NOTE_MAX = 280;
/** A change can be logged ahead of time (a move next month), up to this far. */
export const LIFE_CHANGE_AHEAD_DAYS = 180;

export interface CleanLifeChange {
  kind: LifeChangeKind;
  happenedOn: ISODate;
  note: string | null;
}

export function checkLifeChange(input: LifeChangeInput, today: Date): CleanLifeChange {
  if (!LIFE_CHANGE_KINDS.includes(input.kind)) throw new UserFacingError("Pick what changed.");
  let day: Date;
  try {
    day = parseISODate(input.happenedOn);
  } catch {
    throw new UserFacingError("Pick when it happened.");
  }
  if (toISODate(day) !== input.happenedOn || input.happenedOn <= "2000-01-01") throw new UserFacingError("Pick when it happened.");
  if (input.happenedOn > toISODate(addDays(today, LIFE_CHANGE_AHEAD_DAYS))) throw new UserFacingError("That's more than six months away. Log it closer to the time.");
  const note = (input.note ?? "").trim() || null;
  if (note && Array.from(note).length > LIFE_CHANGE_NOTE_MAX) throw new UserFacingError(`Keep the note under ${LIFE_CHANGE_NOTE_MAX} characters.`);
  return { kind: input.kind, happenedOn: input.happenedOn, note };
}

export interface CardAction {
  label: string;
  href: string;
}

export interface RhythmCard {
  /** One card per signal; also the snooze key. */
  id: SignalKind;
  message: string;
  actions: CardAction[];
}

const ACTION_FOR: Record<SuggestionKind, CardAction> = {
  new_category: { label: "Find a new kind of date", href: "/plans/ideas/" },
  standing_date: { label: "Set a standing date night", href: "/plans/standing/" },
  surprise: { label: "Send a little note", href: "/checkin/notes/" },
  tech_free_night: { label: "Plan a tech-free night with Buddy", href: "/us/buddy/" },
};

/** Which suggestions answer which signal. */
const SUGGESTIONS_FOR: Record<SignalKind, SuggestionKind[]> = {
  category_rut: ["new_category"],
  little_time: ["standing_date", "new_category"],
  excitement_drop: ["surprise", "tech_free_night"],
  life_change: ["standing_date"],
};

export interface RhythmCardsInput {
  activities: Activity[];
  /** Exactly what pulse.history returns: your own weeks, and your partner's only for weeks you both answered. */
  pulses: PulseEntry[];
  lifeChanges: Array<{ kind: LifeChangeKind; happenedOn: ISODate }>;
  rules: DateRule[];
  today: Date;
  /** Signal kind -> snoozed until (inclusive), for this person. */
  snoozed?: Partial<Record<SignalKind, ISODate>>;
}

/**
 * The cards to show now: at most two, each with one or two specific things to
 * do. A couple that already has an active standing date isn't told to set one.
 */
export function rhythmCards(input: RhythmCardsInput): RhythmCard[] {
  const today = toISODate(input.today);
  const { signals } = evaluateRhythm({
    activities: input.activities.map((a) => ({ happenedOn: a.happenedOn, category: a.category })),
    pulses: input.pulses.map((p) => ({ userId: p.userId, weekStart: p.weekStart, excitement: p.excitement, connection: p.connection })),
    lifeChanges: boostingChanges(input.lifeChanges).map((c) => ({ date: c.happenedOn, kind: c.kind as "new_job" | "new_schedule" | "move" | "other" })),
    today: input.today,
  });
  const hasStandingDate = input.rules.some((r) => r.active);
  // A dip in quick check-ins nobody has followed up on in two weeks is old news, not a nudge.
  const staleBefore = previousWeekStart(weekStartOf(input.today), 2);
  const cards: RhythmCard[] = [];
  for (const signal of signals) {
    const until = input.snoozed?.[signal.kind];
    if (until && until >= today) continue;
    if (signal.kind === "excitement_drop" && String(signal.detail?.weekStart ?? "") < staleBefore) continue;
    const actions = SUGGESTIONS_FOR[signal.kind]
      .filter((k) => !(k === "standing_date" && hasStandingDate))
      .map((k) => ACTION_FOR[k]);
    // The life-change card is still worth showing without an action: it explains the faster rhythm.
    if (!actions.length && signal.kind !== "life_change") continue;
    cards.push({ id: signal.kind, message: signal.message, actions: actions.slice(0, 2) });
  }
  return cards.slice(0, 2);
}

// --- "Not now" (per person, per device) -------------------------------------

export const SNOOZE_DAYS = 7;
const snoozeKey = (userId: string) => `spark-rhythm-snooze:${userId}`;

export function snoozedUntil(today: Date, days = SNOOZE_DAYS): ISODate {
  return toISODate(addDays(today, days - 1));
}

export function loadSnoozes(userId: string): Partial<Record<SignalKind, ISODate>> {
  try {
    const raw = localStorage.getItem(snoozeKey(userId));
    const value: unknown = raw ? JSON.parse(raw) : {};
    if (!value || typeof value !== "object") return {};
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([, v]) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v))) as Partial<Record<SignalKind, ISODate>>;
  } catch {
    return {};
  }
}

export function saveSnooze(userId: string, kind: SignalKind, today: Date): Partial<Record<SignalKind, ISODate>> {
  const next = { ...loadSnoozes(userId), [kind]: snoozedUntil(today) };
  try {
    localStorage.setItem(snoozeKey(userId), JSON.stringify(next));
  } catch {
    // storage blocked: the card stays hidden for this visit only
  }
  return next;
}
