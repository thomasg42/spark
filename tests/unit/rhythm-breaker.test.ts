/**
 * Module E, Rhythm Breaker (2026-10-08): standing date nights (validation, the
 * next time it comes around, a weekly-repeat calendar file), the life-change
 * log that raises the check-in rhythm for six weeks, and the Home cards that
 * turn rut signals into something specific to do.
 */
import { checkDateRule, describeRule, icsEscape, icsFold, nextOccurrence, rulesToIcs, time12, upcomingRules } from "@/lib/domain/date-rules";
import { checkLifeChange, rhythmCards, snoozedUntil } from "@/lib/domain/rhythm-breaker";
import { agreedRhythm, lifeChangeBoostUntil } from "@/lib/domain/rhythm";
import { dateRules, lifeChanges } from "@/lib/backend/demo/rhythm-breaker";
import { DEMO_ALEX, DEMO_SAM, demoStore } from "@/lib/backend/demo/store";
import type { Activity, DateRule, PulseEntry } from "@/lib/backend/types";

// Wednesday 2026-10-07 is a Wednesday; these are local times.
const at = (iso: string, hhmm = "12:00") => {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const [h, min] = hhmm.split(":").map(Number) as [number, number];
  return new Date(y, m - 1, d, h, min);
};

const rule = (over: Partial<DateRule> = {}): DateRule => ({
  id: "r1",
  title: "Date night",
  weekday: 3,
  startTime: "18:00",
  endTime: "21:00",
  note: "Date night, then we each go home.",
  active: true,
  createdBy: "u1",
  createdAt: "2026-10-01T00:00:00Z",
  ...over,
});

describe("standing date nights", () => {
  it("checks the input like the database does", () => {
    expect(checkDateRule({ title: " Date night ", weekday: 3, startTime: "18:00", endTime: "21:00", note: "  " })).toEqual({ title: "Date night", weekday: 3, startTime: "18:00", endTime: "21:00", note: null });
    expect(() => checkDateRule({ title: "", weekday: 3, startTime: "18:00", endTime: "21:00" })).toThrow(/name/);
    expect(() => checkDateRule({ title: "x", weekday: 7, startTime: "18:00", endTime: "21:00" })).toThrow(/day of the week/);
    expect(() => checkDateRule({ title: "x", weekday: 3, startTime: "21:00", endTime: "18:00" })).toThrow(/after the start/);
    expect(() => checkDateRule({ title: "x", weekday: 3, startTime: "6pm", endTime: "21:00" })).toThrow(/start and end/);
  });

  it("reads like a person would say it", () => {
    expect(time12("18:00")).toBe("6 PM");
    expect(time12("18:30")).toBe("6:30 PM");
    expect(time12("00:00")).toBe("12 AM");
    expect(describeRule(rule())).toBe("Every Wednesday, 6 to 9 PM");
    expect(describeRule(rule({ weekday: 6, startTime: "10:00", endTime: "14:00" }))).toBe("Every Saturday, 10 AM to 2 PM");
  });

  it("comes around tonight until the night is over, then next week", () => {
    expect(nextOccurrence(rule(), at("2026-10-07", "17:00"))).toBe("2026-10-07");
    expect(nextOccurrence(rule(), at("2026-10-07", "20:59"))).toBe("2026-10-07");
    expect(nextOccurrence(rule(), at("2026-10-07", "21:00"))).toBe("2026-10-14");
    expect(nextOccurrence(rule(), at("2026-10-05"))).toBe("2026-10-07"); // Monday -> this Wednesday
    expect(nextOccurrence(rule({ weekday: 0 }), at("2026-10-10"))).toBe("2026-10-11"); // Saturday -> Sunday
  });

  it("lists active ones soonest first and skips paused ones", () => {
    const list = upcomingRules([rule({ id: "wed" }), rule({ id: "mon", weekday: 1 }), rule({ id: "off", weekday: 2, active: false })], at("2026-10-07", "22:00"));
    expect(list.map((u) => [u.rule.id, u.on])).toEqual([["mon", "2026-10-12"], ["wed", "2026-10-14"]]);
    expect(upcomingRules([rule()], at("2026-10-07", "19:00"))[0]!.tonight).toBe(true);
  });

  it("makes a calendar file that repeats weekly with a reminder, from the next occurrence", () => {
    const ics = rulesToIcs([rule(), rule({ id: "off", active: false })], at("2026-10-08", "09:00"), { partnerName: "Sam" });
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).not.toMatch(/[^\r]\n/); // every line ends with CRLF
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1); // the paused one is left out
    expect(ics).toContain("UID:r1@spark-standing-dates");
    expect(ics).toContain("DTSTART:20261014T180000"); // floating local time, next Wednesday
    expect(ics).toContain("DTEND:20261014T210000");
    expect(ics).toContain("RRULE:FREQ=WEEKLY;BYDAY=WE");
    expect(ics).toContain("TRIGGER:-PT1H");
    expect(ics).toContain("DESCRIPTION:Date night\\, then we each go home.\\nWith Sam. Set in Spark.");
  });

  it("escapes and folds calendar text without breaking characters", () => {
    expect(icsEscape("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
    const long = `SUMMARY:${"💛".repeat(40)}`;
    const folded = icsFold(long);
    for (const line of folded.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, "")).toBe(long);
  });
});

