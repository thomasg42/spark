/**
 * "date-ideas" Edge Function logic, kept free of Deno APIs so it is unit tested in Node
 * with an in-memory repository and a fake JsonGenerator.
 *
 * Runs with the signed-in user's JWT (RLS applies to every read and write). Date ideas
 * are not sensitive, so nothing here is encrypted. Only city, month, titles, categories
 * and ratings are ever sent to Claude: never notes, photos, names or private answers.
 * Nothing about the couple's data is logged.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { dbError, HttpError, type Handler } from "./http.ts";
import type { JsonGenerator, JsonResult } from "./llm.ts";
import {
  buildIdeaInput,
  buildIdeasPrompt,
  finalizeIdeas,
  IDEAS_PER_BATCH,
  IDEAS_SCHEMA,
  MAX_BATCHES_PER_DAY,
  parseIdeas,
  type ActivityFact,
  type FinalIdea,
  type IdeaBudget,
  type IdeaCategory,
  type IdeaDuration,
  type IdeaTimeOfDay,
  type IdeaWeather,
} from "./date-ideas.ts";

export interface IdeaRow {
  id: string;
  batch_id: string;
  title: string;
  description: string;
  category: IdeaCategory;
  budget: IdeaBudget;
  duration: IdeaDuration;
  time_of_day: IdeaTimeOfDay;
  weather: IdeaWeather;
  why: string | null;
  source: "claude" | "fallback";
  status: "new" | "saved" | "done" | "dismissed";
  created_at: string;
}

export type NewIdeaRow = Omit<IdeaRow, "id" | "status" | "created_at">;

/** Same shape as DateIdea in src/lib/backend/types.ts (camelCase). */
export interface DateIdeaDto {
  id: string;
  batchId: string;
  title: string;
  description: string;
  category: IdeaCategory;
  budget: IdeaBudget;
  duration: IdeaDuration;
  timeOfDay: IdeaTimeOfDay;
  weather: IdeaWeather;
  why: string | null;
  source: "claude" | "fallback";
  status: IdeaRow["status"];
  createdAt: string;
}

export interface GenerateResponse {
  ideas: DateIdeaDto[];
  notice: string | null;
}

/** Everything the handler reads or writes, as the signed-in user. */
export interface DateIdeasRepo {
  /** The caller's couple and its city, or null if they are not paired. */
  couple(): Promise<{ id: string; city: string | null } | null>;
  /** Titles, categories, dates and ratings only (newest first). Never notes or photos. */
  activityFacts(coupleId: string): Promise<ActivityFact[]>;
  /** Titles of every idea the couple has already been shown (newest first). */
  ideaTitles(coupleId: string): Promise<string[]>;
  /** Number of distinct generation batches created since the given ISO time. */
  batchesSince(coupleId: string, sinceIso: string): Promise<number>;
  insertIdeas(coupleId: string, rows: NewIdeaRow[]): Promise<IdeaRow[]>;
}

const IDEA_COLUMNS = "id, batch_id, title, description, category, budget, duration, time_of_day, weather, why, source, status, created_at";

export function createSupabaseDateIdeasRepo(supabase: SupabaseClient, userId: string): DateIdeasRepo {
  return {
    async couple() {
      const { data: member, error } = await supabase.from("couple_members").select("couple_id").eq("user_id", userId).maybeSingle();
      if (error) dbError(error, "Could not load your couple.");
      if (!member) return null;
      const { data: couple, error: cErr } = await supabase.from("couples").select("id, city").eq("id", member.couple_id).single();
      if (cErr) dbError(cErr, "Could not load your couple.");
      return { id: couple.id as string, city: (couple.city as string | null) ?? null };
    },
    async activityFacts(coupleId) {
      const [{ data: acts, error }, { data: ratings, error: rErr }] = await Promise.all([
        supabase
          .from("activities")
          .select("id, title, category, happened_on")
          .eq("couple_id", coupleId)
          .order("happened_on", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(1000),
        supabase.from("activity_ratings").select("activity_id, rating").eq("couple_id", coupleId).limit(2000),
      ]);
      if (error) dbError(error, "Could not load your activities.");
      if (rErr) dbError(rErr, "Could not load your ratings.");
      const byActivity = new Map<string, number[]>();
      for (const r of (ratings ?? []) as Array<{ activity_id: string; rating: number }>) {
        const list = byActivity.get(r.activity_id) ?? [];
        list.push(Number(r.rating));
        byActivity.set(r.activity_id, list);
      }
      return ((acts ?? []) as Array<{ id: string; title: string; category: string; happened_on: string }>).map((a) => ({
        title: a.title,
        category: a.category,
        happenedOn: a.happened_on,
        ratings: byActivity.get(a.id) ?? [],
      }));
    },
    async ideaTitles(coupleId) {
      const { data, error } = await supabase
        .from("date_ideas")
        .select("title")
        .eq("couple_id", coupleId)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) dbError(error, "Could not load your ideas.");
      return ((data ?? []) as Array<{ title: string }>).map((r) => r.title);
    },
    async batchesSince(coupleId, sinceIso) {
      const { data, error } = await supabase
        .from("date_ideas")
        .select("batch_id")
        .eq("couple_id", coupleId)
        .gte("created_at", sinceIso)
        .limit(1000);
      if (error) dbError(error, "Could not check your recent ideas.");
      return new Set(((data ?? []) as Array<{ batch_id: string }>).map((r) => r.batch_id)).size;
    },
    async insertIdeas(coupleId, rows) {
      const { data, error } = await supabase
        .from("date_ideas")
        .insert(rows.map((r) => ({ ...r, couple_id: coupleId, requested_by: userId })))
        .select(IDEA_COLUMNS);
      if (error) dbError(error, "Could not save your new ideas.");
      const saved = (data ?? []) as IdeaRow[];
      // Keep the order the ideas were chosen in.
      const rank = new Map(rows.map((r, i) => [r.title, i]));
      return saved.sort((a, b) => (rank.get(a.title) ?? 0) - (rank.get(b.title) ?? 0));
    },
  };
}

