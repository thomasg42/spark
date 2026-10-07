/**
 * Module D: the "checkins" Edge Function logic (monthly check-in).
 *
 * Actions:
 *   { action: "get", period: "YYYY-MM" }
 *   { action: "submit", period: "YYYY-MM", answers: { best, closest, distant, more_of, talk_about } }
 *
 * Privacy:
 *  - Runs with the signed-in user's JWT, so RLS decides which responses are readable
 *    (own always; partner only after both submitted).
 *  - Defense in depth: even if the repository returned a partner row early, the
 *    handler never decrypts or returns it unless the check-in is revealed.
 *  - Answers and the summary are stored only as AES-GCM ciphertext bound to their row.
 *  - Nothing here logs answers, plaintext, ciphertext or keys.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { CHECKIN_QUESTIONS, isPaceVote, normalizeCheckinAnswers, type CheckinAnswers, type CheckinSummary } from "./checkin-questions.ts";
import { coerceSummary, summarizeCheckin } from "./checkin-summary.ts";
import { aad, scopes, type Sealer } from "./crypto.ts";
import { dbError, HttpError, type Handler } from "./http.ts";
import type { JsonGenerator } from "./llm.ts";

// ---------------------------------------------------------------------------
// Repository port
// ---------------------------------------------------------------------------

export interface CheckinStatusRow {
  checkinId: string;
  iSubmitted: boolean;
  partnerSubmitted: boolean;
  revealed: boolean;
  summaryReady: boolean;
}

export interface StoredResponse {
  userId: string;
  ciphertext: string;
}

/** Everything the handler needs from the database, acting as the signed-in user. */
export interface CheckinsRepository {
  /** The caller's couple id, or null when not paired. */
  coupleId(): Promise<string | null>;
  /** Opens (or returns) the couple's check-in for a period. */
  ensureCheckin(period: string): Promise<string>;
  status(period: string): Promise<CheckinStatusRow | null>;
  /** Responses the caller may read (RLS: own always, partner only after reveal). */
  responses(checkinId: string): Promise<StoredResponse[]>;
  summaryCiphertext(checkinId: string): Promise<string | null>;
  /** Stores the summary if none exists yet (first writer wins) and returns the stored value. */
  storeSummary(checkinId: string, ciphertext: string): Promise<string | null>;
  insertResponse(row: { checkinId: string; coupleId: string; ciphertext: string }): Promise<"inserted" | "duplicate">;
  /** Display names (nickname first) for the given members of the caller's couple. */
  displayNames(userIds: string[]): Promise<Record<string, string>>;
}

/** Same shape as CheckinView in src/lib/backend/types.ts (the browser contract). */
export interface CheckinViewPayload {
  period: string;
  checkinId: string | null;
  iSubmitted: boolean;
  partnerSubmitted: boolean;
  revealed: boolean;
  mine: CheckinAnswers | null;
  partner: CheckinAnswers | null;
  summary: CheckinSummary | null;
}

// ---------------------------------------------------------------------------
// Supabase implementation
// ---------------------------------------------------------------------------

type StatusDbRow = {
  checkin_id: string;
  i_submitted: boolean;
  partner_submitted: boolean;
  revealed: boolean;
  summary_ready: boolean;
};

