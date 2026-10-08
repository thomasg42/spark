/**
 * "buddy" Edge Function logic: shares sealed under the couple key, partner sees
 * only hint/open shares, off-the-table answers never reach the partner's Buddy
 * or Claude, Claude only with the person's AI consent, crisis bypasses the model,
 * conversations encrypted at rest, and fail-closed without the key.
 * In-memory repo, the REAL sealer, and a fake Claude that records its prompts.
 */
import { randomBytes } from "node:crypto";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createBuddyHandler, KEY_MISSING_MESSAGE, RATE_LIMIT_MESSAGE, BUDDY_NOTICES, type BuddyRepo, type MessageRow, type ShareRow } from "@shared/buddy-handler.ts";
import { MAX_USER_MESSAGES_PER_DAY, type BuddyReply, type BuddyShare } from "@shared/buddy.ts";
import { aad, createSealer, scopes } from "@shared/crypto.ts";
import { HttpError, type UserContext } from "@shared/http.ts";
import type { JsonGenerator, JsonRequest } from "@shared/llm.ts";

const KEY = randomBytes(32).toString("base64");
const sealer = createSealer(KEY);
const alex = "11111111-1111-4111-8111-111111111111";
const sam = "22222222-2222-4222-8222-222222222222";
const COUPLE = "33333333-3333-4333-8333-333333333333";
const SAM_PRIVATE = "My ex cheated on me and I still flinch at late nights.";

/** One shared store, viewed through a repo per user (like RLS would). */
class World {
  shares: ShareRow[] = [];
  messages: Array<MessageRow & { user_id: string }> = [];
  answers = new Map<string, { ciphertext: string | null; skipped: boolean }>();
  clock = 0;
  voiceUsed = new Map<string, number>();

  async seedAnswer(userId: string, questionId: string, value: unknown) {
    this.answers.set(`${userId}|${questionId}`, { ciphertext: await sealer.encryptJson(value, scopes.user(userId), aad.privateAnswer(userId, questionId)), skipped: false });
  }

  repoFor(userId: string): BuddyRepo {
    const partner = userId === alex ? sam : alex;
    return {
      couple: async () => ({ coupleId: COUPLE, partnerId: partner }),
      // RLS: own rows, or the partner's hint/open rows.
      shares: async (ownerId) => this.shares.filter((r) => r.user_id === ownerId && (ownerId === userId || (ownerId === partner && (r.level === "hint" || r.level === "open")))),
      upsertShare: async (row) => {
        const updated_at = new Date(Date.UTC(2026, 9, 6, 12, 0, this.clock++)).toISOString();
        this.shares = this.shares.filter((r) => !(r.user_id === userId && r.question_id === row.questionId));
        const stored: ShareRow = { user_id: userId, question_id: row.questionId, level: row.level, shared_ciphertext: row.ciphertext, updated_at, show_when: row.showWhen };
        this.shares.push(stored);
        return stored;
      },
      deleteShare: async (questionId) => {
        this.shares = this.shares.filter((r) => !(r.user_id === userId && r.question_id === questionId));
      },
      ownAnswer: async (questionId) => this.answers.get(`${userId}|${questionId}`) ?? null,
      // Deliberately NOT applied in shares() above: the handler's own answer-to-unlock guard must hold by itself.
      answeredQuestionIds: async () => [...this.answers.entries()].filter(([k, v]) => k.startsWith(`${userId}|`) && !v.skipped).map(([k]) => k.split("|")[1]!),
      teasers: async () =>
        this.shares
          .filter((r) => r.user_id === partner && !this.answers.get(`${userId}|${r.question_id}`)?.ciphertext)
          .map((r) => ({ questionId: r.question_id, level: r.level })),
      messages: async (limit) => this.messages.filter((m) => m.user_id === userId).slice(-limit),
      insertMessages: async (rows) => {
        for (const r of rows) this.messages.push({ id: r.id, user_id: userId, role: r.role, body_ciphertext: r.ciphertext, created_at: new Date(Date.UTC(2026, 9, 6, 12, 0, this.clock++)).toISOString() });
      },
      clearMessages: async () => {
        this.messages = this.messages.filter((m) => m.user_id !== userId);
      },
      userMessagesSince: async () => this.messages.filter((m) => m.user_id === userId && m.role === "user").length,
      chargeVoice: async (chars) => {
        this.voiceUsed.set(userId, (this.voiceUsed.get(userId) ?? 0) + chars);
        return this.voiceUsed.get(userId)!;
      },
    };
  }
}

