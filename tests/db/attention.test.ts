import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync, readdirSync } from "node:fs";
import { asAnon, asUser, createDb, createUser, makePairedCouple, makeProfile, rows, type Db } from "./harness";

interface Signal {
  id: string;
  couple_id: string;
  author_id: string;
  subject: "self" | "partner";
  created_at: Date;
  acknowledged_at: Date | null;
  resolved_at: Date | null;
}

const UNAVAILABLE = { message: "That attention request is not available.", code: "P0002" };
let db: Db;
let outsider: string;

beforeAll(async () => {
  db = await createDb();
  outsider = (await makePairedCouple(db, "outsider", "other")).alex;
});
afterAll(async () => db?.close());

const raise = async (user: string, subject: Signal["subject"] = "self") =>
  (await asUser(db, user, (tx) => rows<Signal>(tx, "select * from public.raise_attention($1)", [subject])))[0]!;
const acknowledge = async (user: string, id: string | null) =>
  (await asUser(db, user, (tx) => rows<Signal>(tx, "select * from public.acknowledge_attention($1)", [id])))[0]!;
const resolve = async (user: string, id: string | null) =>
  (await asUser(db, user, (tx) => rows<Signal>(tx, "select * from public.resolve_attention($1)", [id])))[0]!;
const read = (user: string, id: string) =>
  asUser(db, user, (tx) => rows<Signal>(tx, "select * from public.attention_signals where id = $1", [id]));

