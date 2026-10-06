/**
 * Our Story at the database layer (real migrations + RLS): both partners can
 * add, edit and remove any entry; outsiders can do none of it; the CHECK
 * constraints match the limits the app enforces; and the guarded photo swap
 * the live backend uses matches nothing once the photo has changed.
 */
import { asUser, createDb, makePairedCouple, rows, type Db } from "./harness";

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

async function addEntry(userId: string, title: string, extra: { happened_on?: string | null; photo_path?: string | null } = {}) {
  const res = await asUser(db, userId, (tx) =>
    rows<{ id: string; author_id: string }>(
      tx,
      `insert into public.story_entries (couple_id, author_id, kind, title, happened_on, photo_path)
       values ($1, $2, 'trip', $3, $4, $5) returning id, author_id`,
      [coupleId, userId, title, extra.happened_on ?? null, extra.photo_path ?? null],
    ),
  );
  return res[0]!;
}

describe("story entries are shared and editable by both partners", () => {
  it("the partner can edit an entry the other added, and the author is kept", async () => {
    const entry = await addEntry(alex, "Glacier");
    const updated = await asUser(db, sam, (tx) =>
      rows<{ title: string; author_id: string }>(tx, "update public.story_entries set title = 'Glacier NP' where id = $1 returning title, author_id", [entry.id]),
    );
    expect(updated).toEqual([{ title: "Glacier NP", author_id: alex }]);
  });

  it("the partner can remove an entry the other added", async () => {
    const entry = await addEntry(alex, "To remove");
    const deleted = await asUser(db, sam, (tx) => rows<{ id: string }>(tx, "delete from public.story_entries where id = $1 returning id", [entry.id]));
    expect(deleted).toHaveLength(1);
  });

  it("nobody can add an entry in the partner's name", async () => {
    await expect(
      asUser(db, alex, (tx) =>
        tx.query("insert into public.story_entries (couple_id, author_id, kind, title) values ($1, $2, 'other', 'spoof')", [coupleId, sam]),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("an outsider cannot edit or remove the couple's entries", async () => {
    const entry = await addEntry(alex, "Ours");
    const touched = await asUser(db, casey, async (tx) => {
      const u = await tx.query("update public.story_entries set title = 'Hacked' where id = $1", [entry.id]);
      const d = await tx.query("delete from public.story_entries where id = $1", [entry.id]);
      return (u.affectedRows ?? 0) + (d.affectedRows ?? 0);
    });
    expect(touched).toBe(0);
    const still = await asUser(db, alex, (tx) => rows<{ title: string }>(tx, "select title from public.story_entries where id = $1", [entry.id]));
    expect(still).toEqual([{ title: "Ours" }]);
  });

  it("a partner cannot move an entry into another couple", async () => {
    const entry = await addEntry(alex, "Stay put");
    await expect(
      asUser(db, alex, (tx) => tx.query("update public.story_entries set couple_id = $1 where id = $2", [otherCoupleId, entry.id])),
    ).rejects.toThrow(/row-level security/i);
  });
});

describe("story constraints match the app's limits", () => {
  it("rejects blank or over-long titles and over-long notes", async () => {
    for (const [title, body] of [["   ", null], ["x".repeat(121), null], ["ok", "x".repeat(4001)]] as const) {
      await expect(
        asUser(db, alex, (tx) =>
          tx.query("insert into public.story_entries (couple_id, kind, title, body) values ($1, 'other', $2, $3)", [coupleId, title, body]),
        ),
      ).rejects.toThrow(/check constraint/i);
    }
  });

  it("accepts the maximum lengths", async () => {
    await asUser(db, alex, (tx) =>
      tx.query("insert into public.story_entries (couple_id, kind, title, body) values ($1, 'other', $2, $3)", [coupleId, "x".repeat(120), "y".repeat(4000)]),
    );
  });

  it("only stores photo paths inside the couple's own folder", async () => {
    await expect(addEntry(alex, "Bad photo", { photo_path: `${otherCoupleId}/story/x.jpg` })).rejects.toThrow(/check constraint/i);
    const ok = await addEntry(alex, "Good photo", { photo_path: `${coupleId}/story/x.jpg` });
    expect(ok.id).toBeTruthy();
  });
});

describe("live backend queries", () => {
  it("the guarded photo swap matches nothing after the photo changed", async () => {
    const entry = await addEntry(alex, "Photo race", { photo_path: `${coupleId}/story/old.jpg` });
    await asUser(db, sam, (tx) => tx.query("update public.story_entries set photo_path = $1 where id = $2", [`${coupleId}/story/partner.jpg`, entry.id]));
    const swapped = await asUser(db, alex, (tx) =>
      rows(tx, "update public.story_entries set photo_path = $1 where id = $2 and couple_id = $3 and photo_path = $4 returning id", [
        `${coupleId}/story/mine.jpg`,
        entry.id,
        coupleId,
        `${coupleId}/story/old.jpg`,
      ]),
    );
    expect(swapped).toHaveLength(0);
  });

  it("orders by date with undated entries last, then by creation", async () => {
    const fresh = await makePairedCouple(db, "e", "f");
    const insert = (title: string, date: string | null) =>
      asUser(db, fresh.alex, (tx) =>
        tx.query("insert into public.story_entries (couple_id, kind, title, happened_on) values ($1, 'other', $2, $3)", [fresh.coupleId, title, date]),
      );
    await insert("undated", null);
    await insert("2025", "2025-01-01");
    await insert("2023", "2023-01-01");
    const ordered = await asUser(db, fresh.sam, (tx) =>
      rows<{ title: string }>(tx, "select title from public.story_entries where couple_id = $1 order by happened_on asc nulls last, created_at asc", [fresh.coupleId]),
    );
    expect(ordered.map((r) => r.title)).toEqual(["2023", "2025", "undated"]);
  });
});
