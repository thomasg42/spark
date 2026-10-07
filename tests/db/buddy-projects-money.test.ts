/**
 * Spark Buddy, Projects and Money at the database layer, run as each user under
 * RLS exactly as Supabase would: shares readable by the partner only (and never
 * writable by them), conversations owner-only, the shared calendar and projects
 * couple-only, private savings goals invisible unless their owner shares them.
 */
import { asAnon, asUser, createDb, makePairedCouple, rows, type Db } from "./harness";

let db: Db;
let alex: string, sam: string, coupleId: string;
let casey: string, otherCouple: string;
const CT = "v1.aaaa.bbbb";

beforeAll(async () => {
  db = await createDb();
  ({ alex, sam, coupleId } = await makePairedCouple(db, "a", "b"));
  ({ alex: casey, coupleId: otherCouple } = await makePairedCouple(db, "c", "d"));
});
afterAll(async () => {
  await db.close();
});

describe("buddy_shares", () => {
  beforeAll(async () => {
    await asUser(db, sam, (tx) =>
      tx.query(
        `insert into public.buddy_shares (user_id, couple_id, question_id, level, shared_ciphertext) values ($1, $2, 'love_language', 'open', $3), ($1, $2, 'trust_hurts', 'hint', $3)`,
        [sam, coupleId, CT],
      ),
    );
  });

  it("the partner can read hint/open shares; outsiders and signed-out visitors can't", async () => {
    expect(await asUser(db, alex, (tx) => rows(tx, "select question_id from public.buddy_shares order by question_id"))).toEqual([{ question_id: "love_language" }, { question_id: "trust_hurts" }]);
    expect(await asUser(db, casey, (tx) => rows(tx, "select 1 from public.buddy_shares"))).toEqual([]);
    await expect(asAnon(db, (tx) => rows(tx, "select 1 from public.buddy_shares"))).rejects.toThrow();
  });

  it("there is no 'private' level: off-the-table answers can never be stored as a share", async () => {
    await expect(
      asUser(db, sam, (tx) => tx.query(`insert into public.buddy_shares (user_id, couple_id, question_id, level, shared_ciphertext) values ($1, $2, 'leave_behind', 'private', $3)`, [sam, coupleId, CT])),
    ).rejects.toThrow();
  });

  it("the partner can't write, change or delete someone else's shares, and plaintext is refused", async () => {
    await expect(
      asUser(db, alex, (tx) => tx.query(`insert into public.buddy_shares (user_id, couple_id, question_id, level, shared_ciphertext) values ($1, $2, 'five_years', 'open', $3)`, [sam, coupleId, CT])),
    ).rejects.toThrow();
    const changed = await asUser(db, alex, (tx) => rows(tx, `update public.buddy_shares set level = 'open' where user_id = $1 returning 1`, [sam]));
    expect(changed).toEqual([]);
    const deleted = await asUser(db, alex, (tx) => rows(tx, `delete from public.buddy_shares where user_id = $1 returning 1`, [sam]));
    expect(deleted).toEqual([]);
    await expect(
      asUser(db, sam, (tx) => tx.query(`insert into public.buddy_shares (user_id, couple_id, question_id, level, shared_ciphertext) values ($1, $2, 'home_felt_like', 'open', 'plain words')`, [sam, coupleId])),
    ).rejects.toThrow();
    await expect(
      asUser(db, sam, (tx) => tx.query(`insert into public.buddy_shares (user_id, couple_id, question_id, level, shared_ciphertext) values ($1, $2, 'home_felt_like', 'open', $3)`, [sam, otherCouple, CT])),
    ).rejects.toThrow();
  });
});

describe("buddy_messages", () => {
  it("are visible only to their owner", async () => {
    await asUser(db, alex, (tx) => tx.query(`insert into public.buddy_messages (id, user_id, couple_id, role, body_ciphertext) values (gen_random_uuid(), $1, $2, 'user', $3)`, [alex, coupleId, CT]));
    expect(await asUser(db, alex, (tx) => rows(tx, "select role from public.buddy_messages"))).toEqual([{ role: "user" }]);
    expect(await asUser(db, sam, (tx) => rows(tx, "select 1 from public.buddy_messages"))).toEqual([]);
    await expect(
      asUser(db, sam, (tx) => tx.query(`insert into public.buddy_messages (id, user_id, couple_id, role, body_ciphertext) values (gen_random_uuid(), $1, $2, 'user', $3)`, [alex, coupleId, CT])),
    ).rejects.toThrow();
  });
});

describe("date_plans", () => {
  it("are shared by the couple; only the creator can delete", async () => {
    const [plan] = await asUser(db, alex, (tx) => rows<{ id: string }>(tx, `insert into public.date_plans (couple_id, created_by, title, planned_for, planned_time) values ($1, $2, 'Date night', '2026-10-09', '19:00') returning id`, [coupleId, alex]));
    expect(await asUser(db, sam, (tx) => rows(tx, "select title from public.date_plans"))).toEqual([{ title: "Date night" }]);
    expect(await asUser(db, casey, (tx) => rows(tx, "select 1 from public.date_plans"))).toEqual([]);
    expect(await asUser(db, sam, (tx) => rows(tx, "delete from public.date_plans where id = $1 returning 1", [plan!.id]))).toEqual([]);
    expect(await asUser(db, alex, (tx) => rows(tx, "delete from public.date_plans where id = $1 returning 1", [plan!.id]))).toHaveLength(1);
  });
});