describe("attention signal privacy and lifecycle", () => {
  let alex: string, sam: string, coupleId: string;
  beforeEach(async () => {
    ({ alex, sam, coupleId } = await makePairedCouple(db));
  });

  it("stores only metadata, visible to both members and never to another couple", async () => {
    const signal = await raise(alex, "partner");
    expect(Object.keys(signal).sort()).toEqual([
      "acknowledged_at", "author_id", "couple_id", "created_at", "id", "resolved_at", "subject",
    ]);
    expect(signal).toMatchObject({ couple_id: coupleId, author_id: alex, subject: "partner", acknowledged_at: null, resolved_at: null });
    expect(await read(alex, signal.id)).toEqual([signal]);
    expect(await read(sam, signal.id)).toEqual([signal]);
    expect(await read(outsider, signal.id)).toEqual([]);

    const closed = await resolve(alex, signal.id);
    expect(closed.resolved_at).not.toBeNull();
    expect(await read(alex, signal.id)).toEqual([closed]);
    expect(await read(sam, signal.id)).toEqual([closed]);
    expect(await read(outsider, signal.id)).toEqual([]);
  });

  it("denies anonymous reads and every mutation RPC", async () => {
    const signal = await raise(alex);
    await expect(asAnon(db, (tx) => tx.query("select * from public.attention_signals"))).rejects.toThrow(/permission denied/);
    for (const [sql, value] of [
      ["select public.raise_attention($1)", "self"],
      ["select public.acknowledge_attention($1)", signal.id],
      ["select public.resolve_attention($1)", signal.id],
    ]) {
      await expect(asAnon(db, (tx) => tx.query(sql!, [value]))).rejects.toThrow(/permission denied/);
    }
  });

  it("checks authentication inside each RPC even when the database role is authenticated", async () => {
    const signal = await raise(alex);
    for (const [sql, value] of [
      ["select public.raise_attention($1)", "self"],
      ["select public.acknowledge_attention($1)", signal.id],
      ["select public.resolve_attention($1)", signal.id],
    ]) {
      await expect(db.transaction(async (tx) => {
        await tx.exec("set local role authenticated");
        await tx.query("select set_config('request.jwt.claims', '{}', true)");
        return tx.query(sql!, [value]);
      })).rejects.toMatchObject({ message: "Please sign in first.", code: "28000" });
    }
  });

  it("denies direct insert, update and delete even to either couple member", async () => {
    const signal = await raise(alex);
    for (const user of [alex, sam, outsider]) {
      await expect(asUser(db, user, (tx) => tx.query(
        "insert into public.attention_signals(couple_id, author_id, subject) values ($1, $2, 'partner')", [coupleId, user],
      ))).rejects.toThrow(/permission denied/);
      await expect(asUser(db, user, (tx) => tx.query(
        "update public.attention_signals set resolved_at = now() where id = $1", [signal.id],
      ))).rejects.toThrow(/permission denied/);
      await expect(asUser(db, user, (tx) => tx.query(
        "delete from public.attention_signals where id = $1", [signal.id],
      ))).rejects.toThrow(/permission denied/);
    }
    expect(await read(alex, signal.id)).toEqual([signal]);
  });

  it.each([null, "", "both", "Self"])("rejects an invalid subject: %s", async (subject) => {
    await expect(asUser(db, alex, (tx) => tx.query("select public.raise_attention($1)", [subject])))
      .rejects.toMatchObject({ message: "Choose self or partner.", code: "22023" });
  });

  it("requires two members, not just a user or a pending invitation", async () => {
    const waiting = await createUser(db, `waiting-${crypto.randomUUID()}@spark.test`);
    await makeProfile(db, waiting, "Waiting");
    await expect(raise(waiting)).rejects.toThrow(/Pair with your partner/);
    await asUser(db, waiting, (tx) => tx.query("select public.create_couple()"));
    await expect(raise(waiting)).rejects.toThrow(/Pair with your partner/);

    const signal = await raise(alex);
    await db.query("delete from public.couple_members where user_id = $1", [sam]);
    await expect(raise(alex)).rejects.toThrow(/Pair with your partner/);
    await expect(resolve(alex, signal.id)).rejects.toMatchObject(UNAVAILABLE);
    await expect(acknowledge(sam, signal.id)).rejects.toMatchObject(UNAVAILABLE);
  });

  it("keeps one open signal per author and subject, and raises a fresh signal after resolution", async () => {
    const first = await raise(alex, "self");
    expect(await raise(alex, "self")).toEqual(first);
    const partner = await raise(alex, "partner");
    const otherAuthor = await raise(sam, "self");
    expect(new Set([first.id, partner.id, otherAuthor.id]).size).toBe(3);

    const ack = await acknowledge(sam, first.id);
    expect(await raise(alex, "self")).toEqual(ack);
    await expect(db.query(
      "insert into public.attention_signals(couple_id, author_id, subject) values ($1, $2, 'self')", [coupleId, alex],
    )).rejects.toMatchObject({ code: "23505" });

    const closed = await resolve(alex, first.id);
    const fresh = await raise(alex, "self");
    expect(fresh.id).not.toBe(first.id);
    expect(fresh).toMatchObject({ acknowledged_at: null, resolved_at: null });
    expect(await read(alex, first.id)).toEqual([closed]);
    expect(await read(alex, partner.id)).toEqual([partner]);
    expect(await read(sam, otherAuthor.id)).toEqual([otherAuthor]);
  });

  it("lets only the partner acknowledge an open signal and only its author resolve it", async () => {
    const signal = await raise(alex);
    await expect(acknowledge(alex, signal.id)).rejects.toMatchObject(UNAVAILABLE);
    await expect(resolve(sam, signal.id)).rejects.toMatchObject(UNAVAILABLE);
    const ack = await acknowledge(sam, signal.id);
    expect(ack.acknowledged_at).not.toBeNull();
    expect(ack.resolved_at).toBeNull();
    expect(await acknowledge(sam, signal.id)).toEqual(ack);

    const closed = await resolve(alex, signal.id);
    expect(closed.acknowledged_at).toEqual(ack.acknowledged_at);
    expect(closed.resolved_at).not.toBeNull();
    expect(await resolve(alex, signal.id)).toEqual(closed);
    await expect(acknowledge(sam, signal.id)).rejects.toMatchObject(UNAVAILABLE);
  });

  it("allows the author to resolve without waiting for an acknowledgement", async () => {
    const signal = await raise(alex);
    const closed = await resolve(alex, signal.id);
    expect(closed.acknowledged_at).toBeNull();
    expect(closed.resolved_at).not.toBeNull();
    await expect(acknowledge(sam, signal.id)).rejects.toMatchObject(UNAVAILABLE);
  });

  it("uses mutation time when the transaction started before the preceding lifecycle change", async () => {
    // PGlite serializes transactions, so reproduce the stale transaction clock
    // with successive mutations in one transaction. now() stays at its start,
    // while the creation and acknowledgement have already happened afterward.
    await db.transaction(async (tx) => {
      await tx.exec("set local role authenticated");
      const signIn = (userId: string) => tx.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: userId, role: "authenticated" }),
      ]);
      await signIn(alex);
      const signal = (await rows<Signal>(tx, "select * from public.raise_attention('self')"))[0]!;
      expect((await rows<{ after_start: boolean }>(tx,
        "select created_at > current_timestamp as after_start from public.attention_signals where id = $1", [signal.id],
      ))[0]!.after_start).toBe(true);

      await signIn(sam);
      await tx.query("select public.acknowledge_attention($1)", [signal.id]);
      await signIn(alex);
      await tx.query("select public.resolve_attention($1)", [signal.id]);
      const fresh = (await rows<Signal>(tx, "select * from public.raise_attention('self')"))[0]!;
      expect(fresh.id).not.toBe(signal.id);
      expect((await rows<{ ordered: boolean }>(tx,
        `select old.created_at <= old.acknowledged_at
          and old.acknowledged_at <= old.resolved_at
          and old.resolved_at <= fresh.created_at as ordered
         from public.attention_signals old join public.attention_signals fresh on fresh.id = $2 where old.id = $1`,
        [signal.id, fresh.id],
      ))[0]!.ordered).toBe(true);
    });
  });

  it("uses the same safe error for unknown, null and another couple's signal IDs", async () => {
    const signal = await raise(alex);
    for (const mutate of [acknowledge, resolve]) {
      await expect(mutate(outsider, signal.id)).rejects.toMatchObject(UNAVAILABLE);
      await expect(mutate(outsider, crypto.randomUUID())).rejects.toMatchObject(UNAVAILABLE);
      await expect(mutate(outsider, null)).rejects.toMatchObject(UNAVAILABLE);
      await expect(mutate(alex, crypto.randomUUID())).rejects.toMatchObject(UNAVAILABLE);
    }
  });

  it("freezes identity columns even for writes that bypass RLS", async () => {
    const signal = await raise(alex);
    const otherCouple = await makePairedCouple(db);
    const changes = [
      ["id", crypto.randomUUID()],
      ["couple_id", otherCouple.coupleId],
      ["author_id", sam],
      ["subject", "partner"],
      ["created_at", "2000-01-01T00:00:00Z"],
    ] as const;
    for (const [column, value] of changes) {
      await expect(db.query(`update public.attention_signals set ${column} = $1 where id = $2`, [value, signal.id]))
        .rejects.toThrow("An attention signal cannot change its identity.");
    }
    expect(await read(alex, signal.id)).toEqual([signal]);
  });

  it("preserves the first lifecycle timestamps and forbids late acknowledgement or backdating", async () => {
    const signal = await raise(alex);
    for (const column of ["acknowledged_at", "resolved_at"]) {
      await expect(db.query(`update public.attention_signals set ${column} = created_at - interval '1 second' where id = $1`, [signal.id]))
        .rejects.toMatchObject({ code: "23514" });
    }
    await acknowledge(sam, signal.id);
    const closed = await resolve(alex, signal.id);
    for (const column of ["acknowledged_at", "resolved_at"]) {
      await expect(db.query(`update public.attention_signals set ${column} = null where id = $1`, [signal.id])).rejects.toThrow();
      await expect(db.query(`update public.attention_signals set ${column} = ${column} + interval '1 second' where id = $1`, [signal.id])).rejects.toThrow();
    }
    expect(await read(alex, signal.id)).toEqual([closed]);
    const unacknowledged = await raise(alex);
    await resolve(alex, unacknowledged.id);
    await expect(db.query("update public.attention_signals set acknowledged_at = now() where id = $1", [unacknowledged.id]))
      .rejects.toThrow("A resolved attention signal cannot be changed.");
  });
});

