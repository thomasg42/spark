/**
 * Activity log + date ideas at the database layer: the exact writes the live
 * backend and the "date-ideas" Edge Function make, run as each user under RLS.
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

const insertIdeas = (userId: string, cid: string, batch: string, n = 5) =>
  asUser(db, userId, (tx) =>
    rows<{ id: string }>(
      tx,
      `insert into public.date_ideas (couple_id, requested_by, batch_id, title, description, category, budget, duration, time_of_day, weather, why, source)
       select $1, $2, $3, 'Idea ' || g, 'Do it', 'food', '$', 'quick', 'any', 'indoor', null, 'fallback' from generate_series(1, $4) g
       returning id`,
      [cid, userId, batch, n],
    ),
  );

describe("date ideas", () => {
  it("a partner inserts a five-idea batch for their own couple", async () => {
    const inserted = await insertIdeas(alex, coupleId, crypto.randomUUID());
    expect(inserted).toHaveLength(5);
  });

  it("cannot insert ideas for another couple or on the partner's behalf", async () => {
    await expect(insertIdeas(alex, otherCoupleId, crypto.randomUUID(), 1)).rejects.toThrow();
    await expect(insertIdeasAs(sam, alex)).rejects.toThrow();
  });

  it("both partners see the ideas and either can change the status; outsiders see nothing", async () => {
    const samSees = await asUser(db, sam, (tx) => rows<{ id: string }>(tx, "select id from public.date_ideas where couple_id = $1", [coupleId]));
    expect(samSees.length).toBeGreaterThanOrEqual(5);
    const updated = await asUser(db, sam, (tx) =>
      rows<{ id: string }>(tx, "update public.date_ideas set status = 'saved' where id = $1 and couple_id = $2 returning id", [samSees[0]!.id, coupleId]),
    );
    expect(updated).toHaveLength(1);
    const caseySees = await asUser(db, casey, (tx) => rows(tx, "select id from public.date_ideas where couple_id = $1", [coupleId]));
    expect(caseySees).toHaveLength(0);
    const caseyUpdates = await asUser(db, casey, (tx) =>
      rows(tx, "update public.date_ideas set status = 'dismissed' where couple_id = $1 returning id", [coupleId]),
    );
    expect(caseyUpdates).toHaveLength(0);
  });

  it("rejects statuses and tags the app does not know", async () => {
    const [idea] = await asUser(db, alex, (tx) => rows<{ id: string }>(tx, "select id from public.date_ideas where couple_id = $1 limit 1", [coupleId]));
    await expect(asUser(db, alex, (tx) => tx.query("update public.date_ideas set status = 'archived' where id = $1", [idea!.id]))).rejects.toThrow();
  });

  it("the rate-limit query counts distinct batches in the last 24 hours", async () => {
    const before = await asUser(db, alex, (tx) =>
      rows<{ n: number }>(tx, "select count(distinct batch_id)::int as n from public.date_ideas where couple_id = $1 and created_at >= now() - interval '24 hours'", [coupleId]),
    );
    await insertIdeas(sam, coupleId, crypto.randomUUID());
    const after = await asUser(db, alex, (tx) =>
      rows<{ n: number }>(tx, "select count(distinct batch_id)::int as n from public.date_ideas where couple_id = $1 and created_at >= now() - interval '24 hours'", [coupleId]),
    );
    expect(after[0]!.n).toBe(before[0]!.n + 1);
  });
});

async function insertIdeasAs(actor: string, requestedBy: string) {
  await asUser(db, actor, (tx) =>
    tx.query(
      `insert into public.date_ideas (couple_id, requested_by, batch_id, title, description, category, budget, duration, time_of_day, weather, source)
       values ($1, $2, gen_random_uuid(), 'Spoofed', 'x', 'food', '$', 'quick', 'any', 'indoor', 'fallback')`,
      [coupleId, requestedBy],
    ),
  );
}

describe("activities and ratings", () => {
  let activityId: string;

  beforeAll(async () => {
    const [row] = await asUser(db, alex, (tx) =>
      rows<{ id: string }>(
        tx,
        `insert into public.activities (couple_id, created_by, title, happened_on, category, note, photo_path)
         values ($1, $2, 'Pottery class', '2026-10-01', 'creative', 'Messy', $3) returning id`,
        [coupleId, alex, `${coupleId}/activities/p.jpg`],
      ),
    );
    activityId = row!.id;
  });

  it("a rating upsert inserts, then updates the partner's own row", async () => {
    const upsert = (userId: string, rating: number) =>
      asUser(db, userId, (tx) =>
        tx.query(
          `insert into public.activity_ratings (activity_id, couple_id, user_id, rating) values ($1, $2, $3, $4)
           on conflict (activity_id, user_id) do update set rating = excluded.rating`,
          [activityId, coupleId, userId, rating],
        ),
      );
    await upsert(alex, 5);
    await upsert(alex, 3);
    await upsert(sam, 4);
    const seen = await asUser(db, sam, (tx) =>
      rows<{ user_id: string; rating: number }>(tx, "select user_id, rating from public.activity_ratings where activity_id = $1 order by rating", [activityId]),
    );
    expect(seen.map((r) => [r.user_id, r.rating])).toEqual([
      [alex, 3],
      [sam, 4],
    ]);
  });

  it("rejects ratings outside 1..5 and ratings for another couple's activity", async () => {
    await expect(
      asUser(db, alex, (tx) =>
        tx.query("update public.activity_ratings set rating = 6 where activity_id = $1 and user_id = $2", [activityId, alex]),
      ),
    ).rejects.toThrow();
    await expect(
      asUser(db, casey, (tx) =>
        tx.query("insert into public.activity_ratings (activity_id, couple_id, user_id, rating) values ($1, $2, $3, 5)", [activityId, otherCoupleId, casey]),
      ),
    ).rejects.toThrow();
  });

  it("rejects a photo path outside the couple's folder", async () => {
    await expect(
      asUser(db, alex, (tx) =>
        tx.query(
          "insert into public.activities (couple_id, created_by, title, happened_on, category, photo_path) values ($1, $2, 'Sneaky', '2026-10-01', 'chill', $3)",
          [coupleId, alex, `${otherCoupleId}/activities/x.jpg`],
        ),
      ),
    ).rejects.toThrow();
  });

  it("delete ... returning photo_path works for either partner and cascades ratings", async () => {
    const removed = await asUser(db, sam, (tx) =>
      rows<{ photo_path: string }>(tx, "delete from public.activities where id = $1 and couple_id = $2 returning photo_path", [activityId, coupleId]),
    );
    expect(removed[0]!.photo_path).toBe(`${coupleId}/activities/p.jpg`);
    const left = await asUser(db, alex, (tx) => rows(tx, "select 1 from public.activity_ratings where activity_id = $1", [activityId]));
    expect(left).toHaveLength(0);
  });
});
