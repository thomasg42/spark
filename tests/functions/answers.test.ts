/**
 * "answers" Edge Function logic: encryption at rest, owner-only reads, strict
 * validation, and fail-closed behaviour when the key is missing or wrong.
 * Uses an in-memory repo and the REAL sealer with a random 32-byte key.
 */
import { randomBytes } from "node:crypto";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import {
  createAnswersHandler,
  KEY_MISSING_MESSAGE,
  sealerFromEnv,
  supabaseAnswersRepo,
  UNLOCK_FAILED_MESSAGE,
  type AnswerRow,
  type AnswersRepo,
  type AnswerWrite,
  type SavedAnswerDto,
} from "@shared/answers-handler.ts";
import { aad, createSealer, scopes } from "@shared/crypto.ts";
import { HttpError, type UserContext } from "@shared/http.ts";

const KEY = randomBytes(32).toString("base64");
const OTHER_KEY = randomBytes(32).toString("base64");
const alex = "11111111-1111-4111-8111-111111111111";
const sam = "22222222-2222-4222-8222-222222222222";

type StoredRow = AnswerRow & { user_id: string };

class MemoryRepo implements AnswersRepo {
  rows: StoredRow[] = [];
  calls = 0;
  private clock = 0;
  /** When true, simulates a broken query that ignores the user filter (RLS would still stop this in production). */
  leaky = false;

  async list(userId: string, section?: string): Promise<AnswerRow[]> {
    this.calls++;
    return this.rows
      .filter((r) => (this.leaky || r.user_id === userId) && (!section || r.section === section))
      .map(({ user_id: _owner, ...row }) => ({ ...row }));
  }
  async upsert(userId: string, row: AnswerWrite): Promise<AnswerRow> {
    this.calls++;
    const updated_at = new Date(Date.UTC(2026, 9, 6, 12, 0, this.clock++)).toISOString();
    const existing = this.rows.find((r) => r.user_id === userId && r.question_id === row.question_id);
    if (existing) Object.assign(existing, row, { updated_at });
    else this.rows.push({ user_id: userId, ...row, updated_at });
    const { user_id: _owner, ...out } = this.rows.find((r) => r.user_id === userId && r.question_id === row.question_id)!;
    return { ...out };
  }
  async remove(userId: string, questionId: string): Promise<void> {
    this.calls++;
    this.rows = this.rows.filter((r) => !(r.user_id === userId && r.question_id === questionId));
  }
  row(userId: string, questionId: string) {
    return this.rows.find((r) => r.user_id === userId && r.question_id === questionId);
  }
}

const ctx = (id: string): UserContext => ({ supabase: {} as SupabaseClient, user: { id } as User });

function setup(key: string | null = KEY) {
  const repo = new MemoryRepo();
  const handler = createAnswersHandler({ repo, sealer: key ? createSealer(key) : null });
  const as = (userId: string) => (body: Record<string, unknown>) => handler(body, ctx(userId));
  return { repo, handler, as };
}

async function expectHttp(promise: Promise<unknown>, status: number, message?: string | RegExp) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(HttpError);
  expect((error as HttpError).status).toBe(status);
  if (message) expect((error as HttpError).message).toMatch(message);
}

let errorSpy: ReturnType<typeof vi.spyOn>;
let logSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
});
afterEach(() => {
  errorSpy.mockRestore();
  logSpy.mockRestore();
});

/** Nothing sensitive may ever reach the logs. */
function expectLogsFreeOf(...secrets: string[]) {
  const logged = JSON.stringify([...errorSpy.mock.calls, ...logSpy.mock.calls]);
  for (const secret of secrets) expect(logged).not.toContain(secret);
}

