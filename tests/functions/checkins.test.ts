/**
 * "checkins" Edge Function logic, tested with an in-memory repository that mimics
 * the database (RLS: own responses always, partner's only after both submitted)
 * and a fake Claude generator. A "leaky" repository mode returns every row
 * regardless, to prove the handler itself never reveals answers early.
 */
import { randomBytes } from "node:crypto";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { CheckinView } from "@/lib/backend/types";
import { CHECKIN_QUESTIONS, type CheckinAnswers, type CheckinSummary } from "@shared/checkin-questions.ts";
import { SAFE_STARTER } from "@shared/checkin-summary.ts";
import {
  createCheckinsHandler,
  validatePeriod,
  type CheckinsRepository,
  type CheckinViewPayload,
} from "@shared/checkins-handler.ts";
import { aad, createSealer, scopes } from "@shared/crypto.ts";
import type { UserContext } from "@shared/http.ts";
import type { JsonGenerator, JsonRequest, JsonResult } from "@shared/llm.ts";

// Compile-time guarantee that the function's payload matches the browser contract.
const toView = (p: CheckinViewPayload): CheckinView => p;
const toPayload = (v: CheckinView): CheckinViewPayload => v;
void toView;
void toPayload;

const KEY = randomBytes(32).toString("base64");
const sealer = createSealer(KEY);
const NOW = new Date("2026-10-06T12:00:00Z");
const PERIOD = "2026-10";

const ALEX = "11111111-1111-4111-8111-111111111111";
const SAM = "22222222-2222-4222-8222-222222222222";
const CASEY = "33333333-3333-4333-8333-333333333333";
const COUPLE = "c0c0c0c0-0000-4000-8000-000000000001";

const answers = (overrides: Partial<CheckinAnswers>): CheckinAnswers => ({
  best: "",
  closest: "",
  distant: "",
  more_of: "",
  talk_about: "",
  ...overrides,
});
const ALEX_ANSWERS = answers({ best: "The hot springs weekend.", distant: "When work got busy midweek.", more_of: "Lazy Saturday mornings." });
const SAM_ANSWERS = answers({ best: "Hot springs, obviously.", distant: "Not really.", more_of: "Trying new restaurants." });

interface CheckinRow {
  id: string;
  coupleId: string;
  period: string;
  summary: string | null;
}
interface ResponseRow {
  checkinId: string;
  coupleId: string;
  userId: string;
  ciphertext: string;
}

class MemoryDb {
  members = new Map<string, string>([
    [ALEX, COUPLE],
    [SAM, COUPLE],
  ]);
  names: Record<string, string> = { [ALEX]: "Alex", [SAM]: "Sam" };
  checkins: CheckinRow[] = [];
  responses: ResponseRow[] = [];
  storeCalls = 0;

  revealed(checkinId: string) {
    return new Set(this.responses.filter((r) => r.checkinId === checkinId).map((r) => r.userId)).size >= 2;
  }

  partnerOf(userId: string) {
    const couple = this.members.get(userId);
    return [...this.members.entries()].find(([u, c]) => c === couple && u !== userId)?.[0] ?? null;
  }

  repo(userId: string, opts: { leaky?: boolean } = {}): CheckinsRepository {
    const coupleId = () => this.members.get(userId) ?? null;
    const find = (period: string) => this.checkins.find((c) => c.coupleId === coupleId() && c.period === period);
    return {
      coupleId: async () => coupleId(),
      ensureCheckin: async (period) => {
        const cid = coupleId();
        if (!cid) throw new Error("Pair with your partner first.");
        let row = find(period);
        if (!row) {
          row = { id: crypto.randomUUID(), coupleId: cid, period, summary: null };
          this.checkins.push(row);
        }
        return row.id;
      },
      status: async (period) => {
        const row = find(period);
        if (!row) return null;
        const partner = this.partnerOf(userId);
        return {
          checkinId: row.id,
          iSubmitted: this.responses.some((r) => r.checkinId === row.id && r.userId === userId),
          partnerSubmitted: this.responses.some((r) => r.checkinId === row.id && r.userId === partner),
          revealed: this.revealed(row.id),
          summaryReady: row.summary !== null,
        };
      },
      responses: async (checkinId) =>
        this.responses
          .filter((r) => r.checkinId === checkinId && (opts.leaky || r.userId === userId || this.revealed(checkinId)))
          .map((r) => ({ userId: r.userId, ciphertext: r.ciphertext })),
      summaryCiphertext: async (checkinId) => this.checkins.find((c) => c.id === checkinId)?.summary ?? null,
      storeSummary: async (checkinId, ciphertext) => {
        this.storeCalls++;
        if (!this.revealed(checkinId)) throw new Error("Both partners must submit before a summary is created.");
        const row = this.checkins.find((c) => c.id === checkinId)!;
        if (row.summary === null) row.summary = ciphertext;
        return row.summary;
      },
      insertResponse: async ({ checkinId, coupleId: cid, ciphertext }) => {
        if (cid !== coupleId()) throw new Error("row-level security");
        if (this.responses.some((r) => r.checkinId === checkinId && r.userId === userId)) return "duplicate";
        this.responses.push({ checkinId, coupleId: cid, userId, ciphertext });
        return "inserted";
      },
      displayNames: async (ids) => Object.fromEntries(ids.filter((id) => this.names[id]).map((id) => [id, this.names[id]!])),
    };
  }
}

