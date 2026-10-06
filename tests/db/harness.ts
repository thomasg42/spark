import { PGlite, type Transaction } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, "../../supabase/migrations");

export type Db = PGlite;
export type Tx = Transaction;

/** Boots an in-process Postgres with the Supabase stub plus every real migration. */
export async function createDb(): Promise<Db> {
  const db = await PGlite.create({ extensions: { pgcrypto } });
  await db.exec(readFileSync(path.join(here, "supabase-stub.sql"), "utf8"));
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    await db.exec(readFileSync(path.join(migrationsDir, file), "utf8"));
  }
  return db;
}

export async function createUser(db: Db, email: string): Promise<string> {
  const res = await db.query<{ id: string }>("insert into auth.users (email) values ($1) returning id", [email]);
  const id = res.rows[0]?.id;
  if (!id) throw new Error("user insert failed");
  return id;
}

/** Runs fn exactly as Supabase would for a signed-in user: role authenticated + JWT sub. */
export async function asUser<T>(db: Db, userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: userId, role: "authenticated" }),
    ]);
    return fn(tx);
  });
}

/** Runs fn as a signed-out visitor using the public anon key. */
export async function asAnon<T>(db: Db, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec("set local role anon");
    await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "anon" })]);
    return fn(tx);
  });
}

export async function rows<T>(tx: Tx, sql: string, params: unknown[] = []): Promise<T[]> {
  const res = await tx.query<T>(sql, params);
  return res.rows;
}

/** Creates a profile for a user (adult birthday) via their own session. */
export async function makeProfile(db: Db, userId: string, name: string, extra: Record<string, unknown> = {}) {
  await asUser(db, userId, (tx) =>
    tx.query(
      `insert into public.profiles (user_id, display_name, birthday, adult_confirmed_at, preferred_cadence, social_sharing)
       values ($1, $2, $3, now(), $4, $5)`,
      [userId, name, extra.birthday ?? "1994-05-17", extra.preferred_cadence ?? "weekly", extra.social_sharing ?? null],
    ),
  );
}

/** Creates two adults, pairs them with an invite code, and returns their ids + couple id. */
export async function makePairedCouple(db: Db, a = "a", b = "b") {
  const alex = await createUser(db, `${a}-${crypto.randomUUID()}@spark.test`);
  const sam = await createUser(db, `${b}-${crypto.randomUUID()}@spark.test`);
  await makeProfile(db, alex, `Alex ${a}`);
  await makeProfile(db, sam, `Sam ${b}`);
  const couple = await asUser(db, alex, (tx) =>
    rows<{ id: string; invite_code: string }>(tx, "select id, invite_code from public.create_couple()"),
  );
  const code = couple[0]!.invite_code;
  await asUser(db, sam, (tx) => tx.query("select public.join_couple($1)", [code]));
  return { alex, sam, coupleId: couple[0]!.id };
}
