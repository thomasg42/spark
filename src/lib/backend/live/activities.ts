/**
 * Live activity log (Supabase, RLS-enforced as the signed-in user). Activities and
 * ratings are shared with the partner; each partner can only write their own rating.
 */
import { checkActivityInput, checkRating } from "@/components/plans/rules";
import { UserFacingError, type Activity, type Backend } from "../types";
import { fail, requireCoupleId, requireUserId, supabase } from "./client";
import { media } from "./media";

type Row = {
  id: string;
  title: string;
  happened_on: string;
  category: Activity["category"];
  note: string | null;
  photo_path: string | null;
  created_by: string | null;
  source_idea_id: string | null;
  created_at: string;
};

const COLUMNS = "id, title, happened_on, category, note, photo_path, created_by, source_idea_id, created_at";

const toActivity = (r: Row, ratings: Record<string, number> = {}): Activity => ({
  id: r.id,
  title: r.title,
  happenedOn: r.happened_on,
  category: r.category,
  note: r.note,
  photoPath: r.photo_path,
  createdBy: r.created_by,
  sourceIdeaId: r.source_idea_id,
  ratings,
  createdAt: r.created_at,
});

export const activities: Backend["activities"] = {
  async list() {
    const coupleId = await requireCoupleId();
    const [{ data, error }, { data: ratingRows, error: rErr }] = await Promise.all([
      supabase()
        .from("activities")
        .select(COLUMNS)
        .eq("couple_id", coupleId)
        .order("happened_on", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase().from("activity_ratings").select("activity_id, user_id, rating").eq("couple_id", coupleId),
    ]);
    if (error) fail(error, "Could not load your activities.");
    if (rErr) fail(rErr, "Could not load ratings.");
    const ratings = new Map<string, Record<string, number>>();
    for (const r of (ratingRows ?? []) as Array<{ activity_id: string; user_id: string; rating: number }>) {
      const forActivity = ratings.get(r.activity_id) ?? {};
      forActivity[r.user_id] = Number(r.rating);
      ratings.set(r.activity_id, forActivity);
    }
    return ((data ?? []) as Row[]).map((r) => toActivity(r, ratings.get(r.id) ?? {}));
  },

  async add(input) {
    const clean = checkActivityInput(input);
    const [uid, coupleId] = await Promise.all([requireUserId(), requireCoupleId()]);
    const photoPath = input.photo ? await media.upload(input.photo, "activities") : null;
    const { data, error } = await supabase()
      .from("activities")
      .insert({
        couple_id: coupleId,
        created_by: uid,
        title: clean.title,
        happened_on: clean.happenedOn,
        category: clean.category,
        note: clean.note,
        photo_path: photoPath,
        source_idea_id: clean.sourceIdeaId,
      })
      .select(COLUMNS)
      .single();
    if (error) {
      if (photoPath) await media.remove(photoPath).catch(() => undefined);
      fail(error, "Could not save this activity.");
    }
    return toActivity(data as Row);
  },

  async rate(activityId, rating) {
    checkRating(rating);
    const [uid, coupleId] = await Promise.all([requireUserId(), requireCoupleId()]);
    const { error } = await supabase()
      .from("activity_ratings")
      .upsert({ activity_id: activityId, couple_id: coupleId, user_id: uid, rating }, { onConflict: "activity_id,user_id" });
    if (error) {
      if (error.code === "23503") throw new UserFacingError("That activity is no longer in your log.");
      fail(error, "Could not save your rating.");
    }
  },

  async remove(activityId) {
    const coupleId = await requireCoupleId();
    const { data, error } = await supabase()
      .from("activities")
      .delete()
      .eq("id", activityId)
      .eq("couple_id", coupleId)
      .select("photo_path");
    if (error) fail(error, "Could not remove this activity.");
    for (const row of (data ?? []) as Array<{ photo_path: string | null }>) {
      if (row.photo_path) await media.remove(row.photo_path).catch(() => undefined);
    }
  },
};
