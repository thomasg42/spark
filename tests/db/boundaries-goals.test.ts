import { afterAll, beforeAll, expect, it } from "vitest";
import { asAnon, asUser, createDb, makePairedCouple, type Db } from "./harness";

let db: Db, a: string, b: string, c: string, outsider: string;
beforeAll(async () => {
  db = await createDb();
  const pair = await makePairedCouple(db);
  a = pair.alex;
  b = pair.sam;
  c = pair.coupleId;
  outsider = (await makePairedCouple(db)).alex;
});
afterAll(async () => db?.close());

it("hides a draft from the partner, then shows it once shared", async () => {
  const id = (await asUser(db, a, (tx) => tx.query<{ id: string }>("insert into boundaries(couple_id, author_id, category, text, my_action) values($1,$2,'honesty','I need honesty even when it is hard.','I will ask once and wait until we are calm.') returning id", [c, a]))).rows[0]!.id;
  expect((await asUser(db, b, (tx) => tx.query("select id from boundaries where id=$1", [id]))).rows).toHaveLength(0);
  expect((await asAnon(db, (tx) => tx.query("select id from boundaries"))).rows).toHaveLength(0);
  await asUser(db, a, (tx) => tx.query("update boundaries set status='shared' where id=$1", [id]));
  expect((await asUser(db, b, (tx) => tx.query("select id from boundaries where id=$1", [id]))).rows).toHaveLength(1);
  expect((await asUser(db, outsider, (tx) => tx.query("select id from boundaries where id=$1", [id]))).rows).toHaveLength(0);
  expect((await asUser(db, a, (tx) => tx.query("delete from boundaries where id=$1 returning id", [id]))).rows).toHaveLength(0);
});

it("lets only the other partner respond", async () => {
  const id = (await asUser(db, a, (tx) => tx.query<{ id: string }>("insert into boundaries(couple_id, author_id, category, text, my_action, status) values($1,$2,'time','I need a heads-up when plans change.','I will say what I need and we can pick a new time.','draft') returning id", [c, a]))).rows[0]!.id;
  await expect(asUser(db, b, (tx) => tx.query("insert into boundary_acks(boundary_id, user_id, response) values($1,$2,'understood')", [id, b]))).rejects.toThrow();
  await asUser(db, a, (tx) => tx.query("update boundaries set status='shared' where id=$1", [id]));
  await expect(asUser(db, a, (tx) => tx.query("insert into boundary_acks(boundary_id, user_id, response) values($1,$2,'understood')", [id, a]))).rejects.toThrow();
  await asUser(db, b, (tx) => tx.query("insert into boundary_acks(boundary_id, user_id, response) values($1,$2,'discuss')", [id, b]));
  expect((await asUser(db, a, (tx) => tx.query("select response from boundary_acks where boundary_id=$1", [id]))).rows[0]).toMatchObject({ response: "discuss" });
});

it("does not send a notification when a boundary is shared", async () => {
  const triggers = (await asUser(db, a, (tx) => tx.query<{ tgname: string }>("select t.tgname from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='boundaries' and not t.tgisinternal"))).rows.map((row) => row.tgname);
  expect(triggers.some((name) => /notif/i.test(name))).toBe(false);
  await expect(asUser(db, a, (tx) => tx.query("insert into notification_preferences(user_id, enabled) values($1, true)", [a]))).rejects.toThrow();
  await asUser(db, a, (tx) => tx.query("insert into notification_preferences(user_id, enabled) values($1, false)", [a]));
});

it("keeps agreement history and activates only after both accept", async () => {
  const id = (await asUser(db, a, (tx) => tx.query<{ id: string }>("insert into couple_agreements(couple_id, created_by) values($1,$2) returning id", [c, a]))).rows[0]!.id;
  await asUser(db, a, (tx) => tx.query("insert into agreement_versions(agreement_id, version, body, created_by) values($1,1,'We both get a heads-up when plans change.',$2)", [id, a]));
  await asUser(db, a, (tx) => tx.query("insert into agreement_acceptances(agreement_id, version, user_id) values($1,1,$2)", [id, a]));
  expect((await asUser(db, b, (tx) => tx.query<{ status: string }>("select status from couple_agreements where id=$1", [id]))).rows[0]!.status).toBe("proposed");
  await expect(asUser(db, a, (tx) => tx.query("update couple_agreements set status='active' where id=$1", [id]))).rejects.toThrow();
  await asUser(db, b, (tx) => tx.query("insert into agreement_acceptances(agreement_id, version, user_id) values($1,1,$2)", [id, b]));
  expect((await asUser(db, a, (tx) => tx.query<{ status: string }>("select status from couple_agreements where id=$1", [id]))).rows[0]!.status).toBe("active");
  await asUser(db, a, (tx) => tx.query("insert into agreement_versions(agreement_id, version, body, created_by) values($1,2,'We both get a heads-up the day before.',$2)", [id, a]));
  await asUser(db, b, (tx) => tx.query("update couple_agreements set status='left' where id=$1", [id]));
  expect((await asUser(db, a, (tx) => tx.query("select version from agreement_versions where agreement_id=$1 order by version", [id]))).rows).toHaveLength(2);
});

it("hides a private goal version until both submit, and pausing one goal leaves the other", async () => {
  const first = (await asUser(db, a, (tx) => tx.query<{ id: string }>("insert into our_goals(couple_id, created_by, goal_type) values($1,$2,'home') returning id", [c, a]))).rows[0]!.id;
  const second = (await asUser(db, a, (tx) => tx.query<{ id: string }>("insert into our_goals(couple_id, created_by, goal_type) values($1,$2,'travel') returning id", [c, a]))).rows[0]!.id;
  await asUser(db, a, (tx) => tx.query("insert into our_goal_drafts(goal_id, author_id, version_text, why, submitted_at) values($1,$2,'A house','Roots',now())", [first, a]));
  expect((await asUser(db, b, (tx) => tx.query("select goal_id from our_goal_drafts where goal_id=$1", [first]))).rows).toHaveLength(0);
  await asUser(db, b, (tx) => tx.query("insert into our_goal_drafts(goal_id, author_id, version_text, why, submitted_at) values($1,$2,'Our home','Us',now())", [first, b]));
  expect((await asUser(db, a, (tx) => tx.query("select author_id from our_goal_drafts where goal_id=$1", [first]))).rows).toHaveLength(2);
  expect((await asUser(db, b, (tx) => tx.query("select author_id from our_goal_drafts where goal_id=$1", [first]))).rows).toHaveLength(2);
  await asUser(db, a, (tx) => tx.query("update our_goals set status='active', title='A home' where id=$1", [first]));
  await asUser(db, a, (tx) => tx.query("update our_goals set status='active', title='A trip' where id=$1", [second]));
  await asUser(db, b, (tx) => tx.query("update our_goals set status='paused' where id=$1", [first]));
  const rows = (await asUser(db, a, (tx) => tx.query<{ id: string; status: string }>("select id, status from our_goals where id in ($1,$2)", [first, second]))).rows;
  expect(rows.find((row) => row.id === first)?.status).toBe("paused");
  expect(rows.find((row) => row.id === second)?.status).toBe("active");
});
