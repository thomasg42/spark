import { checkDatePlan } from "@/lib/domain/plans-rules";
import { UserFacingError, type Backend, type DatePlan } from "../types";
import { fail, requireCoupleId, requireUserId, supabase } from "./client";

/** The couple's shared calendar (RLS: both partners read; the creator can delete). */

type Row = { id: string; title: string; planned_for: string; planned_time: string | null; note: string | null; created_by: string | null; created_at: string };
const COLUMNS = "id, title, planned_for, planned_time, note, created_by, created_at";

const toPlan = (r: Row): DatePlan => ({
  id: r.id,
  title: r.title,
  plannedFor: r.planned_for,
  time: r.planned_time ? r.planned_time.slice(0, 5) : null,
  note: r.note,
  createdBy: r.created_by,
  createdAt: r.created_at,
});

export const datePlans: Backend["datePlans"] = {
  async list() {
    const coupleId = await requireCoupleId();
    const { data, error } = await supabase()
      .from("date_plans")
      .select(COLUMNS)
      .eq("couple_id", coupleId)
      .order("planned_for", { ascending: true })
      .order("planned_time", { ascending: true, nullsFirst: false })
      .limit(200);
    if (error) fail(error, "Could not load your plans.");
    return ((data ?? []) as Row[]).map(toPlan);
  },
  async add(input) {
    const clean = checkDatePlan(input);
    const uid = await requireUserId();
    const coupleId = await requireCoupleId();
    const { data, error } = await supabase()
      .from("date_plans")
      .insert({ couple_id: coupleId, created_by: uid, title: clean.title, planned_for: clean.plannedFor, planned_time: clean.time, note: clean.note })
      .select(COLUMNS)
      .single();
    if (error) fail(error, "Could not add that plan.");
    return toPlan(data as Row);
  },
  async remove(id) {
    const uid = await requireUserId();
    const { data, error } = await supabase().from("date_plans").delete().eq("id", id).eq("created_by", uid).select("id");
    if (error) fail(error, "Could not remove that plan.");
    if (!data || data.length === 0) throw new UserFacingError("Only the person who added a plan can remove it.");
  },
};