describe("save encrypts before anything is stored", () => {
  it("stores only v1. ciphertext that never contains the plaintext, and returns the decrypted value", async () => {
    const { repo, as } = setup();
    const secret = "Trivia night. I thought Sam was on the wrong team on purpose.";
    const { answer } = (await as(alex)({ action: "save", questionId: "how_we_met_mine", value: `  ${secret}  ` })) as { answer: SavedAnswerDto };

    expect(answer).toMatchObject({ questionId: "how_we_met_mine", section: "beginnings", value: secret, skipped: false });
    expect(typeof answer.updatedAt).toBe("string");

    const stored = repo.row(alex, "how_we_met_mine")!;
    expect(stored.section).toBe("beginnings");
    expect(stored.skipped).toBe(false);
    expect(stored.answer_ciphertext!.startsWith("v1.")).toBe(true);
    expect(stored.answer_ciphertext).not.toContain(secret);
    expect(stored.answer_ciphertext).not.toContain("Trivia");
    expect(JSON.stringify(repo.rows)).not.toContain("Trivia");
    // It opens only with the caller's scope and this exact row's associated data.
    const sealer = createSealer(KEY);
    expect(await sealer.decryptJson(stored.answer_ciphertext!, scopes.user(alex), aad.privateAnswer(alex, "how_we_met_mine"))).toBe(secret);
    await expect(sealer.decryptJson(stored.answer_ciphertext!, scopes.user(sam), aad.privateAnswer(sam, "how_we_met_mine"))).rejects.toThrow();
    expectLogsFreeOf(secret, stored.answer_ciphertext!, KEY);
  });

  it("encrypts choice, multi and scale answers too (no answer type is stored in the clear)", async () => {
    const { repo, as } = setup();
    await as(alex)({ action: "save", questionId: "met_through", value: "work" });
    await as(alex)({ action: "save", questionId: "trust_helps", value: ["honesty", "follow_through", "honesty"] });
    await as(alex)({ action: "save", questionId: "trust_level", value: 4 });
    for (const row of repo.rows) {
      expect(row.answer_ciphertext!.startsWith("v1.")).toBe(true);
      expect(row.answer_ciphertext).not.toMatch(/work|honesty|follow_through/);
    }
    const { answers } = (await as(alex)({ action: "list" })) as { answers: SavedAnswerDto[] };
    const byId = Object.fromEntries(answers.map((a) => [a.questionId, a.value]));
    expect(byId).toEqual({ met_through: "work", trust_helps: ["honesty", "follow_through"], trust_level: 4 });
  });

  it("saving again updates the same row (one row per user and question)", async () => {
    const { repo, as } = setup();
    await as(alex)({ action: "save", questionId: "trust_level", value: 2 });
    const first = repo.row(alex, "trust_level")!.answer_ciphertext;
    await as(alex)({ action: "save", questionId: "trust_level", value: 5 });
    expect(repo.rows.filter((r) => r.user_id === alex && r.question_id === "trust_level")).toHaveLength(1);
    expect(repo.row(alex, "trust_level")!.answer_ciphertext).not.toBe(first);
    const { answers } = (await as(alex)({ action: "list" })) as { answers: SavedAnswerDto[] };
    expect(answers[0]!.value).toBe(5);
  });
});

describe("list returns only the caller's own answers", () => {
  it("decrypts the caller's rows and never includes the partner's", async () => {
    const { as } = setup();
    await as(alex)({ action: "save", questionId: "what_attracted_you", value: "Alex secret: the laugh." });
    await as(sam)({ action: "save", questionId: "what_attracted_you", value: "Sam secret: kindness." });
    await as(sam)({ action: "save", questionId: "trust_level", value: 4 });

    const samView = (await as(sam)({ action: "list" })) as { answers: SavedAnswerDto[] };
    expect(samView.answers.map((a) => a.questionId).sort()).toEqual(["trust_level", "what_attracted_you"]);
    expect(JSON.stringify(samView)).not.toContain("Alex secret");
    expect(samView.answers.find((a) => a.questionId === "what_attracted_you")!.value).toBe("Sam secret: kindness.");

    const alexView = (await as(alex)({ action: "list" })) as { answers: SavedAnswerDto[] };
    expect(alexView.answers).toHaveLength(1);
    expect(JSON.stringify(alexView)).not.toContain("Sam secret");
  });

  it("filters by section when asked", async () => {
    const { as } = setup();
    await as(alex)({ action: "save", questionId: "what_attracted_you", value: "The laugh." });
    await as(alex)({ action: "save", questionId: "trust_level", value: 3 });
    const { answers } = (await as(alex)({ action: "list", section: "closeness_trust" })) as { answers: SavedAnswerDto[] };
    expect(answers.map((a) => a.questionId)).toEqual(["trust_level"]);
  });

  it("rejects an unknown section with a 400", async () => {
    const { as } = setup();
    await expectHttp(as(alex)({ action: "list", section: "intimacy" }), 400);
    await expectHttp(as(alex)({ action: "list", section: 42 }), 400);
  });

  it("even if storage wrongly returned the partner's rows, they cannot be opened as the caller (fails closed, no plaintext)", async () => {
    const { repo, as } = setup();
    await as(alex)({ action: "save", questionId: "trust_hurts", value: "Alex private worry." });
    repo.leaky = true;
    await expectHttp(as(sam)({ action: "list" }), 500, UNLOCK_FAILED_MESSAGE);
    expectLogsFreeOf("Alex private worry", repo.rows[0]!.answer_ciphertext!);
  });

  it("a ciphertext moved into a different question's row will not open", async () => {
    const { repo, as } = setup();
    await as(alex)({ action: "save", questionId: "trust_hurts", value: "Moved secret." });
    repo.row(alex, "trust_hurts")!.question_id = "trust_one_thing";
    await expectHttp(as(alex)({ action: "list" }), 500, UNLOCK_FAILED_MESSAGE);
  });
});

