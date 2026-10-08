/**
 * Module E at the database layer (migration 20261008000600), run as each user
 * under RLS: standing dates and life changes are shared by the couple, only
 * the person who set or logged one can change or remove it, outsiders and
 * signed-out visitors see nothing.
 */
import { asAnon, asUser, createDb, makePairedCouple, rows, type Db } from "./harness";

let db: Db;
let alex: string, sam: string, coupleId: string;
let casey: string, otherCoupleId: string;

beforeAll(async () => {
  db = await createDb();
  ({ alex, sam, coupleId } = await makePairedCouple(db, "a", "b"));
  ({ alex: casey, coupleId: otherCoupleId } = await makePairedCouple(db, "c", "d"));
});

afterAll(async () => {
  await db.close();
});

const addRule = (userId: string, cid: string, weekday = 3, start = "18:00", end = "21:00", createdBy = userId) =>
  asUser(db, userId, (tx) =>
    rows<{ id: string }>(
      tx,
      `insert into public.date_rules (couple_id, created_by, title, weekday, start_time, end_time, note)
       values ($1, $2, 'Date night', $3, $4, $5, 'Then we each go home.') returning id`,
      [cid, createdBy, weekday, start, end],
    ),
  );

describe("date_rules (standing date nights)", () => {
  it("are shared by the couple and invisible to everyone else", async () => {
    const [rule] = await addRule(alex, coupleId);
    expect(await asUser(db, sam, (tx) => rows(tx, "select title, weekday from public.date_rules"))).toEqual([{ title: "Date night", weekday: 3 }]);
    expect(await asUser(db, casey, (tx) => rows(tx, "select 1 from public.date_rules where id = $1", [rule!.id]))).toEqual([]);
    expect(await asAnon(db, (tx) => rows(tx, "select 1 from public.date_rules").catch(() => "denied"))).toBe("denied");
  });

  it("only the person who set one can pause, change or remove it", async () => {
    const [rule] = await addRule(alex, coupleId, 5);
    expect(await asUser(db, sam, (tx) => rows(tx, "update public.date_rules set active = false where id = $1 returning 1", [rule!.id]))).toEqual([]);
    expect(await asUser(db, sam, (tx) => rows(tx, "delete from public.date_rules where id = $1 returning 1", [rule!.id]))).toEqual([]);
    expect(await asUser(db, casey, (tx) => rows(tx, "update public.date_rules set title = 'Mine now' where id = $1 returning 1", [rule!.id]))).toEqual([]);
    expect(await asUser(db, alex, (tx) => rows(tx, "update public.date_rules set active = false where id = $1 returning active", [rule!.id]))).toEqual([{ active: false }]);
    expect(await asUser(db, alex, (tx) => rows(tx, "delete from public.date_rules where id = $1 returning 1", [rule!.id]))).toHaveLength(1);
  });

  it("can't be set for another couple or in the partner's name, and the setter can't be swapped later", async () => {
    await expect(addRule(alex, otherCoupleId)).rejects.toThrow();
    await expect(addRule(sam, coupleId, 3, "18:00", "21:00", alex)).rejects.toThrow();
    const [rule] = await addRule(alex, coupleId, 0);
    await expect(asUser(db, alex, (tx) => tx.query("update public.date_rules set created_by = $2 where id = $1", [rule!.id, sam]))).rejects.toThrow();
    await asUser(db, alex, (tx) => tx.query("delete from public.date_rules where id = $1", [rule!.id]));
  });

  it("refuse a night that ends before it starts, an unknown weekday, and a sixth standing date", async () => {
    await expect(addRule(alex, coupleId, 3, "21:00", "18:00")).rejects.toThrow();
    await expect(addRule(alex, coupleId, 7)).rejects.toThrow();
    const existing = await asUser(db, alex, (tx) => rows<{ n: number }>(tx, "select count(*)::int as n from public.date_rules"));
    for (let i = existing[0]!.n; i < 5; i++) await addRule(i % 2 ? sam : alex, coupleId, i % 7);
    await expect(addRule(sam, coupleId, 6)).rejects.toThrow(/5 standing dates/);
  });
});

const logChange = (userId: string, cid: string, createdBy = userId) =>
  asUser(db, userId, (tx) =>
    rows<{ id: string }>(tx, `insert into public.life_changes (couple_id, created_by, kind, happened_on, note) values ($1, $2, 'new_job', '2026-10-01', 'New shifts') returning id`, [cid, createdBy]),
  );

describe("life_changes", () => {
  it("are shared by the couple and invisible to everyone else", async () => {
    const [change] = await logChange(sam, coupleId);
    expect(await asUser(db, alex, (tx) => rows(tx, "select kind, note from public.life_changes"))).toEqual([{ kind: "new_job", note: "New shifts" }]);
    expect(await asUser(db, casey, (tx) => rows(tx, "select 1 from public.life_changes where id = $1", [change!.id]))).toEqual([]);
  });

  it("only the person who logged one can remove it; nobody can rewrite it", async () => {
    const [change] = await logChange(sam, coupleId);
    expect(await asUser(db, alex, (tx) => rows(tx, "delete from public.life_changes where id = $1 returning 1", [change!.id]))).toEqual([]);
    await expect(asUser(db, sam, (tx) => tx.query("update public.life_changes set note = 'edited' where id = $1", [change!.id]))).rejects.toThrow(); // no update grant
    expect(await asUser(db, sam, (tx) => rows(tx, "delete from public.life_changes where id = $1 returning 1", [change!.id]))).toHaveLength(1);
  });

  it("can't be logged for another couple, in the partner's name, or with an unknown kind", async () => {
    await expect(logChange(alex, otherCoupleId)).rejects.toThrow();
    await expect(logChange(alex, coupleId, sam)).rejects.toThrow();
    await expect(asUser(db, alex, (tx) => tx.query(`insert into public.life_changes (couple_id, created_by, kind, happened_on) values ($1, $2, 'lottery', '2026-10-01')`, [coupleId, alex]))).rejects.toThrow();
  });
});