const ctx = (userId: string): UserContext => ({ supabase: {} as SupabaseClient, user: { id: userId } as User });

function fakeClaude(result: JsonResult | (() => JsonResult)) {
  const calls: JsonRequest[] = [];
  const generate: JsonGenerator = async (req) => {
    calls.push(req);
    return typeof result === "function" ? result() : result;
  };
  return { generate, calls };
}

const CLAUDE_OK: JsonResult = {
  ok: true,
  json: {
    overlaps: ["You both loved the hot springs weekend."],
    gaps: ["Busy weeks landed differently for each of you."],
    conversation_starter: "What would make a busy week feel closer?",
    safety_flag: false,
  },
};

function setup(opts: { generate?: JsonGenerator | null; now?: Date } = {}) {
  const db = new MemoryDb();
  const call = (userId: string, body: Record<string, unknown>, repoOpts: { leaky?: boolean } = {}) =>
    createCheckinsHandler({ repo: db.repo(userId, repoOpts), sealer, generate: opts.generate, now: () => opts.now ?? NOW })(body, ctx(userId)) as Promise<CheckinViewPayload>;
  return { db, call };
}

describe("checkins handler: hidden until both submit", () => {
  it("opens an empty check-in with nothing revealed", async () => {
    const { call } = setup();
    const view = await call(ALEX, { action: "get", period: PERIOD });
    expect(view).toMatchObject({ period: PERIOD, iSubmitted: false, partnerSubmitted: false, revealed: false, mine: null, partner: null, summary: null });
    expect(view.checkinId).toEqual(expect.any(String));
  });

  it("after one partner submits, each side sees only their own answers", async () => {
    const { call } = setup();
    const afterSubmit = await call(ALEX, { action: "submit", period: PERIOD, answers: ALEX_ANSWERS });
    expect(afterSubmit).toMatchObject({ iSubmitted: true, partnerSubmitted: false, revealed: false, partner: null, summary: null });
    expect(afterSubmit.mine).toEqual(ALEX_ANSWERS);

    const samView = await call(SAM, { action: "get", period: PERIOD });
    expect(samView).toMatchObject({ iSubmitted: false, partnerSubmitted: true, revealed: false, mine: null, partner: null, summary: null });
    expect(JSON.stringify(samView)).not.toContain("hot springs");
  });

  it("never returns partner answers before reveal, even if the repository leaks rows", async () => {
    const { call } = setup();
    await call(SAM, { action: "submit", period: PERIOD, answers: SAM_ANSWERS });
    const leaked = await call(ALEX, { action: "get", period: PERIOD }, { leaky: true });
    expect(leaked.partner).toBeNull();
    expect(leaked.mine).toBeNull();
    expect(leaked.revealed).toBe(false);
    expect(leaked.summary).toBeNull();
    expect(JSON.stringify(leaked)).not.toContain("obviously");
  });

  it("an outsider in another couple cannot reach this couple's check-in", async () => {
    const { db, call } = setup();
    await call(ALEX, { action: "submit", period: PERIOD, answers: ALEX_ANSWERS });
    await expect(call(CASEY, { action: "get", period: PERIOD })).rejects.toMatchObject({ status: 400, message: "Pair with your partner first." });
    db.members.set(CASEY, "other-couple");
    const view = await call(CASEY, { action: "get", period: PERIOD });
    expect(view.mine).toBeNull();
    expect(view.partner).toBeNull();
    expect(view.checkinId).not.toBe(db.checkins.find((c) => c.coupleId === COUPLE)!.id);
  });
});