describe("validation", () => {
  it("rejects unknown or malformed question ids with a 400 and stores nothing", async () => {
    const { repo, as } = setup();
    await expectHttp(as(alex)({ action: "save", questionId: "not_a_question", value: "x" }), 400, /doesn't exist/);
    await expectHttp(as(alex)({ action: "skip", questionId: "not_a_question" }), 400);
    await expectHttp(as(alex)({ action: "save", questionId: "DROP TABLE", value: "x" }), 400);
    await expectHttp(as(alex)({ action: "save", value: "x" }), 400);
    await expectHttp(as(alex)({ action: "clear", questionId: 7 }), 400);
    expect(repo.calls).toBe(0);
  });

  it("rejects invalid values with a 400 and stores nothing", async () => {
    const { repo, as } = setup();
    await expectHttp(as(alex)({ action: "save", questionId: "met_through", value: "space" }), 400, /Pick one/);
    await expectHttp(as(alex)({ action: "save", questionId: "trust_level", value: 7 }), 400, /1 to 5/);
    await expectHttp(as(alex)({ action: "save", questionId: "trust_level", value: 2.5 }), 400);
    await expectHttp(as(alex)({ action: "save", questionId: "trust_helps", value: [] }), 400);
    await expectHttp(as(alex)({ action: "save", questionId: "trust_helps", value: ["honesty", "spying"] }), 400);
    await expectHttp(as(alex)({ action: "save", questionId: "what_attracted_you", value: "   " }), 400, /empty/i);
    await expectHttp(as(alex)({ action: "save", questionId: "what_attracted_you", value: "x".repeat(2001) }), 400, /too long/);
    await expectHttp(as(alex)({ action: "save", questionId: "what_attracted_you", value: { evil: true } }), 400);
    expect(repo.calls).toBe(0);
  });

  it("rejects unknown actions", async () => {
    const { as } = setup();
    await expectHttp(as(alex)({ action: "share_with_partner", questionId: "trust_level" }), 400, /Unknown action/);
    await expectHttp(as(alex)({}), 400);
  });

  it("requires a signed-in caller", async () => {
    const { handler } = setup();
    await expectHttp(handler({ action: "list" }, { supabase: {} as SupabaseClient, user: {} as User }), 401);
  });
});

describe("skip and clear", () => {
  it("skip stores skipped=true with no ciphertext, and a later save replaces it", async () => {
    const { repo, as } = setup();
    const { answer } = (await as(alex)({ action: "skip", questionId: "comfortable_getting_close" })) as { answer: SavedAnswerDto };
    expect(answer).toMatchObject({ questionId: "comfortable_getting_close", section: "beginnings", value: null, skipped: true });
    expect(repo.row(alex, "comfortable_getting_close")).toMatchObject({ skipped: true, answer_ciphertext: null });

    const listed = (await as(alex)({ action: "list" })) as { answers: SavedAnswerDto[] };
    expect(listed.answers).toEqual([expect.objectContaining({ questionId: "comfortable_getting_close", value: null, skipped: true })]);

    await as(alex)({ action: "save", questionId: "comfortable_getting_close", value: "Going slow." });
    const row = repo.row(alex, "comfortable_getting_close")!;
    expect(row.skipped).toBe(false);
    expect(row.answer_ciphertext!.startsWith("v1.")).toBe(true);
  });

  it("skipping an answered question drops its ciphertext", async () => {
    const { repo, as } = setup();
    await as(alex)({ action: "save", questionId: "trust_level", value: 3 });
    await as(alex)({ action: "skip", questionId: "trust_level" });
    expect(repo.row(alex, "trust_level")).toMatchObject({ skipped: true, answer_ciphertext: null });
  });

  it("clear deletes only the caller's row", async () => {
    const { repo, as } = setup();
    await as(alex)({ action: "save", questionId: "what_attracted_you", value: "Alex answer." });
    await as(sam)({ action: "save", questionId: "what_attracted_you", value: "Sam answer." });
    expect(await as(sam)({ action: "clear", questionId: "what_attracted_you" })).toEqual({ ok: true });
    expect(repo.row(sam, "what_attracted_you")).toBeUndefined();
    expect(repo.row(alex, "what_attracted_you")).toBeDefined();
    const alexView = (await as(alex)({ action: "list" })) as { answers: SavedAnswerDto[] };
    expect(alexView.answers[0]!.value).toBe("Alex answer.");
  });

  it("clear accepts a well-formed id for a retired question so old rows can still be removed", async () => {
    const { repo, as } = setup();
    repo.rows.push({ user_id: alex, section: "beginnings", question_id: "retired_question", answer_ciphertext: null, skipped: true, updated_at: "2026-01-01T00:00:00.000Z" });
    await as(alex)({ action: "clear", questionId: "retired_question" });
    expect(repo.rows).toHaveLength(0);
  });
});

describe("fails closed without a usable encryption key", () => {
  it("sealerFromEnv returns null for a missing, empty, short or garbage key", () => {
    expect(sealerFromEnv(undefined)).toBeNull();
    expect(sealerFromEnv(null)).toBeNull();
    expect(sealerFromEnv("")).toBeNull();
    expect(sealerFromEnv("   ")).toBeNull();
    expect(sealerFromEnv(randomBytes(16).toString("base64"))).toBeNull();
    expect(sealerFromEnv("%%%not base64%%%")).toBeNull();
    expect(sealerFromEnv(KEY)).not.toBeNull();
  });

  it("every action returns a safe 500 and never touches storage", async () => {
    const { repo, as } = setup(null);
    for (const body of [
      { action: "list" },
      { action: "save", questionId: "trust_level", value: 3 },
      { action: "skip", questionId: "trust_level" },
      { action: "clear", questionId: "trust_level" },
    ]) {
      await expectHttp(as(alex)(body), 500, KEY_MISSING_MESSAGE);
    }
    expect(repo.calls).toBe(0);
    expect(repo.rows).toHaveLength(0);
  });

  it("a wrong key cannot read existing answers and says so safely (nothing is hidden or overwritten)", async () => {
    const repo = new MemoryRepo();
    await createAnswersHandler({ repo, sealer: createSealer(KEY) })({ action: "save", questionId: "five_years", value: "A porch and a dog." }, ctx(alex));
    const before = JSON.stringify(repo.rows);
    await expectHttp(createAnswersHandler({ repo, sealer: createSealer(OTHER_KEY) })({ action: "list" }, ctx(alex)), 500, UNLOCK_FAILED_MESSAGE);
    expect(JSON.stringify(repo.rows)).toBe(before);
    expectLogsFreeOf("A porch and a dog", KEY, OTHER_KEY);
  });
});

describe("supabaseAnswersRepo", () => {
  /** A chainable stand-in for the PostgREST query builder that records every call. */
  function fakeClient(result: { data: unknown; error: unknown }) {
    const calls: unknown[][] = [];
    const builder: Record<string, unknown> = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === "then") return (resolve: (v: unknown) => void) => resolve(result);
          return (...args: unknown[]) => {
            calls.push([String(prop), ...args]);
            return builder;
          };
        },
      },
    );
    const client = {
      from(table: string) {
        calls.push(["from", table]);
        return builder;
      },
    };
    return { client: client as unknown as SupabaseClient, calls };
  }

  it("list filters by the caller's user id (and section) on top of RLS", async () => {
    const { client, calls } = fakeClient({ data: [], error: null });
    await supabaseAnswersRepo(client).list(alex, "beginnings");
    expect(calls).toContainEqual(["from", "private_answers"]);
    expect(calls).toContainEqual(["eq", "user_id", alex]);
    expect(calls).toContainEqual(["eq", "section", "beginnings"]);
  });

  it("upsert writes the caller's id and resolves conflicts on (user_id, question_id)", async () => {
    const row = { section: "beginnings", question_id: "trust_level", answer_ciphertext: "v1.a.b", skipped: false, updated_at: "2026-10-06T00:00:00Z" };
    const { client, calls } = fakeClient({ data: row, error: null });
    const out = await supabaseAnswersRepo(client).upsert(alex, { section: "beginnings", question_id: "trust_level", answer_ciphertext: "v1.a.b", skipped: false });
    expect(out).toEqual(row);
    expect(calls).toContainEqual([
      "upsert",
      { user_id: alex, section: "beginnings", question_id: "trust_level", answer_ciphertext: "v1.a.b", skipped: false },
      { onConflict: "user_id,question_id" },
    ]);
  });

  it("remove deletes by the caller's id and the question id", async () => {
    const { client, calls } = fakeClient({ data: null, error: null });
    await supabaseAnswersRepo(client).remove(sam, "trust_level");
    expect(calls).toContainEqual(["delete"]);
    expect(calls).toContainEqual(["eq", "user_id", sam]);
    expect(calls).toContainEqual(["eq", "question_id", "trust_level"]);
  });

  it("maps database errors to safe HTTP errors", async () => {
    const { client } = fakeClient({ data: null, error: { code: "42501", message: "new row violates row-level security policy" } });
    await expectHttp(supabaseAnswersRepo(client).list(alex), 403, "You don't have access to that.");
    const other = fakeClient({ data: null, error: { code: "23514", message: "internal detail" } });
    await expectHttp(supabaseAnswersRepo(other.client).upsert(alex, { section: "beginnings", question_id: "x1", answer_ciphertext: null, skipped: true }), 400, "Could not save your answer.");
  });
});
