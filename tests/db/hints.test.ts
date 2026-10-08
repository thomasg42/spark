/**
 * Module H at the database layer (migration 20261008000700), run as each user
 * under RLS. Thomas, 2026-10-08: "if they don't answer they get no hints ...
 * just keep on answering." A partner's share is readable only after you answer
 * the same question; moment-only hints show only while their moment is
 * happening; teasers say what's waiting, never what it says.
 */
import { asUser, createDb, makePairedCouple, rows, type Db } from "./harness";

let db: Db;
let alex: string, sam: string, coupleId: string;
let casey: string;
const CT = "v1.aaaa.bbbb";

beforeAll(async () => {
  db = await createDb();
  ({ alex, sam, coupleId } = await makePairedCouple(db, "a", "b"));
  ({ alex: casey } = await makePairedCouple(db, "c", "d"));
});
afterAll(async () => {
  await db.close();
});

const share = (question: string, level: "hint" | "open", showWhen: string | null = null) =>
  asUser(db, sam, (tx) =>
    tx.query(
      `insert into public.buddy_shares (user_id, couple_id, question_id, level, shared_ciphertext, show_when) values ($1, $2, $3, $4, $5, $6)
       on conflict (user_id, question_id) do update set level = excluded.level, show_when = excluded.show_when`,
      [sam, coupleId, question, level, CT, showWhen],
    ),
  );
const answer = (userId: string, question: string, skipped = false) =>
  asUser(db, userId, (tx) =>
    tx.query(
      `insert into public.private_answers (user_id, section, question_id, answer_ciphertext, skipped) values ($1, 'roots', $2, $3, $4)
       on conflict (user_id, question_id) do update set answer_ciphertext = excluded.answer_ciphertext, skipped = excluded.skipped`,
      [userId, question, skipped ? null : CT, skipped],
    ),
  );
const alexSees = () => asUser(db, alex, (tx) => rows<{ question_id: string }>(tx, "select question_id from public.buddy_shares where user_id = $1 order by question_id", [sam])).then((r) => r.map((x) => x.question_id));
const alexTeasers = () => asUser(db, alex, (tx) => rows<{ question_id: string; level: string }>(tx, "select * from public.partner_share_teasers()"));

describe("answer to unlock", () => {
  it("a partner's share stays locked until you answer the same question; a skip doesn't count", async () => {
    await share("love_language", "open");
    await share("feel_close_when", "hint");
    expect(await alexSees()).toEqual([]);
    expect(await alexTeasers()).toEqual([{ question_id: "feel_close_when", level: "hint" }, { question_id: "love_language", level: "open" }]);
    await answer(alex, "love_language", true); // skipped
    expect(await alexSees()).toEqual([]);
    await answer(alex, "love_language");
    expect(await alexSees()).toEqual(["love_language"]);
    expect(await alexTeasers()).toEqual([{ question_id: "feel_close_when", level: "hint" }]);
  });

  it("teasers never show anything kept off the table, and outsiders get nothing", async () => {
    // "leave_behind" has no share row at all (off the table), so it can never be teased.
    expect((await alexTeasers()).some((t) => t.question_id === "leave_behind")).toBe(false);
    expect(await asUser(db, casey, (tx) => rows(tx, "select * from public.partner_share_teasers()"))).toEqual([]);
    expect(await asUser(db, casey, (tx) => rows(tx, "select 1 from public.buddy_shares where user_id = $1", [sam]))).toEqual([]);
  });

  it("a moment-only setting needs a hint, not an open share", async () => {
    await expect(share("trust_one_thing", "open", "away")).rejects.toThrow();
    await expect(share("trust_one_thing", "hint", "whenever")).rejects.toThrow();
  });
});