describe("projects", () => {
  it("rank new projects at the bottom and reorder with move_project", async () => {
    for (const title of ["Paint the baby's room", "Finish the garage", "Save for a vacation"]) {
      await asUser(db, sam, (tx) => tx.query(`insert into public.projects (couple_id, created_by, title, kind) values ($1, $2, $3, 'home')`, [coupleId, sam, title]));
    }
    const order = () => asUser(db, alex, (tx) => rows<{ title: string; rank: number }>(tx, "select title, rank from public.projects order by rank, created_at"));
    expect((await order()).map((p) => p.rank)).toEqual([1, 2, 3]);
    const [vacation] = (await order()).filter((p) => p.title === "Save for a vacation");
    const id = (await asUser(db, alex, (tx) => rows<{ id: string }>(tx, "select id from public.projects where title = $1", [vacation!.title])))[0]!.id;
    await asUser(db, alex, (tx) => tx.query("select public.move_project($1, 'up')", [id]));
    expect((await order()).map((p) => p.title)).toEqual(["Paint the baby's room", "Save for a vacation", "Finish the garage"]);
    await asUser(db, alex, (tx) => tx.query("select public.move_project($1, 'down')", [id]));
    await asUser(db, alex, (tx) => tx.query("select public.move_project($1, 'down')", [id])); // already last: no-op
    expect((await order()).map((p) => p.title)).toEqual(["Paint the baby's room", "Finish the garage", "Save for a vacation"]);
  });

  it("are invisible and unchangeable outside the couple", async () => {
    expect(await asUser(db, casey, (tx) => rows(tx, "select 1 from public.projects"))).toEqual([]);
    const id = (await asUser(db, alex, (tx) => rows<{ id: string }>(tx, "select id from public.projects limit 1")))[0]!.id;
    await asUser(db, casey, (tx) => tx.query("select public.move_project($1, 'up')", [id]).catch(() => null));
    expect(await asUser(db, casey, (tx) => rows(tx, "update public.projects set title = 'hacked' where id = $1 returning 1", [id]))).toEqual([]);
  });
});

describe("money_goals", () => {
  let joint: string, alexPrivate: string, alexShared: string;
  beforeAll(async () => {
    const insert = (scope: string, title: string, visible: boolean) =>
      asUser(db, alex, (tx) => rows<{ id: string }>(tx, `insert into public.money_goals (couple_id, owner_id, scope, title, saved_cents, visible_to_partner) values ($1, $2, $3, $4, 1000, $5) returning id`, [coupleId, alex, scope, title, visible]));
    joint = (await insert("joint", "Vacation fund", false))[0]!.id;
    alexPrivate = (await insert("mine", "My savings", false))[0]!.id;
    alexShared = (await insert("mine", "New camera", true))[0]!.id;
  });

  it("the partner sees joint goals and shared personal goals, never private ones", async () => {
    const seen = await asUser(db, sam, (tx) => rows<{ title: string }>(tx, "select title from public.money_goals order by title"));
    expect(seen.map((g) => g.title)).toEqual(["New camera", "Vacation fund"]);
    expect(await asUser(db, casey, (tx) => rows(tx, "select 1 from public.money_goals"))).toEqual([]);
  });

  it("the partner can update joint goals but never someone else's personal goal", async () => {
    expect(await asUser(db, sam, (tx) => rows(tx, "update public.money_goals set saved_cents = 5000 where id = $1 returning 1", [joint]))).toHaveLength(1);
    expect(await asUser(db, sam, (tx) => rows(tx, "update public.money_goals set saved_cents = 0 where id = $1 returning 1", [alexShared]))).toEqual([]);
    expect(await asUser(db, sam, (tx) => rows(tx, "update public.money_goals set visible_to_partner = true where id = $1 returning 1", [alexPrivate]))).toEqual([]);
    expect(await asUser(db, sam, (tx) => rows(tx, "delete from public.money_goals where id = $1 returning 1", [joint]))).toEqual([]);
  });

  it("a goal's owner and type are frozen, and amounts stay in range", async () => {
    await expect(asUser(db, sam, (tx) => tx.query("update public.money_goals set scope = 'mine', owner_id = $2 where id = $1", [joint, sam]))).rejects.toThrow(/can't be changed/);
    await expect(asUser(db, alex, (tx) => tx.query("update public.money_goals set saved_cents = -1 where id = $1", [alexPrivate]))).rejects.toThrow();
    await expect(
      asUser(db, sam, (tx) => tx.query(`insert into public.money_goals (couple_id, owner_id, scope, title) values ($1, $2, 'mine', 'Sneaky')`, [coupleId, alex])),
    ).rejects.toThrow();
  });
});
