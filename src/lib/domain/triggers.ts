/**
 * Rhythm signals (trigger logic). Pure functions, so they can be unit tested and
 * reused by the Phase 2 Rhythm Breaker engine and the Phase 3 hint triggers.
 *
 * Signals never name or blame a partner: "excitement has dipped two weeks running",
 * never "Sam's excitement dropped".
 */
import { ACTIVITY_CATEGORIES, type ActivityCategory } from "./categories";
import { LIFE_CHANGE_BOOST_DAYS } from "./cadence";
import { addDays, daysBetween, parseISODate, previousWeekStart, toISODate, weekStartOf, type ISODate } from "./dates";

export interface ActivityLite {
  happenedOn: ISODate;
  category: ActivityCategory;
}

export interface PulseLite {
  userId: string;
  weekStart: ISODate;
  excitement: number;
  connection: number;
}

export interface LifeChangeLite {
  date: ISODate;
  kind: "new_job" | "new_schedule" | "move" | "other";
}

export type SignalKind = "category_rut" | "excitement_drop" | "little_time" | "life_change";

export interface Signal {
  kind: SignalKind;
  message: string;
  detail?: Record<string, unknown>;
}

export const RUT_WEEKS = 3;
export const RUT_MAX_CATEGORIES = 2;
export const LITTLE_TIME_DAYS = 14;

/**
 * Same activity categories for 3+ weeks: each of the last RUT_WEEKS complete-or-current
 * weeks has at least one activity, and across them the couple used at most
 * RUT_MAX_CATEGORIES categories.
 */
export function detectCategoryRut(activities: ActivityLite[], today: Date, weeks = RUT_WEEKS): Signal | null {
  const thisWeek = weekStartOf(today);
  const windows: ISODate[] = Array.from({ length: weeks }, (_, i) => previousWeekStart(thisWeek, i));
  const used = new Set<ActivityCategory>();
  for (const start of windows) {
    const end = toISODate(addDays(parseISODate(start), 6));
    const inWeek = activities.filter((a) => a.happenedOn >= start && a.happenedOn <= end);
    if (inWeek.length === 0) return null;
    inWeek.forEach((a) => used.add(a.category));
  }
  if (used.size > RUT_MAX_CATEGORIES) return null;
  const untried = ACTIVITY_CATEGORIES.filter((c) => !used.has(c));
  return {
    kind: "category_rut",
    message: `You've stuck to the same ${used.size === 1 ? "kind of plan" : "couple of plans"} for ${weeks} weeks. Something new could spark things up.`,
    detail: { categories: [...used], untried },
  };
}

/**
 * Excitement dropping two weeks in a row: for either partner, three consecutive
 * weekly scores that strictly decrease (w-2 > w-1 > w). Missing weeks break the chain.
 */
export function detectExcitementDrop(pulses: PulseLite[]): Signal | null {
  const byUser = new Map<string, Map<ISODate, number>>();
  for (const p of pulses) {
    if (!byUser.has(p.userId)) byUser.set(p.userId, new Map());
    byUser.get(p.userId)!.set(p.weekStart, p.excitement);
  }
  for (const weeks of byUser.values()) {
    const latest = [...weeks.keys()].sort().at(-1);
    if (!latest) continue;
    const w0 = weeks.get(latest);
    const w1 = weeks.get(previousWeekStart(latest, 1));
    const w2 = weeks.get(previousWeekStart(latest, 2));
    if (w0 !== undefined && w1 !== undefined && w2 !== undefined && w2 > w1 && w1 > w0) {
      return {
        kind: "excitement_drop",
        message: "Excitement has dipped two weeks running. A small change of pace could help, no blame needed.",
        detail: { weekStart: latest },
      };
    }
  }
  return null;
}

/**
 * Little time together: nothing logged for LITTLE_TIME_DAYS days, for couples who
 * have logged at least one activity before (so brand-new couples aren't nagged).
 */
export function detectLittleTime(activities: ActivityLite[], today: Date, days = LITTLE_TIME_DAYS): Signal | null {
  if (activities.length === 0) return null;
  const latest = activities.map((a) => a.happenedOn).sort().at(-1)!;
  const gap = daysBetween(parseISODate(latest), today);
  if (gap < days) return null;
  return {
    kind: "little_time",
    message: `It's been ${gap} days since your last logged time together. Want to plan something easy?`,
    detail: { daysSinceLast: gap },
  };
}

/** A big life change in the last six weeks raises the check-in rhythm. */
export function detectLifeChange(changes: LifeChangeLite[], today: Date): Signal | null {
  const active = changes
    .filter((c) => {
      const age = daysBetween(parseISODate(c.date), today);
      return age >= 0 && age < LIFE_CHANGE_BOOST_DAYS;
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const latest = active[0];
  if (!latest) return null;
  const until = toISODate(addDays(parseISODate(latest.date), LIFE_CHANGE_BOOST_DAYS));
  return {
    kind: "life_change",
    message: "Big changes are a lot. Check-ins are a little more frequent for a few weeks.",
    detail: { kind: latest.kind, until },
  };
}

export type SuggestionKind = "standing_date" | "new_category" | "surprise" | "tech_free_night";

export interface Suggestion {
  kind: SuggestionKind;
  title: string;
  body: string;
}

export interface RhythmInput {
  activities: ActivityLite[];
  pulses: PulseLite[];
  lifeChanges: LifeChangeLite[];
  today: Date;
}

/** All active signals plus specific, supportive suggestions (never pressure). */
export function evaluateRhythm(input: RhythmInput): { signals: Signal[]; suggestions: Suggestion[] } {
  const signals = [
    detectCategoryRut(input.activities, input.today),
    detectExcitementDrop(input.pulses),
    detectLittleTime(input.activities, input.today),
    detectLifeChange(input.lifeChanges, input.today),
  ].filter((s): s is Signal => s !== null);

  const suggestions: Suggestion[] = [];
  const kinds = new Set(signals.map((s) => s.kind));
  if (kinds.has("category_rut")) {
    const untried = (signals.find((s) => s.kind === "category_rut")?.detail?.untried as ActivityCategory[]) ?? [];
    suggestions.push({
      kind: "new_category",
      title: "Try a new kind of date",
      body: untried.length ? `Pick something ${untried.slice(0, 2).join(" or ")} this week.` : "Pick something you've never done together.",
    });
  }
  if (kinds.has("little_time") || kinds.has("life_change")) {
    suggestions.push({
      kind: "standing_date",
      title: "Set a standing date night",
      body: "Same night every week, for example Wednesday 6 to 9 PM: date night, then you each wind down your own way.",
    });
  }
  if (kinds.has("excitement_drop")) {
    suggestions.push({ kind: "surprise", title: "Plan a small surprise", body: "Low cost, high thought: their favorite snack, a note, a plan they don't have to organize." });
    suggestions.push({ kind: "tech_free_night", title: "Tech-free night", body: "Phones in a drawer for one evening. Cook, walk, play a game, talk." });
  }
  return { signals, suggestions };
}
