/**
 * Live date ideas. Listing and status changes go straight to Postgres (RLS: the
 * couple's own ideas only). Generation runs in the "date-ideas" Edge Function,
 * which holds the Claude key and only ever sends city, titles, categories and ratings.
 */
import { isIdeaStatus } from "@/components/plans/rules";
import { UserFacingError, type Backend, type DateIdea, type IdeaBatch } from "../types";
import { fail, invoke, requireCoupleId, supabase } from "./client";

type Row = {
  id: string;
  batch_id: string;
  title: string;
  description: string;
  category: DateIdea["category"];
  budget: DateIdea["budget"];
  duration: DateIdea["duration"];
  time_of_day: DateIdea["timeOfDay"];
  weather: DateIdea["weather"];
  why: string | null;
  source: DateIdea["source"];
  status: DateIdea["status"];
  created_at: string;
};

const COLUMNS = "id, batch_id, title, description, category, budget, duration, time_of_day, weather, why, source, status, created_at";

const toIdea = (r: Row): DateIdea => ({
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

export const ideas: Backend["ideas"] = {
  async list() {
    const coupleId = await requireCoupleId();
    const { data, error } = await supabase()
      .from("date_ideas")
      .select(COLUMNS)
      .eq("couple_id", coupleId)
      .order("created_at", { ascending: false });
    if (error) fail(error, "Could not load your date ideas.");
    return ((data ?? []) as Row[]).map(toIdea);
  },

  async generate() {
    await requireCoupleId();
    const result = await invoke<IdeaBatch>("date-ideas", { action: "generate", month: new Date().getMonth() + 1 });
    if (!result || !Array.isArray(result.ideas)) throw new UserFacingError("No ideas came back. Please try again.");
    return { ideas: result.ideas, notice: typeof result.notice === "string" ? result.notice : null };
  },

  async setStatus(ideaId, status) {
    if (!isIdeaStatus(status)) throw new UserFacingError("Unknown status.");
    const coupleId = await requireCoupleId();
    const { data, error } = await supabase()
      .from("date_ideas")
      .update({ status })
      .eq("id", ideaId)
      .eq("couple_id", coupleId)
      .select("id");
    if (error) fail(error, "Could not update this idea.");
    if (!data || data.length === 0) throw new UserFacingError("That idea is no longer available.");
  },
};
