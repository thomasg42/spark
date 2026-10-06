/**
 * Phase 1 acceptance scenario through the DEMO backend's public contract (the
 * same Backend interface the UI uses), starting from a fresh demo with two empty
 * accounts. The demo must enforce the same privacy rules as the database.
 */
import { createDemoBackend } from "@/lib/backend/demo";
import { DEMO_ALEX, DEMO_SAM } from "@/lib/backend/demo/store";
import type { Backend, CheckinAnswers } from "@/lib/backend/types";
import { periodOf, toISODate, weekStartOf } from "@/lib/domain/dates";
import { SECTIONS, type AnswerValue, type Question } from "@shared/questionnaires.ts";

const b: Backend = createDemoBackend();
const as = (id: string) => b.demo!.actAs(id);
const today = new Date();

function sampleValue(q: Question, who: string): AnswerValue {
  switch (q.kind) {
    case "scale":
      return 4;
    case "multi":
      return [q.options[0]!.value];
    case "single":
      return q.options[0]!.value;
    default:
      return `${who} secret about ${q.id}`;
  }
}

const profileInput = (name: string) => ({
  displayName: name,
  nickname: null,
  birthday: "1994-05-17",
  birthTime: null,
  birthPlace: null,
  accentTheme: "rose" as const,
  colorMode: "system" as const,
  preferredCadence: "weekly" as const,
  socialSharing: null,
  adultConfirmed: true as const,
});

beforeAll(() => {
  b.demo!.reset(true);
});

it("two demo accounts pair with an invite code", async () => {
  as(DEMO_ALEX);
  await b.profiles.create(profileInput("Alex"));
  const couple = await b.couple.create();
  expect(couple.inviteCode).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
  as(DEMO_SAM);
  await b.profiles.create(profileInput("Sam"));
  await expect(b.couple.join("WRONGCDE")).rejects.toThrow(/did not match/);
  const joined = await b.couple.join(couple.inviteCode!.toLowerCase());
  expect(joined.memberIds.sort()).toEqual([DEMO_ALEX, DEMO_SAM].sort());
  expect((await b.profiles.getPartner())?.displayName).toBe("Alex");
});

it("both complete the light onboarding privately", async () => {
  for (const [id, who] of [[DEMO_ALEX, "Alex"], [DEMO_SAM, "Sam"]] as const) {
    as(id);
    for (const section of SECTIONS) {
      const [first, ...rest] = section.sittings[0]!.questions;
      await b.answers.save(first!.id, sampleValue(first!, who));
      for (const q of rest) await b.answers.save(q.id, sampleValue(q, who));
      await b.answers.skip(section.sittings[1]!.questions[0]!.id);
    }
  }
  as(DEMO_SAM);
  const samView = await b.answers.list();
  expect(samView.length).toBeGreaterThan(0);
  expect(JSON.stringify(samView)).not.toContain("Alex secret");
  as(DEMO_ALEX);
  const alexView = await b.answers.list("beginnings");
  expect(alexView.every((a) => a.section === "beginnings")).toBe(true);
  expect(JSON.stringify(alexView)).toContain("Alex secret");
  expect(JSON.stringify(alexView)).not.toContain("Sam secret");
  await expect(b.answers.save("not_a_question", "x")).rejects.toThrow();
});

it("monthly check-in answers stay hidden until both submit, then reveal with a summary", async () => {
  const period = periodOf(today);
  const answers = (who: string): CheckinAnswers => ({ best: `${who}: the hike`, closest: `${who}: dinner`, distant: "", more_of: `${who}: walks`, talk_about: "" });
  as(DEMO_ALEX);
  const afterAlex = await b.checkins.submit(period, answers("Alex"));
  expect(afterAlex).toMatchObject({ iSubmitted: true, partnerSubmitted: false, revealed: false, partner: null, summary: null });

  as(DEMO_SAM);
  const samBefore = await b.checkins.get(period);
  expect(samBefore).toMatchObject({ iSubmitted: false, partnerSubmitted: true, revealed: false, partner: null, summary: null });
  expect(JSON.stringify(samBefore)).not.toContain("Alex: the hike");

  const samAfter = await b.checkins.submit(period, answers("Sam"));
  expect(samAfter.revealed).toBe(true);
  expect(samAfter.partner?.best).toBe("Alex: the hike");
  expect(samAfter.summary).not.toBeNull();

  as(DEMO_ALEX);
  const alexAfter = await b.checkins.get(period);
  expect(alexAfter.partner?.best).toBe("Sam: the hike");
  await expect(b.checkins.submit(period, answers("Alex"))).rejects.toThrow();
});

it("weekly pulse: the partner's score appears only once both are in", async () => {
  const week = weekStartOf(today);
  as(DEMO_ALEX);
  await b.pulse.submit(week, 4, 5);
  as(DEMO_SAM);
  expect((await b.pulse.history(4)).filter((p) => p.userId === DEMO_ALEX && p.weekStart === week)).toHaveLength(0);
  expect(await b.pulse.status(week)).toEqual({ iSubmitted: false, partnerSubmitted: true });
  await b.pulse.submit(week, 3, 4);
  expect((await b.pulse.history(4)).filter((p) => p.weekStart === week)).toHaveLength(2);
});

it("the couple logs an activity, both rate it, and get five new non-repeating date ideas", async () => {
  as(DEMO_ALEX);
  const activity = await b.activities.add({ title: "Pottery class", happenedOn: toISODate(today), category: "creative", note: "Messy and great" });
  await b.activities.rate(activity.id, 5);
  as(DEMO_SAM);
  await b.activities.rate(activity.id, 4);
  const listed = (await b.activities.list()).find((a) => a.id === activity.id)!;
  expect(listed.ratings).toEqual({ [DEMO_ALEX]: 5, [DEMO_SAM]: 4 });

  const batch = await b.ideas.generate();
  expect(batch.ideas).toHaveLength(5);
  const titles = batch.ideas.map((i) => i.title.toLowerCase());
  expect(new Set(titles).size).toBe(5);
  expect(titles).not.toContain("pottery class");
  for (const idea of batch.ideas) {
    expect(idea.budget).toMatch(/^(free|\$|\$\$|\$\$\$)$/);
    expect(["quick", "evening", "half_day", "full_day"]).toContain(idea.duration);
    expect(["indoor", "outdoor", "either"]).toContain(idea.weather);
  }
  const second = await b.ideas.generate();
  expect(second.ideas).toHaveLength(5);
  const overlap = second.ideas.filter((i) => titles.includes(i.title.toLowerCase()));
  expect(overlap).toHaveLength(0);
});

it("Moments: both see the feed, only the author can delete", async () => {
  as(DEMO_ALEX);
  const m = await b.moments.add({ kind: "note", caption: "Saw a dog that looked like yours" });
  as(DEMO_SAM);
  expect((await b.moments.list()).some((x) => x.id === m.id)).toBe(true);
  await b.moments.react(m.id, "laugh");
  await expect(b.moments.remove(m.id)).rejects.toThrow();
  as(DEMO_ALEX);
  expect((await b.moments.list()).find((x) => x.id === m.id)?.reactions[DEMO_SAM]).toBe("laugh");
  await b.moments.remove(m.id);
  expect((await b.moments.list()).some((x) => x.id === m.id)).toBe(false);
});
