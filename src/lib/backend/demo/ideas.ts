/**
 * Demo date ideas (in this browser only). Uses the same input building, repeat
 * filtering and rate limit as the "date-ideas" Edge Function, but always draws
 * from Spark's built-in list: nothing is sent to Claude in demo mode.
 */
import { isIdeaStatus } from "@/components/plans/rules";
import { toISODate } from "@/lib/domain/dates";
import { buildIdeaInput, finalizeIdeas, MAX_BATCHES_PER_DAY } from "@shared/date-ideas.ts";
import { UserFacingError, type Backend, type DateIdea } from "../types";
import { demoStore, myCouple, newId, nowIso, tick } from "./store";

export const DEMO_IDEAS_NOTICE = "Demo ideas: the live app asks Claude for ideas tailored to your city.";
export const DEMO_RATE_LIMIT_MESSAGE =
  "That's plenty of fresh ideas for one day. Save the ones you like, and come back tomorrow for more.";

const byNewest = (a: DateIdea, b: DateIdea) => b.createdAt.localeCompare(a.createdAt);

export const ideas: Backend["ideas"] = {
  async list() {
    await tick(80);
    myCouple();
    return demoStore
      .get()
      .ideas.map((i) => ({ ...i }))
      .sort(byNewest);
  },

  async generate() {
    await tick(900);
    const couple = myCouple();
    const s = demoStore.get();
    const now = new Date();
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const recentBatches = new Set(s.ideas.filter((i) => i.createdAt >= since).map((i) => i.batchId));
    if (recentBatches.size >= MAX_BATCHES_PER_DAY) throw new UserFacingError(DEMO_RATE_LIMIT_MESSAGE);

    const sorted = [...s.activities].sort((a, b) => b.happenedOn.localeCompare(a.happenedOn) || b.createdAt.localeCompare(a.createdAt));
    const input = buildIdeaInput({
      city: couple.city,
      month: now.getMonth() + 1,
      today: toISODate(now),
      // Only titles, categories, dates and partner ratings: never notes or photos.
      activities: sorted.map((a) => ({
        title: a.title,
        category: a.category,
        happenedOn: a.happenedOn,
        ratings: couple.memberIds.map((id) => a.ratings[id]).filter((n): n is number => typeof n === "number"),
      })),
      ideaTitles: [...s.ideas].sort(byNewest).map((i) => i.title),
    });
    const batchId = newId();
    const { ideas: picked } = finalizeIdeas([], input, batchId);
    const createdAt = nowIso();
    const created: DateIdea[] = picked.map((idea) => ({
      id: newId(),
      batchId,
      title: idea.title,
      description: idea.description,
      category: idea.category,
      budget: idea.budget,
      duration: idea.duration,
      timeOfDay: idea.timeOfDay,
      weather: idea.weather,
      why: idea.why,
      source: "fallback",
      status: "new",
      createdAt,
    }));
    demoStore.update((state) => {
      state.ideas.push(...created);
    });
    return { ideas: created.map((i) => ({ ...i })), notice: DEMO_IDEAS_NOTICE };
  },

  async setStatus(ideaId, status) {
    await tick(60);
    if (!isIdeaStatus(status)) throw new UserFacingError("Unknown status.");
    myCouple();
    demoStore.update((s) => {
      const idea = s.ideas.find((i) => i.id === ideaId);
      if (!idea) throw new UserFacingError("That idea is no longer available.");
      idea.status = status;
    });
  },
};