describe("life changes raise the rhythm for six weeks", () => {
  const today = at("2026-10-08");

  it("checks what changed and when", () => {
    expect(checkLifeChange({ kind: "new_job", happenedOn: "2026-10-01", note: " New shifts " }, today)).toEqual({ kind: "new_job", happenedOn: "2026-10-01", note: "New shifts" });
    expect(() => checkLifeChange({ kind: "lottery" as never, happenedOn: "2026-10-01" }, today)).toThrow(/what changed/);
    expect(() => checkLifeChange({ kind: "move", happenedOn: "2026-02-30" }, today)).toThrow(/when/);
    expect(() => checkLifeChange({ kind: "move", happenedOn: "2027-06-01" }, today)).toThrow(/six months/);
  });

  it("moves the shared rhythm one step more often until the six weeks are up", () => {
    const changes = [{ date: "2026-10-01" }];
    const r = agreedRhythm("weekly", "weekly", [], changes, today);
    expect(r.current).toBe("twice_weekly");
    expect(r.boostedUntil).toBe("2026-11-11"); // 42 days counting the day it happened
    expect(agreedRhythm("weekly", "weekly", [], changes, at("2026-11-12")).current).toBe("weekly");
    expect(agreedRhythm("weekly", "weekly", [], [], today)).toMatchObject({ current: "weekly", boostedUntil: null });
    expect(agreedRhythm("daily", "daily", [], changes, today)).toMatchObject({ current: "daily", boostedUntil: null }); // never past daily
    expect(lifeChangeBoostUntil([{ date: "2026-11-01" }], today)).toBeNull(); // a planned move counts once it happens
  });
});

describe("Rhythm Breaker cards", () => {
  const today = at("2026-10-08"); // Thursday
  const activity = (happenedOn: string, category: Activity["category"]): Activity => ({ id: happenedOn, title: "x", happenedOn, category, note: null, photoPath: null, createdBy: null, sourceIdeaId: null, ratings: {}, createdAt: "" });
  const sameOld = [activity("2026-09-22", "chill"), activity("2026-09-29", "chill"), activity("2026-10-06", "food")];
  const pulse = (userId: string, weekStart: string, excitement: number): PulseEntry => ({ userId, weekStart, excitement, connection: 4 });

  it("turns 'same kinds of dates for three weeks' into a specific next step", () => {
    const cards = rhythmCards({ activities: sameOld, pulses: [], lifeChanges: [], rules: [], today });
    expect(cards).toEqual([{ id: "category_rut", message: expect.stringMatching(/same couple of plans for 3 weeks/), actions: [{ label: "Find a new kind of date", href: "/activities/ideas/" }] }]);
  });

  it("suggests a standing date night only to couples who don't have one", () => {
    const lonely = [activity("2026-09-01", "food")];
    expect(rhythmCards({ activities: lonely, pulses: [], lifeChanges: [], rules: [], today })[0]!.actions[0]).toEqual({ label: "Set a standing date night", href: "/plans/standing/" });
    const withRule = rhythmCards({ activities: lonely, pulses: [], lifeChanges: [], rules: [rule()], today });
    expect(withRule[0]!.actions.map((a) => a.href)).toEqual(["/activities/ideas/"]);
  });

  it("notices excitement dipping two weeks running without naming anyone", () => {
    const pulses = [pulse("sam", "2026-09-21", 5), pulse("sam", "2026-09-28", 4), pulse("sam", "2026-10-05", 2)];
    const [card] = rhythmCards({ activities: [], pulses, lifeChanges: [], rules: [], today });
    expect(card!.id).toBe("excitement_drop");
    expect(card!.message).not.toMatch(/sam/i);
    expect(card!.actions.map((a) => a.label)).toEqual(["Send a little note", "Plan a tech-free night with Buddy"]);
  });

  it("explains a life change, puts a card off for a week, and never shows more than two", () => {
    const lifeChanges = [{ kind: "new_job" as const, happenedOn: "2026-10-01" }];
    const busy = { activities: [activity("2026-09-01", "food")], pulses: [pulse("u", "2026-09-21", 5), pulse("u", "2026-09-28", 4), pulse("u", "2026-10-05", 2)], lifeChanges, rules: [rule()], today };
    const all = rhythmCards(busy);
    expect(all).toHaveLength(2);
    const snoozed = rhythmCards({ ...busy, snoozed: { excitement_drop: snoozedUntil(today), little_time: snoozedUntil(today) } });
    expect(snoozed.map((c) => c.id)).toEqual(["life_change"]);
    expect(snoozed[0]!.message).toMatch(/a little more frequent/);
    expect(snoozedUntil(today)).toBe("2026-10-14");
    // The week is up: the card comes back. Two weeks on with no new quick check-in, the dip is old news.
    expect(rhythmCards({ ...busy, today: at("2026-10-15"), snoozed: { excitement_drop: "2026-10-14" } }).some((c) => c.id === "excitement_drop")).toBe(true);
    expect(rhythmCards({ ...busy, today: at("2026-10-26") }).some((c) => c.id === "excitement_drop")).toBe(false);
  });
});

