/**
 * The studio-voice meter at the database layer: only buddy_voice_charge() can
 * touch it, it only ever adds to the caller's own count, and nobody can read
 * or reset the table directly (which would dodge the daily cost limit).
 */
import { asAnon, asUser, createDb, makePairedCouple, rows, type Db } from "./harness";

let db: Db;
let alex: string, sam: string;

beforeAll(async () => {
  db = await createDb();
  ({ alex, sam } = await makePairedCouple(db, "a", "b"));
});
afterAll(async () => {
  await db.close();
});

it("adds to the caller's own count for today and returns the total", async () => {
  const charge = (user: string, n: number) => asUser(db, user, (tx) => rows<{ total: number }>(tx, "select public.buddy_voice_charge($1) as total", [n]));
  expect((await charge(alex, 120))[0]!.total).toBe(120);
  expect((await charge(alex, 80))[0]!.total).toBe(200);
  expect((await charge(sam, 10))[0]!.total).toBe(10);
});

it("refuses silly amounts and signed-out callers", async () => {
  await expect(asUser(db, alex, (tx) => tx.query("select public.buddy_voice_charge(0)"))).rejects.toThrow();
  await expect(asUser(db, alex, (tx) => tx.query("select public.buddy_voice_charge(-50)"))).rejects.toThrow();
  await expect(asUser(db, alex, (tx) => tx.query("select public.buddy_voice_charge(999999)"))).rejects.toThrow();
  await expect(asAnon(db, (tx) => tx.query("select public.buddy_voice_charge(5)"))).rejects.toThrow();
});

it("can't be read, reset or deleted directly", async () => {
  await expect(asUser(db, alex, (tx) => tx.query("select * from public.buddy_voice_usage"))).rejects.toThrow();
  await expect(asUser(db, alex, (tx) => tx.query("update public.buddy_voice_usage set chars = 0"))).rejects.toThrow();
  await expect(asUser(db, alex, (tx) => tx.query("delete from public.buddy_voice_usage"))).rejects.toThrow();
});
