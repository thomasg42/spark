/**
 * Phase 1 acceptance scenario ("done when"), at the database layer with the real
 * migrations, RLS policies and the real encryption module:
 *   two test accounts pair -> complete light onboarding privately -> monthly
 *   check-in answers hidden until both submit, then revealed -> log an activity.
 * (Five date ideas are covered in tests/functions/date-ideas.test.ts; the RLS
 *  privacy guarantees in depth are in privacy.test.ts.)
 */
import { randomBytes } from "node:crypto";
import { aad, createSealer, scopes } from "@shared/crypto.ts";
import { SECTIONS } from "@shared/questionnaires.ts";
import { asUser, createDb, createUser, makeProfile, rows, type Db } from "./harness";

const sealer = createSealer(randomBytes(32).toString("base64"));

let db: Db;
let alex: string;
let sam: string;
let coupleId: string;

beforeAll(async () => {
  db = await createDb();
  alex = await createUser(db, "alex@spark.test");
  sam = await createUser(db, "sam@spark.test");
});
afterAll(() => db.close());

it("1. two test accounts create profiles and pair with an invite code", async () => {
  await makeProfile(db, alex, "Alex", { preferred_cadence: "daily", social_sharing: "open" });
  await makeProfile(db, sam, "Sam", { preferred_cadence: "monthly", social_sharing: "status_only" });
  const created = await asUser(db, alex, (tx) => rows<{ id: string; invite_code: string }>(tx, "select id, invite_code from public.create_couple()"));
  coupleId = created[0]!.id;
  await asUser(db, sam, (tx) => tx.query("select public.join_couple($1)", [created[0]!.invite_code]));
  const members = await asUser(db, sam, (tx) => rows<{ user_id: string }>(tx, "select user_id from public.couple_members"));
  expect(members.map((m) => m.user_id).sort()).toEqual([alex, sam].sort());
  // Partners see each other's open choices (cadence, social) for negotiation.
  const partner = await asUser(db, alex, (tx) => rows<{ preferred_cadence: string; social_sharing: string }>(tx, "select preferred_cadence, social_sharing from public.profiles where user_id = $1", [sam]));
  expect(partner[0]).toEqual({ preferred_cadence: "monthly", social_sharing: "status_only" });
});

it("2. each partner completes the light onboarding privately (encrypted, partner can't read)", async () => {
  const answerAll = async (userId: string, prefix: string) => {
    for (const section of SECTIONS) {
      for (const question of section.sittings[0]!.questions) {
        const value = question.kind === "scale" ? 4 : question.kind === "multi" ? [question.options[0]!.value] : question.kind === "single" ? question.options[0]!.value : `${prefix} private answer to ${question.id}`;
        const ct = await sealer.encryptJson(value, scopes.user(userId), aad.privateAnswer(userId, question.id));
        await asUser(db, userId, (tx) =>
          tx.query(
            `insert into public.private_answers (section, question_id, answer_ciphertext) values ($1, $2, $3)
             on conflict (user_id, question_id) do update set answer_ciphertext = excluded.answer_ciphertext, skipped = false`,
            [section.key, question.id, ct],
          ),
        );
      }
    }
  };
  await answerAll(alex, "Alex's");
  await answerAll(sam, "Sam's");

  const expected = SECTIONS.reduce((n, s) => n + s.sittings[0]!.questions.length, 0);
  const alexOwn = await asUser(db, alex, (tx) => rows<{ question_id: string; answer_ciphertext: string }>(tx, "select question_id, answer_ciphertext from public.private_answers"));
  expect(alexOwn).toHaveLength(expected);
  // Stored as ciphertext only.
  for (const r of alexOwn) expect(r.answer_ciphertext).not.toContain("private answer");
  const decrypted = await sealer.decryptJson<string>(
    alexOwn.find((r) => r.question_id === "what_attracted_you")!.answer_ciphertext,
    scopes.user(alex),
    aad.privateAnswer(alex, "what_attracted_you"),
  );
  expect(decrypted).toBe("Alex's private answer to what_attracted_you");

  // The partner sees none of them, and couldn't decrypt them even with the rows.
  const samSeesAlex = await asUser(db, sam, (tx) => rows(tx, "select * from public.private_answers where user_id = $1", [alex]));
  expect(samSeesAlex).toHaveLength(0);
  await expect(
    sealer.decrypt(alexOwn[0]!.answer_ciphertext, scopes.user(sam), aad.privateAnswer(alex, alexOwn[0]!.question_id)),
  ).rejects.toThrow("Decryption failed");
});

