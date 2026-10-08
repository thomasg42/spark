/**
 * Module H, Hints (2026-10-08): the "is this moment happening?" mirror of the
 * database check, pattern cards from open shares only, and the demo following
 * the same unlock and moment rules as RLS.
 */
import { awayNow, excitementDippedTogether, flagActive, hintMomentActive } from "@/lib/domain/hint-moments";
import { patternCardFrom } from "@/lib/domain/pattern-card";
import { boostingChanges } from "@/lib/domain/rhythm-breaker";
import { agreedRhythm } from "@/lib/domain/rhythm";
import { createDemoBackend } from "@/lib/backend/demo";
import { DEMO_ALEX, DEMO_SAM, demoStore } from "@/lib/backend/demo/store";
import { addDays, previousWeekStart, toISODate, weekStartOf } from "@/lib/domain/dates";
import type { PulseEntry } from "@/lib/backend/types";

const now = new Date(2026, 9, 8, 12); // Thursday Oct 8, local
const day = (n: number) => toISODate(addDays(now, n));
const week = (back: number) => previousWeekStart(weekStartOf(now), back);
const p = (userId: string, back: number, excitement: number): PulseEntry => ({ userId, weekStart: week(back), excitement, connection: 3 });

describe("is this hint's moment happening?", () => {
  it("'when we're apart': a trip or long work stretch from 14 days back to 7 ahead; a new job doesn't count", () => {
    expect(awayNow([{ kind: "trip", happenedOn: day(5) }], now)).toBe(true);
    expect(awayNow([{ kind: "work_stretch", happenedOn: day(-14) }], now)).toBe(true);
    expect(awayNow([{ kind: "trip", happenedOn: day(8) }], now)).toBe(false);
    expect(awayNow([{ kind: "work_stretch", happenedOn: day(-15) }], now)).toBe(false);
    expect(awayNow([{ kind: "new_job", happenedOn: day(0) }], now)).toBe(false);
  });

  it("'when excitement dips': three falling weeks, counting only weeks you BOTH answered, and not stale", () => {
    const dip = [p("sam", 2, 5), p("sam", 1, 4), p("sam", 0, 2)];
    expect(excitementDippedTogether(dip, now)).toBe(false); // Alex never answered: nothing is revealed
    const together = [...dip, p("alex", 2, 4), p("alex", 1, 4), p("alex", 0, 4)];
    expect(excitementDippedTogether(together, now)).toBe(true);
    expect(excitementDippedTogether(together, addDays(now, 28))).toBe(false); // nobody followed up in weeks: old news
    expect(excitementDippedTogether([...dip, p("alex", 2, 4), p("alex", 1, 4)], now)).toBe(false); // latest week unrevealed
  });

  it("'feeling distant': only the hint's author's own flag, for 14 days", () => {
    const flag = { userId: "sam", raisedAt: addDays(now, -13).toISOString() };
    expect(flagActive(flag, now)).toBe(true);
    expect(flagActive({ ...flag, raisedAt: addDays(now, -15).toISOString() }, now)).toBe(false);
    const input = { flags: [flag], lifeChanges: [], pulses: [], now };
    expect(hintMomentActive("feeling_distant", { ...input, authorId: "sam" })).toBe(true);
    expect(hintMomentActive("feeling_distant", { ...input, authorId: "alex" })).toBe(false);
  });

  it("a trip apart unlocks 'apart' hints but never speeds up the check-in rhythm", () => {
    const changes = [{ kind: "trip" as const, happenedOn: day(-2) }, { kind: "work_stretch" as const, happenedOn: day(-1) }];
    expect(boostingChanges(changes)).toEqual([]);
    expect(agreedRhythm("weekly", "weekly", [], boostingChanges(changes).map((c) => ({ date: c.happenedOn })), now).current).toBe("weekly");
  });
});