describe("attention signal database configuration", () => {
  it("grants authenticated clients only SELECT and the three narrow RPCs", async () => {
    for (const role of ["anon", "authenticated", "service_role"]) {
      for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"]) {
        const result = await db.query<{ allowed: boolean }>(
          "select has_table_privilege($1, 'public.attention_signals', $2) as allowed", [role, privilege],
        );
        expect(result.rows[0]!.allowed, `${role}: ${privilege}`).toBe(role === "authenticated" && privilege === "SELECT");
      }
      for (const rpc of ["raise_attention(text)", "acknowledge_attention(uuid)", "resolve_attention(uuid)", "guard_attention_signal()"]) {
        const result = await db.query<{ allowed: boolean }>(
          "select has_function_privilege($1, $2, 'EXECUTE') as allowed", [role, `public.${rpc}`],
        );
        expect(result.rows[0]!.allowed, `${role}: ${rpc}`).toBe(role === "authenticated" && rpc !== "guard_attention_signal()");
      }
    }
    const functions = await db.query<{ proname: string; prosecdef: boolean; proconfig: string[] }>(
      `select proname, prosecdef, proconfig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and proname in ('raise_attention', 'acknowledge_attention', 'resolve_attention')`,
    );
    expect(functions.rows).toHaveLength(3);
    for (const fn of functions.rows) {
      expect(fn.prosecdef).toBe(true);
      expect(fn.proconfig).toContain('search_path=""');
    }
  });

  it("applies without a publication and registers the table when Supabase Realtime exists", async () => {
    expect((await db.query("select 1 from pg_publication where pubname = 'supabase_realtime'")).rows).toEqual([]);
    const publishingDb = await PGlite.create({ extensions: { pgcrypto } });
    try {
      await publishingDb.exec(readFileSync(new URL("./supabase-stub.sql", import.meta.url), "utf8"));
      await publishingDb.exec("create publication supabase_realtime");
      const migrations = new URL("../../supabase/migrations/", import.meta.url);
      for (const file of readdirSync(migrations).filter((name) => name.endsWith(".sql")).sort()) {
        await publishingDb.exec(readFileSync(new URL(file, migrations), "utf8"));
      }
      expect((await publishingDb.query(
        "select schemaname, tablename from pg_publication_tables where pubname = 'supabase_realtime'",
      )).rows).toEqual([{ schemaname: "public", tablename: "attention_signals" }]);
    } finally {
      await publishingDb.close();
    }
  });
});
