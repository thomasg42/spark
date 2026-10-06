/**
 * Demo activity log (in this browser only). Same rules as the database: activities
 * and ratings are shared by the two partners, each partner writes only their own
 * rating, and nobody outside the couple sees anything.
 */
import { checkActivityInput, checkRating } from "@/components/plans/rules";
import { UserFacingError, type Activity, type Backend } from "../types";
import { media } from "./media";
import { demoStore, me, myCouple, newId, nowIso, tick } from "./store";

const copy = (a: Activity): Activity => ({ ...a, ratings: { ...a.ratings } });

const byNewest = (a: Activity, b: Activity) => b.happenedOn.localeCompare(a.happenedOn) || b.createdAt.localeCompare(a.createdAt);

export const activities: Backend["activities"] = {
  async list() {
    await tick(80);
    myCouple();
    const members = new Set(myCouple().memberIds);
    return demoStore
      .get()
      .activities.map((a) => {
        const out = copy(a);
        // Only ratings from the two partners are ever returned.
        for (const userId of Object.keys(out.ratings)) if (!members.has(userId)) delete out.ratings[userId];
        return out;
      })
      .sort(byNewest);
  },

  async add(input) {
    await tick();
    const clean = checkActivityInput(input);
    const uid = me();
    myCouple();
    const photoPath = input.photo ? await media.upload(input.photo, "activities") : null;
    return demoStore.update((s) => {
      const created: Activity = {
        id: newId(),
        title: clean.title,
        happenedOn: clean.happenedOn,
        category: clean.category,
        note: clean.note,
        photoPath,
        createdBy: uid,
        sourceIdeaId: clean.sourceIdeaId && s.ideas.some((i) => i.id === clean.sourceIdeaId) ? clean.sourceIdeaId : null,
        ratings: {},
        createdAt: nowIso(),
      };
      s.activities.push(created);
      return copy(created);
    });
  },

  async rate(activityId, rating) {
    await tick(60);
    checkRating(rating);
    const uid = me();
    myCouple();
    demoStore.update((s) => {
      const activity = s.activities.find((a) => a.id === activityId);
      if (!activity) throw new UserFacingError("That activity is no longer in your log.");
      activity.ratings = { ...activity.ratings, [uid]: rating };
    });
  },

  async remove(activityId) {
    await tick();
    myCouple();
    const removed = demoStore.update((s) => {
      const index = s.activities.findIndex((a) => a.id === activityId);
      if (index === -1) return null;
      const [gone] = s.activities.splice(index, 1);
      return gone ?? null;
    });
    if (removed?.photoPath && !removed.photoPath.startsWith("demo/")) await media.remove(removed.photoPath).catch(() => undefined);
  },
};