const ctx = (id: string): UserContext => ({ supabase: {} as SupabaseClient, user: { id } as User });
const context = { today: "2026-10-06", me: { name: "Alex", birthday: "1994-05-17" }, partner: { name: "Sam", birthday: "1993-11-02" } };

function fakeClaude(reply: Record<string, unknown> = { reply: "Here's a thought.", start_interview: false, actions: [] }) {
  const prompts: JsonRequest[] = [];
  const generate: JsonGenerator = async (req) => {
    prompts.push(req);
    return { ok: true, json: req.schema && "properties" in req.schema && (req.schema.properties as Record<string, unknown>).hint ? { hint: "They value protected time together." } : reply };
  };
  return { prompts, generate };
}

let world: World;
let now: Date;
const handlerFor = (userId: string, generate?: JsonGenerator | null, key: typeof sealer | null = sealer) => {
  let n = 0;
  return (body: Record<string, unknown>) =>
    createBuddyHandler({ repo: world.repoFor(userId), sealer: key, generate, now: () => now, newId: () => `${userId.slice(0, 4)}-${now.getTime()}-${n++}` })(body, ctx(userId));
};

beforeEach(async () => {
  world = new World();
  now = new Date("2026-10-06T18:00:00Z");
  await world.seedAnswer(sam, "love_language", ["time", "words"]);
  await world.seedAnswer(sam, "trust_hurts", SAM_PRIVATE);
  await world.seedAnswer(sam, "leave_behind", "Something Sam keeps off the table.");
});

