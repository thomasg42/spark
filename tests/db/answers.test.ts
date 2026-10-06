/**
 * Module B at the database layer: the exact upsert/delete the "answers" Edge
 * Function issues (as the signed-in user, through PostgREST) works under the real
 * owner-only RLS policies, and the constraints refuse plaintext or half-skipped rows.
 */
import { asUser, createDb, makePairedCouple, rows, type Db, type Tx } from "./harness";

const CT = (label: string) => `v1.${Buffer.from(label).toString("base64url")}.ciphertext`;

// What supabase-js .upsert(row, { onConflict: "user_id,question_id" }).select(...).single() sends.
const UPSERT = `
  insert into public.private_answers (user_id, section, question_id, answer_ciphertext, skipped)
  values ($1, $2, $3, $4, $5)
  on conflict (user_id, question_id) do update set
    user_id = excluded.user_id, section = excluded.section, question_id = excluded.question_id,
    answer_ciphertext = excluded.answer_ciphertext, skipped = excluded.skipped
  returning section, question_id, answer_ciphertext, skipped, updated_at`;

type Row = { section: string; question_id: string; answer_ciphertext: string | null; skipped: boolean; updated_at: string };
const upsert = (tx: Tx, userId: string, questionId: string, ciphertext: string | null, skipped = false, section = "beginnings") =>
  rows<Row>(tx, UPSERT, [userId, section, questionId, ciphertext, skipped]);

let db: Db;
let alex: string, sam: string;

beforeAll(async () => {
  db = await createDb();
  ({ alex, sam } = await makePairedCouple(db, "qa", "qb"));
});

afterAll(async () => {
  await db.close();
});

describe("private answers upsert under RLS", () => {
  it("inserts, then updates the same row on a second save, bumping updated_at", async () => {
    const first = await asUser(db, alex, (tx) => upsert(tx, alex, "what_attracted_you", CT("first")));
    expect(first[0]).toMatchObject({ question_id: "what_attracted_you", skipped: false });
    const second = await asUser(db, alex, (tx) => upsert(tx, alex, "what_attracted_you", CT("second")));
    expect(second[0]!.answer_ciphertext).toBe(CT("second"));
    const all = await asUser(db, alex, (tx) => rows<Row>(tx, "select * from public.private_answers where question_id = 'what_attracted_you'"));
    expect(all).toHaveLength(1);
    expect(new Date(second[0]!.updated_at).getTime()).toBeGreaterThanOrEqual(new Date(first[0]!.updated_at).getTime());
  });

  it("skip clears the ciphertext; save after skip restores one", async () => {
    await asUser(db, alex, (tx) => upsert(tx, alex, "trust_level", CT("4"), false, "closeness_trust"));
    const skipped = await asUser(db, alex, (tx) => upsert(tx, alex, "trust_level", null, true, "closeness_trust"));
    expect(skipped[0]).toMatchObject({ skipped: true, answer_ciphertext: null });
    const saved = await asUser(db, alex, (tx) => upsert(tx, alex, "trust_level", CT("5"), false, "closeness_trust"));
    expect(saved[0]).toMatchObject({ skipped: false, answer_ciphertext: CT("5") });
  });

  it("the partner answering the same question gets their own row and never touches the other's", async () => {
    await asUser(db, sam, (tx) => upsert(tx, sam, "what_attracted_you", CT("sam")));
    const alexRows = await asUser(db, alex, (tx) => rows<Row>(tx, "select * from public.private_answers where question_id = 'what_attracted_you'"));
    expect(alexRows.map((r) => r.answer_ciphertext)).toEqual([CT("second")]);
    const samRows = await asUser(db, sam, (tx) => rows<Row>(tx, "select * from public.private_answers"));
    expect(samRows.map((r) => r.answer_ciphertext)).toEqual([CT("sam")]);
  });

  it("a forged upsert into the partner's account is refused", async () => {
    await expect(asUser(db, alex, (tx) => upsert(tx, sam, "what_attracted_you", CT("forged")))).rejects.toThrow(/row-level security|violates/i);
    const samRows = await asUser(db, sam, (tx) => rows<Row>(tx, "select answer_ciphertext from public.private_answers"));
    expect(samRows.map((r) => r.answer_ciphertext)).toEqual([CT("sam")]);
  });

  it("refuses plaintext and half-skipped rows", async () => {
    await expect(asUser(db, alex, (tx) => upsert(tx, alex, "five_years", "plain words"))).rejects.toThrow();
    await expect(asUser(db, alex, (tx) => upsert(tx, alex, "five_years", CT("x"), true))).rejects.toThrow();
    await expect(asUser(db, alex, (tx) => upsert(tx, alex, "five_years", null, false))).rejects.toThrow();
  });

  it("delete by user and question removes only the caller's row", async () => {
    await asUser(db, alex, (tx) => tx.query("delete from public.private_answers where user_id = $1 and question_id = $2", [alex, "what_attracted_you"]));
    const alexLeft = await asUser(db, alex, (tx) => rows<Row>(tx, "select question_id from public.private_answers"));
    expect(alexLeft.map((r) => r.question_id)).toEqual(["trust_level"]);
    const samLeft = await asUser(db, sam, (tx) => rows<Row>(tx, "select question_id from public.private_answers"));
    expect(samLeft.map((r) => r.question_id)).toEqual(["what_attracted_you"]);
  });
});