describe("hints that wait for a moment", () => {
  beforeAll(async () => {
    for (const q of ["trust_hurts", "reassurance_style", "stress_outside"]) await answer(alex, q);
  });

  it("'feeling distant' shows only while its author has raised the flag", async () => {
    await share("trust_hurts", "hint", "feeling_distant");
    expect(await alexSees()).not.toContain("trust_hurts");
    expect((await alexTeasers()).some((t) => t.question_id === "trust_hurts")).toBe(false); // not even teased
    await asUser(db, alex, (tx) => tx.query("insert into public.distance_flags (user_id, couple_id) values ($1, $2)", [alex, coupleId]));
    expect(await alexSees()).not.toContain("trust_hurts"); // Alex's own flag doesn't unlock Sam's hint
    await asUser(db, sam, (tx) => tx.query("insert into public.distance_flags (user_id, couple_id) values ($1, $2)", [sam, coupleId]));
    expect(await alexSees()).toContain("trust_hurts");
    await asUser(db, sam, (tx) => tx.query("update public.distance_flags set raised_at = now() - interval '15 days' where user_id = $1", [sam]));
    expect(await alexSees()).not.toContain("trust_hurts"); // it fades after 14 days
    await asUser(db, sam, (tx) => tx.query("delete from public.distance_flags where user_id = $1", [sam]));
  });

  it("the distance flag is seen by the couple and changed only by its owner", async () => {
    await asUser(db, sam, (tx) => tx.query("insert into public.distance_flags (user_id, couple_id) values ($1, $2)", [sam, coupleId]));
    expect(await asUser(db, alex, (tx) => rows(tx, "select user_id from public.distance_flags where user_id = $1", [sam]))).toEqual([{ user_id: sam }]);
    expect(await asUser(db, alex, (tx) => rows(tx, "delete from public.distance_flags where user_id = $1 returning 1", [sam]))).toEqual([]);
    expect(await asUser(db, casey, (tx) => rows(tx, "select 1 from public.distance_flags where user_id = $1", [sam]))).toEqual([]);
    await expect(asUser(db, alex, (tx) => tx.query("insert into public.distance_flags (user_id, couple_id) values ($1, $2)", [sam, coupleId]))).rejects.toThrow();
    await asUser(db, sam, (tx) => tx.query("delete from public.distance_flags where user_id = $1", [sam]));
  });

  it("'when we're apart' shows while a trip or long work stretch is logged, not for a new job", async () => {
    await share("reassurance_style", "hint", "away");
    expect(await alexSees()).not.toContain("reassurance_style");
    await asUser(db, alex, (tx) => tx.query("insert into public.life_changes (couple_id, created_by, kind, happened_on) values ($1, $2, 'new_job', current_date)", [coupleId, alex]));
    expect(await alexSees()).not.toContain("reassurance_style");
    await asUser(db, alex, (tx) => tx.query("insert into public.life_changes (couple_id, created_by, kind, happened_on) values ($1, $2, 'trip', current_date + 3)", [coupleId, alex]));
    expect(await alexSees()).toContain("reassurance_style");
    await asUser(db, alex, (tx) => tx.query("delete from public.life_changes where couple_id = $1", [coupleId]));
    await asUser(db, alex, (tx) => tx.query("insert into public.life_changes (couple_id, created_by, kind, happened_on) values ($1, $2, 'work_stretch', current_date - 20)", [coupleId, alex]));
    expect(await alexSees()).not.toContain("reassurance_style"); // long over
  });

  it("'when excitement dips' counts only quick check-in weeks you BOTH answered", async () => {
    await share("stress_outside", "hint", "excitement_drop");
    const week = (back: number) => `date_trunc('week', current_date)::date - ${7 * back}`;
    const pulse = (userId: string, back: number, excitement: number) =>
      asUser(db, userId, (tx) => tx.query(`insert into public.pulses (couple_id, user_id, week_start, excitement, connection) values ($1, $2, ${week(back)}, $3, 3)`, [coupleId, userId, excitement]));
    // Sam's excitement falls 5 -> 4 -> 2, but Alex skipped the latest week: not revealed, so it doesn't count.
    await pulse(sam, 2, 5);
    await pulse(sam, 1, 4);
    await pulse(sam, 0, 2);
    await pulse(alex, 2, 4);
    await pulse(alex, 1, 4);
    expect(await alexSees()).not.toContain("stress_outside");
    await pulse(alex, 0, 4); // now all three weeks are revealed
    expect(await alexSees()).toContain("stress_outside");
  });
});
