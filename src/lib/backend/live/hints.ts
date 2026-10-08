import { UserFacingError, type Backend, type DistanceFlag } from "../types";
import { fail, requireCoupleId, requireUserId, supabase } from "./client";

/** "I'm feeling a bit distant" (RLS: the couple reads, the owner raises or clears). */

export const FLAG_DAYS = 14;

export const distanceFlags: Backend["distanceFlags"] = {
  async list() {
    const coupleId = await requireCoupleId();
    const since = new Date(Date.now() - FLAG_DAYS * 86_400_000).toISOString();
    const { data, error } = await supabase().from("distance_flags").select("user_id, raised_at").eq("couple_id", coupleId).gt("raised_at", since);
    if (error) fail(error, "Could not load that right now.");
    return ((data ?? []) as Array<{ user_id: string; raised_at: string }>).map((r): DistanceFlag => ({ userId: r.user_id, raisedAt: r.raised_at }));
  },
  async raise() {
    const uid = await requireUserId();
    const coupleId = await requireCoupleId();
    const { error } = await supabase()
      .from("distance_flags")
      .upsert({ user_id: uid, couple_id: coupleId, raised_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) fail(error, "Could not let them know right now.");
  },
  async clear() {
    const uid = await requireUserId();
    const { error } = await supabase().from("distance_flags").delete().eq("user_id", uid);
    if (error) throw new UserFacingError("Could not clear that right now.");
  },
};