describe("demo standing dates and life changes follow the database rules", () => {
  const actAs = (userId: string) =>
    demoStore.update((s) => {
      s.signedIn = true;
      s.actingAs = userId;
    });
  beforeEach(() => {
    demoStore.reset(false);
    actAs(DEMO_ALEX);
  });

  it("both see a standing date; only the person who set it can pause or remove it", async () => {
    const r = await dateRules.add({ title: "Date night", weekday: 3, startTime: "18:00", endTime: "21:00", note: "Then we each go home." });
    actAs(DEMO_SAM);
    expect((await dateRules.list()).map((x) => x.title)).toEqual(["Date night"]);
    await expect(dateRules.update(r.id, { active: false })).rejects.toThrow(/Only the person who set/);
    await expect(dateRules.remove(r.id)).rejects.toThrow(/Only the person who set/);
    actAs(DEMO_ALEX);
    expect((await dateRules.update(r.id, { active: false })).active).toBe(false);
    await expect(dateRules.update(r.id, { endTime: "17:00" })).rejects.toThrow(/after the start/);
    await dateRules.remove(r.id);
    expect(await dateRules.list()).toEqual([]);
  });

  it("keeps at most five standing dates", async () => {
    for (let d = 0; d < 5; d++) await dateRules.add({ title: `Night ${d}`, weekday: d, startTime: "18:00", endTime: "21:00" });
    await expect(dateRules.add({ title: "One more", weekday: 6, startTime: "18:00", endTime: "21:00" })).rejects.toThrow(/5 standing dates/);
  });

  it("both see a life change; only the person who logged it can remove it", async () => {
    const c = await lifeChanges.add({ kind: "new_schedule", happenedOn: "2026-10-01", note: "Night shifts" });
    actAs(DEMO_SAM);
    expect((await lifeChanges.list()).map((x) => x.note)).toEqual(["Night shifts"]);
    await expect(lifeChanges.remove(c.id)).rejects.toThrow(/Only the person who logged/);
    actAs(DEMO_ALEX);
    await lifeChanges.remove(c.id);
    expect(await lifeChanges.list()).toEqual([]);
  });

  // The live demo already has saved data in people's browsers from before Module E.
  it("an older saved demo without these lists still loads, keeping its data", async () => {
    const saved = JSON.parse(JSON.stringify(demoStore.get())) as Record<string, unknown>;
    delete saved.dateRules;
    delete saved.lifeChanges;
    const storage = new Map([["spark-demo-v4", JSON.stringify(saved)]]);
    vi.stubGlobal("localStorage", { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v), removeItem: (k: string) => storage.delete(k) });
    try {
      vi.resetModules();
      const fresh = await import("@/lib/backend/demo/store");
      expect(fresh.demoStore.get().dateRules).toEqual([]);
      expect(fresh.demoStore.get().lifeChanges).toEqual([]);
      expect(fresh.demoStore.get().activities.length).toBe((saved.activities as unknown[]).length);
    } finally {
      vi.unstubAllGlobals();
      vi.resetModules();
    }
  });
});