export const toDateIdea = (r: IdeaRow): DateIdeaDto => ({
  id: r.id,
  batchId: r.batch_id,
  title: r.title,
  description: r.description,
  category: r.category,
  budget: r.budget,
  duration: r.duration,
  timeOfDay: r.time_of_day,
  weather: r.weather,
  why: r.why,
  source: r.source,
  status: r.status,
  createdAt: r.created_at,
});

export const RATE_LIMIT_MESSAGE =
  "That's plenty of fresh ideas for one day. Save the ones you like, and come back tomorrow for more.";

export const NOTICES = {
  noKey: "These ideas come from Spark's own list. AI ideas tailored to your city aren't switched on yet.",
  refusal: "Claude couldn't help with this request, so these ideas come from Spark's own list.",
  unavailable: "Claude was unavailable just now, so these ideas come from Spark's own list. Try again later for ideas tailored to your city.",
  partial: "A few of these come from Spark's own list, so you still get five ideas that aren't repeats.",
} as const;

function noticeFor(result: JsonResult | null, claudeCount: number): string | null {
  if (!result) return NOTICES.noKey;
  if (!result.ok) {
    if (result.reason === "no_key") return NOTICES.noKey;
    if (result.reason === "refusal") return NOTICES.refusal;
    return NOTICES.unavailable;
  }
  if (claudeCount === 0) return NOTICES.unavailable;
  if (claudeCount < IDEAS_PER_BATCH) return NOTICES.partial;
  return null;
}

export interface DateIdeasDeps {
  repo: DateIdeasRepo;
  /** Claude, or null/undefined when ANTHROPIC_API_KEY is not configured. */
  generate?: JsonGenerator | null;
  now?: () => Date;
  newId?: () => string;
}

function parseMonth(value: unknown, now: Date): number {
  if (value === undefined || value === null) return now.getUTCMonth() + 1;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 12) throw new HttpError(400, "Invalid month.");
  return value;
}

export function createDateIdeasHandler(deps: DateIdeasDeps): Handler {
  const now = deps.now ?? (() => new Date());
  const newId = deps.newId ?? (() => crypto.randomUUID());

  return async (body) => {
    if (body.action !== "generate") throw new HttpError(400, "Unknown action.");
    const at = now();
    const month = parseMonth(body.month, at);

    const couple = await deps.repo.couple();
    if (!couple) throw new HttpError(400, "Pair with your partner first.");

    const since = new Date(at.getTime() - 24 * 60 * 60 * 1000).toISOString();
    if ((await deps.repo.batchesSince(couple.id, since)) >= MAX_BATCHES_PER_DAY) throw new HttpError(429, RATE_LIMIT_MESSAGE);

    const [facts, ideaTitles] = await Promise.all([deps.repo.activityFacts(couple.id), deps.repo.ideaTitles(couple.id)]);
    const input = buildIdeaInput({ city: couple.city, month, today: at.toISOString().slice(0, 10), activities: facts, ideaTitles });

    let result: JsonResult | null = null;
    if (deps.generate) {
      const prompt = buildIdeasPrompt(input);
      result = await deps.generate({ system: prompt.system, user: prompt.user, schema: IDEAS_SCHEMA, effort: "low", maxTokens: 6000 });
    }
    const candidates = result?.ok ? parseIdeas(result.json) : [];

    const batchId = newId();
    const { ideas } = finalizeIdeas(candidates, input, batchId);
    const claudeCount = ideas.filter((i) => i.source === "claude").length;

    const rows = await deps.repo.insertIdeas(couple.id, ideas.map((idea: FinalIdea) => toRow(idea, batchId)));
    const response: GenerateResponse = { ideas: rows.map(toDateIdea), notice: noticeFor(result, claudeCount) };
    return response;
  };
}

function toRow(idea: FinalIdea, batchId: string): NewIdeaRow {
  return {
    batch_id: batchId,
    title: idea.title,
    description: idea.description,
    category: idea.category,
    budget: idea.budget,
    duration: idea.duration,
    time_of_day: idea.timeOfDay,
    weather: idea.weather,
    why: idea.why,
    source: idea.source,
  };
}
