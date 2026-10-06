import { periodOf } from "@/lib/domain/dates";
import { UserFacingError, type Backend, type CheckinView } from "../types";
import { fail, invoke, requireCoupleId, requireUserId, supabase } from "./client";

const PERIOD_RE = /^[0-9]{4}-(0[1-9]|1[0-2])$/;

/** YYYY-MM and not after the current month. */
export function assertCheckinPeriod(period: string, today = new Date()): void {
  if (typeof period !== "string" || !PERIOD_RE.test(period)) throw new UserFacingError("Choose a valid month.");
  if (period > periodOf(today)) throw new UserFacingError("That month hasn't started yet.");
}

/**
 * Monthly check-ins go through the "checkins" Edge Function: it encrypts answers,
 * returns the partner's answers only after both submitted, and writes the summary.
 */
export const checkins: Backend["checkins"] = {
  async get(period) {
    assertCheckinPeriod(period);
    return invoke<CheckinView>("checkins", { action: "get", period });
  },
  async submit(period, answers) {
    assertCheckinPeriod(period);
    return invoke<CheckinView>("checkins", { action: "submit", period, answers });
  },
};

export interface CheckinHistoryEntry {
  period: string;
  iSubmitted: boolean;
  revealed: boolean;
}

/**
 * Months that already have a check-in, newest first. Reads only metadata the
 * database already allows: check-in periods and which responses RLS shows us
 * (our own always, our partner's only after both submitted). No answers or
 * ciphertext are fetched. Not part of the Backend contract (see report).
 */
export async function checkinHistory(limit = 12): Promise<CheckinHistoryEntry[]> {
  const uid = await requireUserId();
  const coupleId = await requireCoupleId();
  const { data, error } = await supabase()
    .from("checkins")
    .select("id, period")
    .eq("couple_id", coupleId)
    .order("period", { ascending: false })
    .limit(limit);
  if (error) fail(error, "Could not load earlier check-ins.");
  const list = (data ?? []) as Array<{ id: string; period: string }>;
  if (list.length === 0) return [];
  const { data: responses, error: rErr } = await supabase()
    .from("checkin_responses")
    .select("checkin_id, user_id")
    .in(
      "checkin_id",
      list.map((c) => c.id),
    );
  if (rErr) fail(rErr, "Could not load earlier check-ins.");
  const seen = new Map<string, Set<string>>();
  for (const r of (responses ?? []) as Array<{ checkin_id: string; user_id: string }>) {
    const set = seen.get(r.checkin_id) ?? new Set<string>();
    set.add(r.user_id);
    seen.set(r.checkin_id, set);
  }
  return list.map((c) => {
    const users = seen.get(c.id) ?? new Set<string>();
    return { period: c.period, iSubmitted: users.has(uid), revealed: users.has(uid) && users.size >= 2 };
  });
}