it("3. monthly check-in: hidden until both submit, then revealed side by side", async () => {
  const period = "2026-10";
  const checkinId = (await asUser(db, alex, (tx) => rows<{ id: string }>(tx, "select public.ensure_checkin($1) as id", [period])))[0]!.id;
  const submit = async (userId: string, answers: Record<string, string>) => {
    const ct = await sealer.encryptJson(answers, scopes.couple(coupleId), aad.checkinResponse(checkinId, userId));
    await asUser(db, userId, (tx) => tx.query("insert into public.checkin_responses (checkin_id, couple_id, answers_ciphertext) values ($1, $2, $3)", [checkinId, coupleId, ct]));
  };
  await submit(alex, { best: "Hot springs", closest: "Sunday dinner", distant: "Busy Wednesday", more_of: "Walks", talk_about: "Spring trip" });

  const samBefore = await asUser(db, sam, (tx) => rows(tx, "select * from public.checkin_responses where checkin_id = $1", [checkinId]));
  expect(samBefore).toHaveLength(0);

  await submit(sam, { best: "Hot springs!", closest: "The drive home", distant: "Not really", more_of: "New restaurants", talk_about: "Spring trip ideas" });

  const revealed = await asUser(db, sam, (tx) => rows<{ user_id: string; answers_ciphertext: string }>(tx, "select user_id, answers_ciphertext from public.checkin_responses where checkin_id = $1", [checkinId]));
  expect(revealed).toHaveLength(2);
  const byUser = Object.fromEntries(
    await Promise.all(
      revealed.map(async (r) => [r.user_id, await sealer.decryptJson<Record<string, string>>(r.answers_ciphertext, scopes.couple(coupleId), aad.checkinResponse(checkinId, r.user_id))]),
    ),
  );
  expect(byUser[alex]!.best).toBe("Hot springs");
  expect(byUser[sam]!.best).toBe("Hot springs!");

  const summary = await sealer.encryptJson({ overlaps: ["You both loved the hot springs."], gaps: [], conversationStarter: "Where to in spring?" }, scopes.couple(coupleId), aad.checkinSummary(checkinId));
  const stored = await asUser(db, alex, (tx) => rows<{ s: string }>(tx, "select public.set_checkin_summary($1, $2) as s", [checkinId, summary]));
  expect(stored[0]!.s).toBe(summary);
});

it("4. the couple logs an activity and both rate it", async () => {
  const activity = await asUser(db, alex, (tx) =>
    rows<{ id: string }>(tx, "insert into public.activities (couple_id, title, happened_on, category, note) values ($1, 'Pottery class', '2026-10-04', 'creative', 'Messy and great') returning id", [coupleId]),
  );
  await asUser(db, alex, (tx) => tx.query("insert into public.activity_ratings (activity_id, couple_id, rating) values ($1, $2, 5)", [activity[0]!.id, coupleId]));
  await asUser(db, sam, (tx) => tx.query("insert into public.activity_ratings (activity_id, couple_id, rating) values ($1, $2, 4)", [activity[0]!.id, coupleId]));
  const ratings = await asUser(db, sam, (tx) => rows<{ user_id: string; rating: number }>(tx, "select user_id, rating from public.activity_ratings where activity_id = $1", [activity[0]!.id]));
  expect(Object.fromEntries(ratings.map((r) => [r.user_id, r.rating]))).toEqual({ [alex]: 5, [sam]: 4 });
});

it("5. the couple can store a batch of five date ideas", async () => {
  const batch = crypto.randomUUID();
  await asUser(db, sam, async (tx) => {
    for (let i = 0; i < 5; i++) {
      await tx.query(
        `insert into public.date_ideas (couple_id, batch_id, title, description, category, budget, duration, time_of_day, weather, why, source)
         values ($1, $2, $3, 'A fun plan', 'adventure', '$', 'evening', 'evening', 'either', 'You love trying new things', 'claude')`,
        [coupleId, batch, `Idea ${i + 1}`],
      );
    }
  });
  const ideas = await asUser(db, alex, (tx) => rows(tx, "select * from public.date_ideas where batch_id = $1", [batch]));
  expect(ideas).toHaveLength(5);
});