describe("pattern cards", () => {
  it("are made only from open shares, in the author's own words, and need at least two lines", () => {
    const card = patternCardFrom([
      { questionId: "conflict_tendency", level: "open", text: "Pull away to think" },
      { questionId: "dont_take_personally", level: "open", text: "It doesn't mean I'm done with us." },
      { questionId: "after_conflict_need", level: "hint", text: "Patience goes a long way with them." },
    ]);
    expect(card!.lines.map((l) => [l.lead, l.text])).toEqual([
      ["When things get hard, I tend to", "Pull away to think"],
      ["It's not about you", "It doesn't mean I'm done with us"],
    ]);
    expect(patternCardFrom([{ questionId: "conflict_tendency", level: "open", text: "Pull away to think" }])).toBeNull();
  });
});

describe("demo hints follow the database rules", () => {
  const backend = createDemoBackend();
  const actAs = (id: string) =>
    demoStore.update((s) => {
      s.signedIn = true;
      s.actingAs = id;
    });
  beforeEach(() => {
    demoStore.reset(false);
    actAs(DEMO_ALEX);
  });

  it("Alex sees Sam's shares on questions Alex answered, and a locked teaser for the rest", async () => {
    const { shares, teasers } = await backend.buddy.partnerHints();
    expect(shares.map((s) => s.questionId).sort()).toEqual(["conflict_tendency", "dont_take_personally", "feel_close_when", "love_language"]);
    expect(teasers).toEqual([{ questionId: "trust_hurts", level: "hint" }]);
    expect(JSON.stringify({ shares, teasers })).not.toContain("Private sample answer");
  });

  it("a 'when I'm feeling distant' hint stays hidden, not even teased, until its author raises the flag", async () => {
    actAs(DEMO_SAM);
    await backend.buddy.share("feel_close_when", "hint", "Unhurried evenings with phones put away go a long way with them.", "feeling_distant");
    actAs(DEMO_ALEX);
    let view = await backend.buddy.partnerHints();
    expect(view.shares.some((s) => s.questionId === "feel_close_when")).toBe(false);
    expect(view.teasers.some((t) => t.questionId === "feel_close_when")).toBe(false);
    await backend.distanceFlags.raise(); // Alex's own flag doesn't unlock Sam's hint
    expect((await backend.buddy.partnerHints()).shares.some((s) => s.questionId === "feel_close_when")).toBe(false);
    actAs(DEMO_SAM);
    await backend.distanceFlags.raise();
    actAs(DEMO_ALEX);
    view = await backend.buddy.partnerHints();
    expect(view.shares.find((s) => s.questionId === "feel_close_when")?.showWhen).toBe("feeling_distant");
    expect((await backend.distanceFlags.list()).map((f) => f.userId).sort()).toEqual([DEMO_ALEX, DEMO_SAM].sort());
    actAs(DEMO_SAM);
    await backend.distanceFlags.clear();
    actAs(DEMO_ALEX);
    expect((await backend.buddy.partnerHints()).shares.some((s) => s.questionId === "feel_close_when")).toBe(false);
  });

  it("a 'when we're apart' hint shows while a trip is logged; open shares can't wait for a moment", async () => {
    actAs(DEMO_SAM);
    await backend.buddy.share("love_language", "hint", "Words and real time together land best with them.", "away");
    const open = await backend.buddy.share("conflict_tendency", "open", null, "away");
    expect(open?.showWhen).toBeNull();
    await expect(backend.buddy.share("love_language", "hint", "x y z", "whenever" as never)).rejects.toThrow(/when this hint should show/);
    actAs(DEMO_ALEX);
    expect((await backend.buddy.partnerHints()).shares.some((s) => s.questionId === "love_language")).toBe(false);
    await backend.lifeChanges.add({ kind: "trip", happenedOn: toISODate(addDays(new Date(), 2)) });
    expect((await backend.buddy.partnerHints()).shares.some((s) => s.questionId === "love_language")).toBe(true);
  });

  it("Buddy's go-between replies follow the same unlock rule", async () => {
    const before = await backend.buddy.partnerHints();
    expect(before.shares.some((s) => s.questionId === "trust_hurts")).toBe(false);
    await backend.answers.skip("trust_hurts"); // a skip doesn't unlock anything
    expect((await backend.buddy.partnerHints()).teasers.map((t) => t.questionId)).toEqual(["trust_hurts"]);
  });
});
