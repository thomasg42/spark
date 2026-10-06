/**
 * PRIVACY TEST (spec deliverable): proves at the database layer, with the real
 * migrations and RLS policies, that partner A cannot read partner B's private
 * rows, that hidden-until-both rows stay hidden, and that outsiders and
 * signed-out visitors see nothing.
 */
import { asAnon, asUser, createDb, createUser, makePairedCouple, makeProfile, rows, type Db } from "./harness";

const CT = (label: string) => `v1.${Buffer.from(label).toString("base64url")}.ciphertext`;

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

describe("private onboarding answers are owner-only", () => {
  beforeAll(async () => {
    await asUser(db, sam, (tx) =>
      tx.query(
        `insert into public.private_answers (section, question_id, answer_ciphertext) values
         ('beginnings', 'what_attracted_you', $1),
         ('closeness_trust', 'trust_level', $2)`,
        [CT("sam secret 1"), CT("sam secret 2")],
      ),
    );
    await asUser(db, alex, (tx) =>
      tx.query(
        `insert into public.private_answers (section, question_id, answer_ciphertext) values ('beginnings', 'what_attracted_you', $1)`,
        [CT("alex secret")],
      ),
    );
  });

  it("the owner can read their own answers", async () => {
    const mine = await asUser(db, sam, (tx) => rows(tx, "select * from public.private_answers"));
    expect(mine).toHaveLength(2);
  });

  it("partner A cannot read partner B's private answers (select returns nothing)", async () => {
    const seen = await asUser(db, alex, (tx) =>
      rows<{ user_id: string }>(tx, "select * from public.private_answers where user_id = $1", [sam]),
    );
    expect(seen).toHaveLength(0);
    const all = await asUser(db, alex, (tx) => rows<{ user_id: string }>(tx, "select user_id from public.private_answers"));
    expect(all.every((r) => r.user_id === alex)).toBe(true);
  });

  it("partner A cannot count, update, or delete partner B's private answers", async () => {
    const count = await asUser(db, alex, (tx) =>
      rows<{ n: number }>(tx, "select count(*)::int as n from public.private_answers where user_id = $1", [sam]),
    );
    expect(count[0]!.n).toBe(0);
    const updated = await asUser(db, alex, (tx) =>
      tx.query("update public.private_answers set skipped = true, answer_ciphertext = null where user_id = $1", [sam]),
    );
    expect(updated.affectedRows ?? 0).toBe(0);
    const deleted = await asUser(db, alex, (tx) => tx.query("delete from public.private_answers where user_id = $1", [sam]));
    expect(deleted.affectedRows ?? 0).toBe(0);
    const stillThere = await asUser(db, sam, (tx) => rows(tx, "select * from public.private_answers"));
    expect(stillThere).toHaveLength(2);
  });

  it("partner A cannot write an answer into partner B's account", async () => {
    await expect(
      asUser(db, alex, (tx) =>
        tx.query(
          "insert into public.private_answers (user_id, section, question_id, answer_ciphertext) values ($1, 'beginnings', 'x_forged', $2)",
          [sam, CT("forged")],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("an outsider cannot read anyone's private answers", async () => {
    const seen = await asUser(db, casey, (tx) =>
      rows(tx, "select * from public.private_answers where user_id in ($1, $2)", [alex, sam]),
    );
    expect(seen).toHaveLength(0);
  });

  it("rejects plaintext answers (only server-encrypted v1 ciphertext is stored)", async () => {
    await expect(
      asUser(db, sam, (tx) =>
        tx.query(
          "insert into public.private_answers (section, question_id, answer_ciphertext) values ('direction', 'kids', 'I want three kids')",
        ),
      ),
    ).rejects.toThrow(/check constraint/i);
  });
});

describe("monthly check-in answers stay hidden until both partners submit", () => {
  let checkinId: string;

  it("opens one shared check-in per couple per month", async () => {
    const a = await asUser(db, alex, (tx) => rows<{ id: string }>(tx, "select public.ensure_checkin('2026-10') as id"));
    const b = await asUser(db, sam, (tx) => rows<{ id: string }>(tx, "select public.ensure_checkin('2026-10') as id"));
    checkinId = a[0]!.id;
    expect(b[0]!.id).toBe(checkinId);
  });

  it("after only Alex submits, Sam cannot see Alex's answers", async () => {
    await asUser(db, alex, (tx) =>
      tx.query("insert into public.checkin_responses (checkin_id, couple_id, answers_ciphertext) values ($1, $2, $3)", [
        checkinId,
        coupleId,
        CT("alex checkin"),
      ]),
    );
    const seenBySam = await asUser(db, sam, (tx) =>
      rows(tx, "select * from public.checkin_responses where checkin_id = $1", [checkinId]),
    );
    expect(seenBySam).toHaveLength(0);
    const status = await asUser(db, sam, (tx) =>
      rows<{ i_submitted: boolean; partner_submitted: boolean; revealed: boolean }>(
        tx,
        "select * from public.checkin_status('2026-10')",
      ),
    );
    expect(status[0]).toMatchObject({ i_submitted: false, partner_submitted: true, revealed: false });
  });

  it("a summary cannot be stored before both have submitted", async () => {
    await expect(
      asUser(db, alex, (tx) => tx.query("select public.set_checkin_summary($1, $2)", [checkinId, CT("summary")])),
    ).rejects.toThrow(/Both partners must submit/);
  });

  it("once Sam submits, both answers are revealed to both partners", async () => {
    await asUser(db, sam, (tx) =>
      tx.query("insert into public.checkin_responses (checkin_id, couple_id, answers_ciphertext) values ($1, $2, $3)", [
        checkinId,
        coupleId,
        CT("sam checkin"),
      ]),
    );
    for (const viewer of [alex, sam]) {
      const seen = await asUser(db, viewer, (tx) =>
        rows<{ user_id: string }>(tx, "select user_id from public.checkin_responses where checkin_id = $1", [checkinId]),
      );
      expect(seen.map((r) => r.user_id).sort()).toEqual([alex, sam].sort());
    }
  });

  it("an outsider never sees the revealed answers or the reveal state", async () => {
    const seen = await asUser(db, casey, (tx) =>
      rows(tx, "select * from public.checkin_responses where checkin_id = $1", [checkinId]),
    );
    expect(seen).toHaveLength(0);
    const revealed = await asUser(db, casey, (tx) =>
      rows<{ r: boolean }>(tx, "select public.checkin_revealed($1) as r", [checkinId]),
    );
    expect(revealed[0]!.r).toBe(false);
  });

  it("submitted answers are final (no update or delete), even for the author", async () => {
    await expect(
      asUser(db, alex, (tx) =>
        tx.query("update public.checkin_responses set answers_ciphertext = $1 where user_id = $2", [CT("edit"), alex]),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asUser(db, alex, (tx) => tx.query("delete from public.checkin_responses where user_id = $1", [alex])),
    ).rejects.toThrow(/permission denied/i);
  });

  it("stores the summary once after reveal (first writer wins)", async () => {
    const first = await asUser(db, alex, (tx) =>
      rows<{ s: string }>(tx, "select public.set_checkin_summary($1, $2) as s", [checkinId, CT("first")]),
    );
    const second = await asUser(db, sam, (tx) =>
      rows<{ s: string }>(tx, "select public.set_checkin_summary($1, $2) as s", [checkinId, CT("second")]),
    );
    expect(first[0]!.s).toBe(CT("first"));
    expect(second[0]!.s).toBe(CT("first"));
  });

  it("an outsider cannot forge a response into another couple's check-in", async () => {
    await expect(
      asUser(db, casey, (tx) =>
        tx.query("insert into public.checkin_responses (checkin_id, couple_id, answers_ciphertext) values ($1, $2, $3)", [
          checkinId,
          coupleId,
          CT("forged"),
        ]),
      ),
    ).rejects.toThrow(/row-level security|foreign key/i);
  });
});

describe("weekly pulse scores are revealed per week only when both submitted", () => {
  const week = "2026-10-05"; // a Monday

  it("hides Alex's score from Sam until Sam submits for the same week", async () => {
    await asUser(db, alex, (tx) =>
      tx.query("insert into public.pulses (couple_id, week_start, excitement, connection) values ($1, $2, 4, 5)", [
        coupleId,
        week,
      ]),
    );
    const before = await asUser(db, sam, (tx) =>
      rows(tx, "select * from public.pulses where user_id = $1", [alex]),
    );
    expect(before).toHaveLength(0);
    const status = await asUser(db, sam, (tx) =>
      rows<{ i_submitted: boolean; partner_submitted: boolean }>(tx, "select * from public.pulse_status($1)", [week]),
    );
    expect(status[0]).toEqual({ i_submitted: false, partner_submitted: true });

    await asUser(db, sam, (tx) =>
      tx.query("insert into public.pulses (couple_id, week_start, excitement, connection) values ($1, $2, 3, 4)", [
        coupleId,
        week,
      ]),
    );
    const after = await asUser(db, sam, (tx) => rows(tx, "select * from public.pulses where week_start = $1", [week]));
    expect(after).toHaveLength(2);
  });

  it("rejects a week_start that is not a Monday and scores outside 1 to 5", async () => {
    await expect(
      asUser(db, alex, (tx) =>
        tx.query("insert into public.pulses (couple_id, week_start, excitement, connection) values ($1, '2026-10-07', 3, 3)", [
          coupleId,
        ]),
      ),
    ).rejects.toThrow(/check constraint/i);
    await expect(
      asUser(db, alex, (tx) =>
        tx.query("insert into public.pulses (couple_id, week_start, excitement, connection) values ($1, '2026-10-12', 6, 3)", [
          coupleId,
        ]),
      ),
    ).rejects.toThrow(/check constraint/i);
  });

  it("an outsider sees no pulses", async () => {
    const seen = await asUser(db, casey, (tx) => rows(tx, "select * from public.pulses where couple_id = $1", [coupleId]));
    expect(seen).toHaveLength(0);
  });
});

describe("shared couple data is visible to the two partners and nobody else", () => {
  beforeAll(async () => {
    await asUser(db, alex, async (tx) => {
      await tx.query("insert into public.story_entries (couple_id, kind, title, happened_on) values ($1, 'first_date', 'Tacos at Dave''s', '2025-03-14')", [coupleId]);
      await tx.query("insert into public.activities (couple_id, title, happened_on, category) values ($1, 'Hot springs', '2026-09-20', 'outdoors')", [coupleId]);
      await tx.query("insert into public.appreciation_notes (couple_id, body) values ($1, 'Thanks for the coffee')", [coupleId]);
      await tx.query("insert into public.moments (couple_id, kind, caption) values ($1, 'note', 'Saw this and thought of you')", [coupleId]);
    });
  });

  const sharedTables = ["story_entries", "activities", "appreciation_notes", "moments", "couple_members"];

  it.each(sharedTables)("both partners can read %s", async (table) => {
    for (const viewer of [alex, sam]) {
      const seen = await asUser(db, viewer, (tx) => rows(tx, `select * from public.${table} where couple_id = $1`, [coupleId]));
      expect(seen.length).toBeGreaterThan(0);
    }
  });

  it.each(sharedTables)("an outsider cannot read %s", async (table) => {
    const seen = await asUser(db, casey, (tx) => rows(tx, `select * from public.${table} where couple_id = $1`, [coupleId]));
    expect(seen).toHaveLength(0);
  });

  it("an outsider cannot read the couple row, its invite code, or either partner's profile", async () => {
    const couple = await asUser(db, casey, (tx) => rows(tx, "select * from public.couples where id = $1", [coupleId]));
    expect(couple).toHaveLength(0);
    const profiles = await asUser(db, casey, (tx) =>
      rows(tx, "select * from public.profiles where user_id in ($1, $2)", [alex, sam]),
    );
    expect(profiles).toHaveLength(0);
  });

  it("partners can read each other's profile but not edit it", async () => {
    const seen = await asUser(db, alex, (tx) => rows(tx, "select * from public.profiles where user_id = $1", [sam]));
    expect(seen).toHaveLength(1);
    const res = await asUser(db, alex, (tx) =>
      tx.query("update public.profiles set display_name = 'Hacked' where user_id = $1", [sam]),
    );
    expect(res.affectedRows ?? 0).toBe(0);
  });

  it("an outsider cannot insert content into another couple", async () => {
    await expect(
      asUser(db, casey, (tx) =>
        tx.query("insert into public.story_entries (couple_id, kind, title) values ($1, 'other', 'intrusion')", [coupleId]),
      ),
    ).rejects.toThrow(/row-level security/i);
    await expect(
      asUser(db, casey, (tx) =>
        tx.query("insert into public.moments (couple_id, kind, caption) values ($1, 'note', 'intrusion')", [coupleId]),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("a partner cannot delete the other partner's moment, but can react to it", async () => {
    const moment = await asUser(db, sam, (tx) => rows<{ id: string }>(tx, "select id from public.moments where couple_id = $1", [coupleId]));
    const del = await asUser(db, sam, (tx) => tx.query("delete from public.moments where id = $1", [moment[0]!.id]));
    expect(del.affectedRows ?? 0).toBe(0);
    await asUser(db, sam, (tx) =>
      tx.query("insert into public.moment_reactions (moment_id, couple_id, reaction) values ($1, $2, 'laugh')", [moment[0]!.id, coupleId]),
    );
    const reactions = await asUser(db, alex, (tx) => rows(tx, "select * from public.moment_reactions where moment_id = $1", [moment[0]!.id]));
    expect(reactions).toHaveLength(1);
  });

  it("a partner cannot rate an activity on the other partner's behalf", async () => {
    const act = await asUser(db, sam, (tx) => rows<{ id: string }>(tx, "select id from public.activities where couple_id = $1", [coupleId]));
    await expect(
      asUser(db, sam, (tx) =>
        tx.query("insert into public.activity_ratings (activity_id, couple_id, user_id, rating) values ($1, $2, $3, 5)", [act[0]!.id, coupleId, alex]),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("members can change city but never the invite code or creator", async () => {
    await asUser(db, alex, (tx) => tx.query("update public.couples set city = 'Bozeman, MT' where id = $1", [coupleId]));
    await expect(
      asUser(db, alex, (tx) => tx.query("update public.couples set invite_code = 'ABCDEFGH' where id = $1", [coupleId])),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asUser(db, alex, (tx) => tx.query("update public.couples set created_by = $2 where id = $1", [coupleId, casey])),
    ).rejects.toThrow(/permission denied/i);
  });
});

describe("signed-out visitors (anon key) get nothing", () => {
  const tables = [
    "profiles", "couples", "couple_members", "story_entries", "private_answers", "pulses", "checkins",
    "checkin_responses", "appreciation_notes", "date_ideas", "activities", "activity_ratings", "moments", "moment_reactions",
  ];

  it.each(tables)("anon cannot select from %s", async (table) => {
    await expect(asAnon(db, (tx) => rows(tx, `select * from public.${table}`))).rejects.toThrow(/permission denied/i);
  });

  it("anon cannot call the pairing functions", async () => {
    await expect(asAnon(db, (tx) => tx.query("select public.join_couple('ABCDEFGH')"))).rejects.toThrow(/permission denied/i);
    await expect(asAnon(db, (tx) => tx.query("select public.create_couple()"))).rejects.toThrow(/permission denied/i);
  });
});

describe("pairing rules", () => {
  it("rejects a wrong code, a used code, a third partner, and double pairing", async () => {
    const p1 = await createUser(db, "p1@spark.test");
    const p2 = await createUser(db, "p2@spark.test");
    const p3 = await createUser(db, "p3@spark.test");
    for (const [id, name] of [[p1, "P1"], [p2, "P2"], [p3, "P3"]] as const) await makeProfile(db, id, name);

    const created = await asUser(db, p1, (tx) => rows<{ invite_code: string }>(tx, "select invite_code from public.create_couple()"));
    const code = created[0]!.invite_code;
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);

    await expect(asUser(db, p2, (tx) => tx.query("select public.join_couple('ZZZZZZZZ')"))).rejects.toThrow(/did not match/);
    await expect(asUser(db, p1, (tx) => tx.query("select public.join_couple($1)", [code]))).rejects.toThrow(/already paired/);

    // lower-case and spaces are tolerated
    await asUser(db, p2, (tx) => tx.query("select public.join_couple($1)", [` ${code.slice(0, 4).toLowerCase()}-${code.slice(4)} `]));
    await expect(asUser(db, p3, (tx) => tx.query("select public.join_couple($1)", [code]))).rejects.toThrow(/did not match/);
    await expect(asUser(db, p2, (tx) => tx.query("select public.create_couple()"))).rejects.toThrow(/already paired/);
    await expect(asUser(db, p1, (tx) => tx.query("select public.regenerate_invite()"))).rejects.toThrow(/already paired/);
  });

  it("rejects an expired code", async () => {
    const q1 = await createUser(db, "q1@spark.test");
    const q2 = await createUser(db, "q2@spark.test");
    await makeProfile(db, q1, "Q1");
    await makeProfile(db, q2, "Q2");
    const created = await asUser(db, q1, (tx) => rows<{ id: string; invite_code: string }>(tx, "select id, invite_code from public.create_couple()"));
    await db.query("update public.couples set invite_expires_at = now() - interval '1 minute' where id = $1", [created[0]!.id]);
    await expect(
      asUser(db, q2, (tx) => tx.query("select public.join_couple($1)", [created[0]!.invite_code])),
    ).rejects.toThrow(/expired/);
  });

  it("enforces two partners at the table level too", async () => {
    const extra = await createUser(db, "extra@spark.test");
    await expect(
      db.query("insert into public.couple_members (couple_id, user_id) values ($1, $2)", [coupleId, extra]),
    ).rejects.toThrow(/two partners/);
  });

  it("requires a profile before pairing and refuses under-18 profiles", async () => {
    const kid = await createUser(db, "kid@spark.test");
    await expect(asUser(db, kid, (tx) => tx.query("select public.create_couple()"))).rejects.toThrow(/Finish your profile/);
    const recent = new Date();
    recent.setFullYear(recent.getFullYear() - 17);
    await expect(makeProfile(db, kid, "Kid", { birthday: recent.toISOString().slice(0, 10) })).rejects.toThrow(/18/);
  });
});

describe("media storage is scoped to the couple's own folder", () => {
  it("lets partners use their couple folder and blocks outsiders", async () => {
    await db.query("insert into storage.buckets (id, name) values ('couple-media', 'couple-media') on conflict do nothing");
    const objectName = `${coupleId}/moments/clip.mp4`;
    await asUser(db, alex, (tx) =>
      tx.query("insert into storage.objects (bucket_id, name) values ('couple-media', $1)", [objectName]),
    );
    const samSees = await asUser(db, sam, (tx) => rows(tx, "select * from storage.objects where name = $1", [objectName]));
    expect(samSees).toHaveLength(1);
    const caseySees = await asUser(db, casey, (tx) => rows(tx, "select * from storage.objects where name = $1", [objectName]));
    expect(caseySees).toHaveLength(0);
    await expect(
      asUser(db, casey, (tx) =>
        tx.query("insert into storage.objects (bucket_id, name) values ('couple-media', $1)", [`${coupleId}/moments/intrusion.mp4`]),
      ),
    ).rejects.toThrow(/row-level security/i);
    // and the other couple's own folder still works for them
    await asUser(db, casey, (tx) =>
      tx.query("insert into storage.objects (bucket_id, name) values ('couple-media', $1)", [`${otherCoupleId}/moments/ours.mp4`]),
    );
  });
});