describe("shares", () => {
  it("seals what is shared under the couple key, and stores nothing for off the table", async () => {
    const samBuddy = handlerFor(sam);
    const open = (await samBuddy({ action: "share", questionId: "love_language", level: "open" })) as { share: BuddyShare };
    expect(open.share.text).toBe("Kind words and hearing it out loud; Quality time, just us");
    const hint = (await samBuddy({ action: "share", questionId: "trust_hurts", level: "hint", hint: "Protecting time together matters to them." })) as { share: BuddyShare };
    expect(hint.share.text).toBe("Protecting time together matters to them.");
    await samBuddy({ action: "share", questionId: "leave_behind", level: "private" });

    expect(world.shares.map((r) => r.question_id).sort()).toEqual(["love_language", "trust_hurts"]);
    const raw = JSON.stringify(world.shares);
    expect(raw).not.toContain("Quality time");
    expect(raw).not.toContain("cheated");
    for (const r of world.shares) expect(r.shared_ciphertext.startsWith("v1.")).toBe(true);
    // The hint row holds the approved hint, never the private answer.
    const hintRow = world.shares.find((r) => r.question_id === "trust_hurts")!;
    expect(await sealer.decrypt(hintRow.shared_ciphertext, scopes.couple(COUPLE), aad.buddyShare(sam, "trust_hurts"))).not.toContain("cheated");
  });

  it("requires an answer, a valid level and a real hint", async () => {
    const samBuddy = handlerFor(sam);
    await expect(samBuddy({ action: "share", questionId: "five_years", level: "open" })).rejects.toThrow(/Answer this question first/);
    await expect(samBuddy({ action: "share", questionId: "trust_hurts", level: "everyone" })).rejects.toThrow(HttpError);
    await expect(samBuddy({ action: "share", questionId: "trust_hurts", level: "hint", hint: "  " })).rejects.toThrow(/hint/);
    await expect(samBuddy({ action: "share", questionId: "../../etc", level: "open" })).rejects.toThrow(/doesn't exist/);
  });

  it("lists only your own shares and lets you unshare", async () => {
    const samBuddy = handlerFor(sam);
    await samBuddy({ action: "share", questionId: "love_language", level: "open" });
    expect(((await handlerFor(alex)({ action: "shares" })) as { shares: BuddyShare[] }).shares).toEqual([]);
    expect(((await samBuddy({ action: "shares" })) as { shares: BuddyShare[] }).shares).toHaveLength(1);
    await samBuddy({ action: "unshare", questionId: "love_language" });
    expect(world.shares).toEqual([]);
  });
});

describe("talking to Buddy", () => {
  beforeEach(async () => {
    const samBuddy = handlerFor(sam);
    await samBuddy({ action: "share", questionId: "love_language", level: "open" });
    await samBuddy({ action: "share", questionId: "trust_hurts", level: "hint", hint: "Protecting time together matters to them." });
    // Answer to unlock (Module H): Alex has answered the same two questions.
    await world.seedAnswer(alex, "love_language", ["touch"]);
    await world.seedAnswer(alex, "trust_hurts", "Last-minute cancellations.");
  });

  // Thomas, 2026-10-08: "if they don't answer they get no hints." The handler holds this even if RLS were loosened.
  it("keeps a share locked until the reader answers the same question, and says what's waiting", async () => {
    world.answers.delete(`${alex}|trust_hurts`);
    const claude = fakeClaude();
    await handlerFor(alex, claude.generate)({ action: "send", text: "Is Sam upset with me?", context, aiConsent: true });
    expect(claude.prompts[0]!.user).not.toContain("Protecting time together matters to them.");
    expect(claude.prompts[0]!.user).toContain("Quality time, just us");
    const hints = (await handlerFor(alex)({ action: "partner_hints" })) as { shares: Array<{ questionId: string; text: string }>; teasers: Array<{ questionId: string; level: string }> };
    expect(hints.shares.map((x) => x.questionId)).toEqual(["love_language"]);
    expect(hints.teasers).toEqual([{ questionId: "trust_hurts", level: "hint" }]);
    expect(JSON.stringify(hints.teasers)).not.toContain("Protecting");
  });

  it("stores a moment-only setting for hints only, and refuses an unknown moment", async () => {
    const samBuddy = handlerFor(sam);
    const hint = (await samBuddy({ action: "share", questionId: "trust_hurts", level: "hint", hint: "Protecting time together matters to them.", showWhen: "away" })) as { share: { showWhen: string | null } };
    expect(hint.share.showWhen).toBe("away");
    const open = (await samBuddy({ action: "share", questionId: "love_language", level: "open", showWhen: "away" })) as { share: { showWhen: string | null } };
    expect(open.share.showWhen).toBeNull();
    await expect(samBuddy({ action: "share", questionId: "trust_hurts", level: "hint", hint: "x y z", showWhen: "whenever" })).rejects.toThrow(/when this hint should show/);
  });

  it("gives Claude the partner's shares and never an off-the-table answer, only with consent", async () => {
    const claude = fakeClaude();
    const result = (await handlerFor(alex, claude.generate)({ action: "send", text: "Is Sam upset with me?", context, aiConsent: true })) as { reply: BuddyReply; notice: string | null };
    expect(result.reply.source).toBe("claude");
    expect(result.notice).toBeNull();
    const prompt = claude.prompts[0]!.user;
    expect(prompt).toContain("Protecting time together matters to them.");
    expect(prompt).toContain("Quality time, just us");
    expect(prompt).not.toContain("cheated");
    expect(prompt).not.toContain("keeps off the table");
  });

  it("never calls Claude without consent", async () => {
    const claude = fakeClaude();
    const result = (await handlerFor(alex, claude.generate)({ action: "send", text: "Is Sam upset with me?", context })) as { reply: BuddyReply; notice: string | null };
    expect(claude.prompts).toHaveLength(0);
    expect(result.reply.source).toBe("fallback");
    expect(result.notice).toBe(BUDDY_NOTICES.aiOff);
    expect(result.reply.reply).toContain("Protecting time together matters to them.");
    expect(result.reply.reply).not.toContain("cheated");
  });

  it("routes a possible emergency to resources, never to the model", async () => {
    const claude = fakeClaude();
    const result = (await handlerFor(alex, claude.generate)({ action: "send", text: "He threatened me and I'm not safe", context, aiConsent: true })) as { reply: BuddyReply };
    expect(claude.prompts).toHaveLength(0);
    expect(result.reply.crisis).toBe(true);
  });

  it("falls back cleanly when Claude fails or returns junk", async () => {
    const broken: JsonGenerator = async () => ({ ok: false, reason: "api_error" });
    const r1 = (await handlerFor(alex, broken)({ action: "send", text: "plan a date night", context, aiConsent: true })) as { reply: BuddyReply; notice: string };
    expect(r1.notice).toBe(BUDDY_NOTICES.unavailable);
    const junk: JsonGenerator = async () => ({ ok: true, json: { nope: 1 } });
    const r2 = (await handlerFor(alex, junk)({ action: "send", text: "plan a date night", context, aiConsent: true })) as { reply: BuddyReply };
    expect(r2.reply.source).toBe("fallback");
  });

  it("stores the conversation encrypted, only for its owner", async () => {
    await handlerFor(alex)({ action: "send", text: "My secret worry is money", context });
    expect(JSON.stringify(world.messages)).not.toContain("secret worry");
    const { turns } = (await handlerFor(alex)({ action: "history" })) as { turns: Array<{ role: string; text: string }> };
    expect(turns.map((t) => t.role)).toEqual(["user", "buddy"]);
    expect(turns[0]!.text).toBe("My secret worry is money");
    expect(((await handlerFor(sam)({ action: "history" })) as { turns: unknown[] }).turns).toEqual([]);
    await handlerFor(alex)({ action: "clear" });
    expect(world.messages).toEqual([]);
  });

  it("rate limits and validates input", async () => {
    for (let i = 0; i < MAX_USER_MESSAGES_PER_DAY; i++) world.messages.push({ id: `m${i}`, user_id: alex, role: "user", body_ciphertext: "v1.x.y", created_at: now.toISOString() });
    await expect(handlerFor(alex)({ action: "send", text: "hi", context })).rejects.toThrow(RATE_LIMIT_MESSAGE);
    await expect(handlerFor(sam)({ action: "send", text: "   ", context })).rejects.toThrow(/Say something/);
    await expect(handlerFor(sam)({ action: "send", text: "hi", context, interviewQuestionId: "made_up" })).rejects.toThrow(/doesn't exist/);
    await expect(handlerFor(sam)({ action: "dance" })).rejects.toThrow(/Unknown action/);
  });
});

describe("hint drafting", () => {
  it("uses Claude only with consent, and the built-in hint otherwise", async () => {
    const claude = fakeClaude();
    const withAi = (await handlerFor(sam, claude.generate)({ action: "draft_hint", questionId: "trust_hurts", aiConsent: true })) as { hint: string; source: string };
    expect(withAi).toEqual({ hint: "They value protected time together.", source: "claude" });
    const noAi = (await handlerFor(sam, claude.generate)({ action: "draft_hint", questionId: "trust_hurts" })) as { hint: string; source: string };
    expect(noAi.source).toBe("fallback");
    expect(noAi.hint).not.toContain("cheated");
    expect(claude.prompts).toHaveLength(1);
  });
});

it("fails closed without the encryption key", async () => {
  await expect(handlerFor(alex, null, null)({ action: "history" })).rejects.toThrow(KEY_MISSING_MESSAGE);
});


describe("Module L coaching styles", () => {
  const anchors = {purpose:"My own mission",routine:"Work and rest",skill:"Cooking",community:"Friends",hobby:"Gaming",selfReliance:[]};
  it("blocks manipulation before Claude for every track", async () => {
    for (const track of ["driven","warm","balanced"]) {
      const ai=fakeClaude();
      const result=await handlerFor(alex,ai.generate)({action:"send",text:"How do I test my partner with silence?",context:{...context,lifeAnchors:{...anchors,track}},aiConsent:true}) as {reply:BuddyReply};
      expect(result.reply.reply).toMatch(/won.t help/);expect(ai.prompts).toHaveLength(0);
    }
  });
  it("uses the selected style in the model prompt and rejects generated labels", async () => {
    const ai=fakeClaude({reply:"Your partner is toxic",start_interview:false,actions:[],follow_up:""});
    const result=await handlerFor(alex,ai.generate)({action:"send",text:"Help with my weekly routine",context:{...context,lifeAnchors:{...anchors,track:"warm"}},aiConsent:true}) as {reply:BuddyReply};
    expect(ai.prompts[0]?.system).toContain("Coaching style: Warm");
    expect(ai.prompts[0]?.user).toContain("My own mission");
    expect(result.reply.reply).not.toContain("toxic");expect(result.reply.source).toBe("fallback");
  });
});