export function supabaseCheckinsRepository(supabase: SupabaseClient, userId: string): CheckinsRepository {
  return {
    async coupleId() {
      const { data, error } = await supabase.from("couple_members").select("couple_id").eq("user_id", userId).maybeSingle();
      if (error) dbError(error, "Could not load your couple.");
      return (data?.couple_id as string | undefined) ?? null;
    },
    async ensureCheckin(period) {
      const { data, error } = await supabase.rpc("ensure_checkin", { p_period: period });
      if (error) dbError(error, "Could not open this check-in.");
      if (typeof data !== "string") throw new HttpError(400, "Could not open this check-in.");
      return data;
    },
    async status(period) {
      const { data, error } = await supabase.rpc("checkin_status", { p_period: period });
      if (error) dbError(error, "Could not load this check-in.");
      const row = (Array.isArray(data) ? data[0] : data) as StatusDbRow | null | undefined;
      if (!row) return null;
      return {
        checkinId: row.checkin_id,
        iSubmitted: !!row.i_submitted,
        partnerSubmitted: !!row.partner_submitted,
        revealed: !!row.revealed,
        summaryReady: !!row.summary_ready,
      };
    },
    async responses(checkinId) {
      const { data, error } = await supabase.from("checkin_responses").select("user_id, answers_ciphertext").eq("checkin_id", checkinId);
      if (error) dbError(error, "Could not load this check-in.");
      return (data ?? []).map((r) => ({ userId: r.user_id as string, ciphertext: r.answers_ciphertext as string }));
    },
    async summaryCiphertext(checkinId) {
      const { data, error } = await supabase.from("checkins").select("summary_ciphertext").eq("id", checkinId).maybeSingle();
      if (error) dbError(error, "Could not load this check-in.");
      return (data?.summary_ciphertext as string | null | undefined) ?? null;
    },
    async storeSummary(checkinId, ciphertext) {
      const { data, error } = await supabase.rpc("set_checkin_summary", { p_checkin_id: checkinId, p_ciphertext: ciphertext });
      if (error) dbError(error, "Could not save the summary.");
      return typeof data === "string" ? data : null;
    },
    async insertResponse({ checkinId, coupleId, ciphertext }) {
      const { error } = await supabase
        .from("checkin_responses")
        .insert({ checkin_id: checkinId, couple_id: coupleId, user_id: userId, answers_ciphertext: ciphertext });
      if (error?.code === "23505") return "duplicate";
      if (error) dbError(error, "Could not save your answers.");
      return "inserted";
    },
    async displayNames(userIds) {
      const { data, error } = await supabase.from("profiles").select("user_id, display_name, nickname").in("user_id", userIds);
      if (error) dbError(error, "Could not load names.");
      const out: Record<string, string> = {};
      for (const r of data ?? []) {
        const name = ((r.nickname as string | null) || (r.display_name as string | null) || "").trim();
        if (name) out[r.user_id as string] = name;
      }
      return out;
    },
  };
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const PERIOD_RE = /^[0-9]{4}-(0[1-9]|1[0-2])$/;
/** The furthest-ahead time zone is UTC+14, so "this month" can be up to 14 hours ahead of UTC. */
const MAX_TZ_AHEAD_MS = 14 * 3_600_000;

const utcPeriod = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

/** YYYY-MM, a real month, and not in the future (allowing for the user's time zone). */
export function validatePeriod(value: unknown, now: Date): string {
  if (typeof value !== "string" || !PERIOD_RE.test(value)) throw new HttpError(400, "Choose a valid month (YYYY-MM).");
  if (value < "2000-01") throw new HttpError(400, "Choose a valid month (YYYY-MM).");
  if (value > utcPeriod(new Date(now.getTime() + MAX_TZ_AHEAD_MS))) throw new HttpError(400, "That month hasn't started yet.");
  return value;
}

/** Decrypted answers re-shaped to exactly the five known questions plus the optional pace vote. */
export function coerceAnswers(value: unknown): CheckinAnswers {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const out = {} as CheckinAnswers;
  for (const q of CHECKIN_QUESTIONS) {
    const v = raw[q.id];
    out[q.id] = typeof v === "string" ? v : "";
  }
  if (isPaceVote(raw.pace)) out.pace = raw.pace;
  return out;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export interface CheckinsHandlerDeps {
  repo: CheckinsRepository;
  sealer: Sealer;
  /** Claude via the JsonGenerator port; null/undefined uses the plain fallback summary. */
  generate?: JsonGenerator | null;
  now?: () => Date;
}

const errorName = (error: unknown) => (error instanceof Error ? error.name : "unknown");

export function createCheckinsHandler({ repo, sealer, generate, now = () => new Date() }: CheckinsHandlerDeps): Handler {
  async function openAnswers(row: StoredResponse, checkinId: string, coupleId: string): Promise<CheckinAnswers> {
    try {
      return coerceAnswers(await sealer.decryptJson<unknown>(row.ciphertext, scopes.couple(coupleId), aad.checkinResponse(checkinId, row.userId)));
    } catch (error) {
      console.error("checkins: could not open a response:", errorName(error));
      throw new HttpError(500, "Could not open this check-in right now. Please try again later.");
    }
  }

  async function openSummary(ciphertext: string, checkinId: string, coupleId: string): Promise<CheckinSummary | null> {
    try {
      return coerceSummary(await sealer.decryptJson<unknown>(ciphertext, scopes.couple(coupleId), aad.checkinSummary(checkinId)));
    } catch (error) {
      console.error("checkins: could not open a summary:", errorName(error));
      return null;
    }
  }

  async function summaryFor(
    status: CheckinStatusRow,
    coupleId: string,
    people: Array<{ userId: string; answers: CheckinAnswers }>,
  ): Promise<CheckinSummary | null> {
    const checkinId = status.checkinId;
    if (status.summaryReady) {
      const existing = await repo.summaryCiphertext(checkinId);
      // Never regenerate over a stored summary: the database keeps the first one.
      if (existing) return openSummary(existing, checkinId, coupleId);
    }

    // Stable order (by user id) so either partner builds the same request.
    const [a, b] = [...people].sort((x, y) => (x.userId < y.userId ? -1 : x.userId > y.userId ? 1 : 0)) as [
      { userId: string; answers: CheckinAnswers },
      { userId: string; answers: CheckinAnswers },
    ];
    let names: Record<string, string> = {};
    try {
      names = await repo.displayNames([a.userId, b.userId]);
    } catch {
      // Names only personalize the wording; neutral labels work too.
    }
    const summary = await summarizeCheckin({
      generate,
      questions: CHECKIN_QUESTIONS,
      nameA: names[a.userId] ?? "Partner 1",
      answersA: a.answers,
      nameB: names[b.userId] ?? "Partner 2",
      answersB: b.answers,
    });

    const ciphertext = await sealer.encryptJson(summary, scopes.couple(coupleId), aad.checkinSummary(checkinId));
    let stored: string | null;
    try {
      stored = await repo.storeSummary(checkinId, ciphertext);
    } catch (error) {
      console.error("checkins: could not store the summary:", errorName(error));
      return summary;
    }
    if (!stored || stored === ciphertext) return summary;
    // The partner's request stored one first: show that one so both see the same summary.
    return (await openSummary(stored, checkinId, coupleId)) ?? summary;
  }

  async function view(period: string, userId: string): Promise<CheckinViewPayload> {
    const coupleId = await repo.coupleId();
    if (!coupleId) throw new HttpError(400, "Pair with your partner first.");
    await repo.ensureCheckin(period);
    const status = await repo.status(period);
    if (!status) throw new HttpError(400, "Could not open this check-in.");

    const rows = await repo.responses(status.checkinId);
    const own = rows.find((r) => r.userId === userId) ?? null;
    const partnerRow = rows.find((r) => r.userId !== userId) ?? null;
    // Revealed only when the database says so AND both rows are really there.
    const revealed = status.revealed && own !== null && partnerRow !== null;

    const mine = own ? await openAnswers(own, status.checkinId, coupleId) : null;
    const partner = revealed && partnerRow ? await openAnswers(partnerRow, status.checkinId, coupleId) : null;
    const summary =
      revealed && mine && partner && partnerRow
        ? await summaryFor(status, coupleId, [
            { userId, answers: mine },
            { userId: partnerRow.userId, answers: partner },
          ])
        : null;

    return {
      period,
      checkinId: status.checkinId,
      iSubmitted: status.iSubmitted || own !== null,
      partnerSubmitted: status.partnerSubmitted || revealed,
      revealed,
      mine,
      partner,
      summary,
    };
  }

  async function submit(period: string, userId: string, rawAnswers: unknown): Promise<CheckinViewPayload> {
    let answers: CheckinAnswers;
    try {
      answers = normalizeCheckinAnswers(rawAnswers);
    } catch (error) {
      throw new HttpError(400, error instanceof Error && error.message ? error.message : "Check your answers and try again.");
    }
    const coupleId = await repo.coupleId();
    if (!coupleId) throw new HttpError(400, "Pair with your partner first.");
    const checkinId = await repo.ensureCheckin(period);
    const ciphertext = await sealer.encryptJson(answers, scopes.couple(coupleId), aad.checkinResponse(checkinId, userId));
    const result = await repo.insertResponse({ checkinId, coupleId, ciphertext });
    if (result === "duplicate") throw new HttpError(409, "You already submitted this month.");
    return view(period, userId);
  }

  return async (body, ctx) => {
    const userId = ctx.user.id;
    const action = body.action;
    if (action !== "get" && action !== "submit") throw new HttpError(400, "Unknown action.");
    const period = validatePeriod(body.period, now());
    return action === "get" ? view(period, userId) : submit(period, userId, body.answers);
  };
}