describe("checkins handler: reveal and summary", () => {
  it("reveals both sides once both submitted and creates the Claude summary once", async () => {
    const claude = fakeClaude(CLAUDE_OK);
    const { db, call } = setup({ generate: claude.generate });
    await call(ALEX, { action: "submit", period: PERIOD, answers: ALEX_ANSWERS });
    const samView = await call(SAM, { action: "submit", period: PERIOD, answers: SAM_ANSWERS });

    expect(samView.revealed).toBe(true);
    expect(samView.mine).toEqual(SAM_ANSWERS);
    expect(samView.partner).toEqual(ALEX_ANSWERS);
    expect(samView.summary).toMatchObject({ source: "claude", overlaps: ["You both loved the hot springs weekend."], safetyFlag: false });
    expect(claude.calls).toHaveLength(1);
    // Names are passed in a stable order (by user id), so either partner builds the same request.
    expect(claude.calls[0]!.user.indexOf("Alex")).toBeLessThan(claude.calls[0]!.user.indexOf("Sam"));

    const alexView = await call(ALEX, { action: "get", period: PERIOD });
    expect(alexView.partner).toEqual(SAM_ANSWERS);
    expect(alexView.summary).toEqual(samView.summary);
    expect(claude.calls).toHaveLength(1); // reused, not regenerated
    expect(db.storeCalls).toBe(1);
  });

  it("stores answers and the summary only as bound ciphertext", async () => {
    const { db, call } = setup({ generate: fakeClaude(CLAUDE_OK).generate });
    await call(ALEX, { action: "submit", period: PERIOD, answers: ALEX_ANSWERS });
    await call(SAM, { action: "submit", period: PERIOD, answers: SAM_ANSWERS });
    const row = db.checkins[0]!;
    for (const r of db.responses) {
      expect(r.ciphertext.startsWith("v1.")).toBe(true);
      expect(r.ciphertext).not.toContain("springs");
    }
    expect(row.summary!.startsWith("v1.")).toBe(true);
    const opened = await sealer.decryptJson<CheckinSummary>(row.summary!, scopes.couple(COUPLE), aad.checkinSummary(row.id));
    expect(opened.source).toBe("claude");
    // A response copied into the other partner's row does not decrypt.
    await expect(sealer.decrypt(db.responses[0]!.ciphertext, scopes.couple(COUPLE), aad.checkinResponse(row.id, SAM))).rejects.toThrow("Decryption failed");
  });

  it("uses the summary another request stored first (first writer wins)", async () => {
    const claude = fakeClaude(CLAUDE_OK);
    const { db, call } = setup({ generate: claude.generate });
    await call(ALEX, { action: "submit", period: PERIOD, answers: ALEX_ANSWERS });
    // Sam submits with a repo that pretends no summary exists yet, while a racing request already stored one.
    const racing: CheckinSummary = { overlaps: ["Stored first."], gaps: [], conversationStarter: "Who goes first?", safetyFlag: false, source: "fallback" };
    const base = db.repo(SAM);
    const repo: CheckinsRepository = {
      ...base,
      status: async (period) => {
        const s = await base.status(period);
        return s ? { ...s, summaryReady: false } : s;
      },
      storeSummary: async (checkinId, ciphertext) => {
        const row = db.checkins.find((c) => c.id === checkinId)!;
        if (row.summary === null) row.summary = await sealer.encryptJson(racing, scopes.couple(COUPLE), aad.checkinSummary(checkinId));
        return base.storeSummary(checkinId, ciphertext);
      },
    };
    const view = (await createCheckinsHandler({ repo, sealer, generate: claude.generate, now: () => NOW })(
      { action: "submit", period: PERIOD, answers: SAM_ANSWERS },
      ctx(SAM),
    )) as CheckinViewPayload;
    expect(view.summary).toEqual(racing);
  });

  it.each(["refusal", "no_key", "api_error"] as const)("falls back to the plain summary on %s", async (reason) => {
    const claude = fakeClaude({ ok: false, reason });
    const { call } = setup({ generate: claude.generate });
    await call(ALEX, { action: "submit", period: PERIOD, answers: ALEX_ANSWERS });
    const view = await call(SAM, { action: "submit", period: PERIOD, answers: SAM_ANSWERS });
    expect(view.summary?.source).toBe("fallback");
    expect(view.summary?.overlaps[0]).toContain("hot springs");
    expect(claude.calls).toHaveLength(1);
  });

  it("falls back when no generator is configured", async () => {
    const { call } = setup({ generate: null });
    await call(ALEX, { action: "submit", period: PERIOD, answers: ALEX_ANSWERS });
    const view = await call(SAM, { action: "submit", period: PERIOD, answers: SAM_ANSWERS });
    expect(view.summary?.source).toBe("fallback");
  });

  it("raises the safety flag from crisis text even when Claude says false", async () => {
    const claude = fakeClaude(CLAUDE_OK);
    const { call } = setup({ generate: claude.generate });
    await call(ALEX, { action: "submit", period: PERIOD, answers: answers({ distant: "I'm afraid of him when he drinks. He hits me sometimes." }) });
    const view = await call(SAM, { action: "submit", period: PERIOD, answers: SAM_ANSWERS });
    expect(view.summary?.source).toBe("claude");
    expect(view.summary?.safetyFlag).toBe(true);
    expect(view.summary?.gaps).toEqual([]);
    expect(view.summary?.conversationStarter).toBe(SAFE_STARTER);
  });

  it("still returns the revealed answers if the summary cannot be stored", async () => {
    const { db, call } = setup({ generate: fakeClaude(CLAUDE_OK).generate });
    await call(ALEX, { action: "submit", period: PERIOD, answers: ALEX_ANSWERS });
    const base = db.repo(SAM);
    const repo: CheckinsRepository = {
      ...base,
      storeSummary: async () => {
        throw new Error("database unavailable");
      },
    };
    const view = (await createCheckinsHandler({ repo, sealer, generate: fakeClaude(CLAUDE_OK).generate, now: () => NOW })(
      { action: "submit", period: PERIOD, answers: SAM_ANSWERS },
      ctx(SAM),
    )) as CheckinViewPayload;
    expect(view.revealed).toBe(true);
    expect(view.partner).toEqual(ALEX_ANSWERS);
    expect(view.summary?.source).toBe("claude");
  });
});

