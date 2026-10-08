import { checkDateRule } from "@/lib/domain/date-rules";
import { checkLifeChange } from "@/lib/domain/rhythm-breaker";
import { UserFacingError, type Backend, type DateRule, type LifeChangeEntry } from "../types";
import { fail, requireCoupleId, requireUserId, supabase } from "./client";

/** Standing dates and life changes (RLS: both partners read; the creator changes or removes). */

type RuleRow = { id: string; title: string; weekday: number; start_time: string; end_time: string; note: string | null; active: boolean; created_by: string | null; created_at: string };
const RULE_COLUMNS = "id, title, weekday, start_time, end_time, note, active, created_by, created_at";
const toRule = (r: RuleRow): DateRule => ({
  id: r.id,
  title: r.title,
  weekday: r.weekday,
  startTime: r.start_time.slice(0, 5),
  endTime: r.end_time.slice(0, 5),
  note: r.note,
  active: r.active,
  createdBy: r.created_by,
  createdAt: r.created_at,
});

type ChangeRow = { id: string; kind: LifeChangeEntry["kind"]; happened_on: string; note: string | null; created_by: string | null; created_at: string };
const CHANGE_COLUMNS = "id, kind, happened_on, note, created_by, created_at";
const toChange = (r: ChangeRow): LifeChangeEntry => ({ id: r.id, kind: r.kind, happenedOn: r.happened_on, note: r.note, createdBy: r.created_by, createdAt: r.created_at });

export const dateRules: Backend["dateRules"] = {
  async list() {
    const coupleId = await requireCoupleId();
    const { data, error } = await supabase().from("date_rules").select(RULE_COLUMNS).eq("couple_id", coupleId).order("weekday").order("start_time").limit(20);
    if (error) fail(error, "Could not load your standing dates.");
    return ((data ?? []) as RuleRow[]).map(toRule);
  },
  async add(input) {
    const clean = checkDateRule(input);
    const uid = await requireUserId();
    const coupleId = await requireCoupleId();
    const { data, error } = await supabase()
      .from("date_rules")
      .insert({ couple_id: coupleId, created_by: uid, title: clean.title, weekday: clean.weekday, start_time: clean.startTime, end_time: clean.endTime, note: clean.note })
      .select(RULE_COLUMNS)
      .single();
    if (error) fail(error, "Could not save that standing date.");
    return toRule(data as RuleRow);
  },
  async update(id, patch) {
    const uid = await requireUserId();
    const current = (await this.list()).find((r) => r.id === id);
    if (!current || current.createdBy !== uid) throw new UserFacingError("Only the person who set a standing date can change it.");
    const clean = checkDateRule({ ...current, ...patch });
    const { data, error } = await supabase()
      .from("date_rules")
      .update({ title: clean.title, weekday: clean.weekday, start_time: clean.startTime, end_time: clean.endTime, note: clean.note, active: patch.active ?? current.active })
      .eq("id", id)
      .eq("created_by", uid)
      .select(RULE_COLUMNS);
    if (error) fail(error, "Could not change that standing date.");
    const row = (data as RuleRow[] | null)?.[0];
    if (!row) throw new UserFacingError("Only the person who set a standing date can change it.");
    return toRule(row);
  },
  async remove(id) {
    const uid = await requireUserId();
    const { data, error } = await supabase().from("date_rules").delete().eq("id", id).eq("created_by", uid).select("id");
    if (error) fail(error, "Could not remove that standing date.");
    if (!data || data.length === 0) throw new UserFacingError("Only the person who set a standing date can remove it.");
  },
};

export const lifeChanges: Backend["lifeChanges"] = {
  async list() {
    const coupleId = await requireCoupleId();
    const { data, error } = await supabase().from("life_changes").select(CHANGE_COLUMNS).eq("couple_id", coupleId).order("happened_on", { ascending: false }).limit(50);
    if (error) fail(error, "Could not load your life changes.");
    return ((data ?? []) as ChangeRow[]).map(toChange);
  },
  async add(input) {
    const clean = checkLifeChange(input, new Date());
    const uid = await requireUserId();
    const coupleId = await requireCoupleId();
    const { data, error } = await supabase()
      .from("life_changes")
      .insert({ couple_id: coupleId, created_by: uid, kind: clean.kind, happened_on: clean.happenedOn, note: clean.note })
      .select(CHANGE_COLUMNS)
      .single();
    if (error) fail(error, "Could not save that change.");
    return toChange(data as ChangeRow);
  },
  async remove(id) {
    const uid = await requireUserId();
    const { data, error } = await supabase().from("life_changes").delete().eq("id", id).eq("created_by", uid).select("id");
    if (error) fail(error, "Could not remove that change.");
    if (!data || data.length === 0) throw new UserFacingError("Only the person who logged a change can remove it.");
  },
};
