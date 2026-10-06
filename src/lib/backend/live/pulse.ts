import { parseISODate, previousWeekStart, weekStartOf, type ISODate } from "@/lib/domain/dates";
import { UserFacingError, type Backend, type PulseEntry } from "../types";
import { fail, requireCoupleId, requireUserId, supabase } from "./client";

type Row = { user_id: string; week_start: string; excitement: number; connection: number };

const COLUMNS = "user_id, week_start, excitement, connection";

const toEntry = (r: Row): PulseEntry => ({
  userId: r.user_id,
  weekStart: r.week_start,
  excitement: Number(r.excitement),
  connection: Number(r.connection),
});

/** A Monday in YYYY-MM-DD form, not after this week. */
export function assertPulseWeek(weekStart: ISODate, today = new Date()): void {
  let date: Date;
  try {
    date = parseISODate(weekStart);
  } catch {
    throw new UserFacingError("Choose a valid week.");
  }
  if (date.getDay() !== 1) throw new UserFacingError("Weeks start on Monday.");
  if (weekStart > weekStartOf(today)) throw new UserFacingError("That week hasn't started yet.");
}

export function assertScore(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 1 || value > 5) throw new UserFacingError(`Pick a ${label} score from 1 to 5.`);
}

/** Clamps a requested history length to a sensible whole number of weeks. */
export const clampWeeks = (weeks: number) => (Number.isFinite(weeks) ? Math.min(520, Math.max(1, Math.floor(weeks))) : 8);

export const pulse: Backend["pulse"] = {
  async history(weeks) {
    const uid = await requireUserId();
    const coupleId = await requireCoupleId();
    const since = previousWeekStart(weekStartOf(new Date()), clampWeeks(weeks) - 1);
    // RLS returns own rows plus the partner's rows only for weeks where both submitted.
    const { data, error } = await supabase()
      .from("pulses")
      .select(COLUMNS)
      .eq("couple_id", coupleId)
      .gte("week_start", since)
      .order("week_start", { ascending: true });
    if (error) fail(error, "Could not load your pulse history.");
    const rows = ((data ?? []) as Row[]).map(toEntry);
    // Defense in depth: a partner score only ever appears next to one of ours.
    const myWeeks = new Set(rows.filter((r) => r.userId === uid).map((r) => r.weekStart));
    return rows.filter((r) => r.userId === uid || myWeeks.has(r.weekStart));
  },

  async status(weekStart) {
    await requireUserId();
    assertPulseWeek(weekStart);
    const { data, error } = await supabase().rpc("pulse_status", { p_week: weekStart });
    if (error) fail(error, "Could not load this week's pulse.");
    const row = (Array.isArray(data) ? data[0] : data) as { i_submitted?: boolean; partner_submitted?: boolean } | null | undefined;
    return { iSubmitted: !!row?.i_submitted, partnerSubmitted: !!row?.partner_submitted };
  },

  async submit(weekStart, excitement, connection) {
    assertPulseWeek(weekStart);
    assertScore(excitement, "excitement");
    assertScore(connection, "connection");
    const uid = await requireUserId();
    const coupleId = await requireCoupleId();
    const { data, error } = await supabase()
      .from("pulses")
      .upsert(
        { couple_id: coupleId, user_id: uid, week_start: weekStart, excitement, connection },
        { onConflict: "user_id,week_start" },
      )
      .select(COLUMNS)
      .single();
    if (error) fail(error, "Could not save your pulse.");
    return toEntry(data as Row);
  },
};