describe("checkins handler: validation", () => {
  it.each(["2026-13", "2026-00", "2026-1", "abc", "", 202610, null, "1999-12"])("rejects period %s", async (period) => {
    const { call } = setup();
    await expect(call(ALEX, { action: "get", period })).rejects.toMatchObject({ status: 400 });
  });

  it("rejects a month that hasn't started, allowing for time zones ahead of UTC", async () => {
    const { call } = setup();
    await expect(call(ALEX, { action: "get", period: "2026-11" })).rejects.toMatchObject({ status: 400, message: "That month hasn't started yet." });
    // 13:00 UTC on Oct 31 is already Nov 1 in UTC+14.
    expect(validatePeriod("2026-11", new Date("2026-10-31T13:00:00Z"))).toBe("2026-11");
    expect(() => validatePeriod("2026-12", new Date("2026-10-31T13:00:00Z"))).toThrow();
    expect(validatePeriod("2026-09", NOW)).toBe("2026-09");
  });

  it("rejects unknown actions", async () => {
    const { call } = setup();
    await expect(call(ALEX, { action: "delete", period: PERIOD })).rejects.toMatchObject({ status: 400, message: "Unknown action." });
  });

  it("refuses a second submission for the same month", async () => {
    const { db, call } = setup();
    await call(ALEX, { action: "submit", period: PERIOD, answers: ALEX_ANSWERS });
    await expect(call(ALEX, { action: "submit", period: PERIOD, answers: answers({ best: "changed my mind" }) })).rejects.toMatchObject({
      status: 409,
      message: "You already submitted this month.",
    });
    expect(db.responses).toHaveLength(1);
  });

  it("rejects empty, malformed, or unknown answers", async () => {
    const { call } = setup();
    await expect(call(ALEX, { action: "submit", period: PERIOD, answers: answers({}) })).rejects.toMatchObject({ status: 400, message: "Answer at least one question." });
    await expect(call(ALEX, { action: "submit", period: PERIOD, answers: { best: 5 } })).rejects.toMatchObject({ status: 400 });
    await expect(call(ALEX, { action: "submit", period: PERIOD, answers: { secret_question: "hi" } })).rejects.toMatchObject({ status: 400 });
    await expect(call(ALEX, { action: "submit", period: PERIOD })).rejects.toMatchObject({ status: 400 });
  });

  it("trims answers before storing them", async () => {
    const { call } = setup();
    const view = await call(ALEX, { action: "submit", period: PERIOD, answers: { best: "  Our walk  " } });
    expect(view.mine?.best).toBe("Our walk");
    expect(Object.keys(view.mine!).sort()).toEqual(CHECKIN_QUESTIONS.map((q) => q.id).sort());
  });

  it("fails safely (no plaintext in the error) when a response cannot be decrypted", async () => {
    const { db, call } = setup();
    await call(ALEX, { action: "submit", period: PERIOD, answers: ALEX_ANSWERS });
    db.responses[0]!.ciphertext = await createSealer(randomBytes(32).toString("base64")).encryptJson(ALEX_ANSWERS, scopes.couple(COUPLE), "x");
    await expect(call(ALEX, { action: "get", period: PERIOD })).rejects.toMatchObject({ status: 500, message: expect.not.stringContaining("springs") });
  });
});
