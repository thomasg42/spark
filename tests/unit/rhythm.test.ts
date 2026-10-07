import { agreedRhythm, paceOutcome, paceShift, quickCheckinDue } from "@/lib/domain/rhythm";
import { normalizeCheckinAnswers } from "@shared/checkin-questions.ts";
import { coerceAnswers } from "@shared/checkins-handler.ts";
import { answersMentionCrisis } from "@shared/checkin-summary.ts";

describe("pace votes move the rhythm only when both agree", () => {
  it("shifts on matching votes and holds otherwise", () => {
    expect(paceShift("sooner", "sooner")).toBe(-1);
    expect(paceShift("later", "later")).toBe(1);
    for (const [a, b] of [["sooner", "same"], ["sooner", "later"], ["same", "same"], ["later", null], [null, "sooner"]] as const) {
      expect(paceShift(a, b)).toBe(0);
    }
  });

  it("starts from the split of both picks", () => {
    expect(agreedRhythm("daily", "monthly", [])).toMatchObject({ base: "weekly", current: "weekly", steps: 0 });
    expect(agreedRhythm("weekly", null, []).current).toBeNull();
  });

  it("applies agreed votes in month order, one step each", () => {
    const r = agreedRhythm("monthly", "monthly", [
      { period: "2026-11", mine: "sooner", partner: "sooner" },
      { period: "2026-10", mine: "sooner", partner: "sooner" },
      { period: "2026-12", mine: "sooner", partner: "same" },
    ]);
    expect(r.rounds.map((x) => x.period)).toEqual(["2026-10", "2026-11", "2026-12"]);
    expect(r.rounds.map((x) => x.to)).toEqual(["biweekly", "weekly", "weekly"]);
    expect(r).toMatchObject({ base: "monthly", current: "weekly", steps: -2 });
  });

  it("never goes past daily or monthly", () => {
    const sooner = Array.from({ length: 8 }, (_, i) => ({ period: `2027-0${i + 1}`, mine: "sooner" as const, partner: "sooner" as const }));
    expect(agreedRhythm("daily", "daily", sooner).current).toBe("daily");
    const later = sooner.map((r) => ({ ...r, mine: "later" as const, partner: "later" as const }));
    expect(agreedRhythm("monthly", "monthly", later).current).toBe("monthly");
  });

  it("explains each outcome without blame", () => {
    expect(paceOutcome("sooner", "sooner", "Sam")).toMatch(/more often/);
    expect(paceOutcome("later", "later", "Sam")).toMatch(/less often/);
    expect(paceOutcome("same", "same", "Sam")).toMatch(/stays the same/);
    expect(paceOutcome("sooner", "later", "Sam")).toMatch(/voted differently/);
    expect(paceOutcome(null, "later", "Sam")).toMatch(/skipped/);
  });
});

describe("quick check-in due dates", () => {
  const today = new Date(2026, 9, 20);
  it("is due right away when there has never been one", () => {
    expect(quickCheckinDue("biweekly", null, today).due).toBe(true);
  });
  it("uses the rhythm interval from the last check-in", () => {
    expect(quickCheckinDue("weekly", "2026-10-13", today).due).toBe(true);
    expect(quickCheckinDue("weekly", "2026-10-14", today).due).toBe(false);
    expect(quickCheckinDue("biweekly", "2026-10-12T21:30:00Z", today).due).toBe(false);
    expect(quickCheckinDue("daily", "2026-10-19", today).due).toBe(true);
  });
  it("is never due without an agreed rhythm", () => {
    expect(quickCheckinDue(null, null, today).due).toBe(false);
  });
});

describe("pace vote on the monthly form", () => {
  const base = { best: "Hike", closest: "", distant: "", more_of: "", talk_about: "" };
  it("accepts a valid vote and rejects anything else", () => {
    expect(normalizeCheckinAnswers({ ...base, pace: "sooner" }).pace).toBe("sooner");
    expect(normalizeCheckinAnswers(base).pace).toBeUndefined();
    expect(() => normalizeCheckinAnswers({ ...base, pace: "asap" })).toThrow(/sooner/);
  });
  it("survives decryption on the server and never feeds crisis detection or prompts as text", () => {
    expect(coerceAnswers({ ...base, pace: "later" }).pace).toBe("later");
    expect(coerceAnswers({ ...base, pace: "<script>" }).pace).toBeUndefined();
    expect(coerceAnswers({ ...base, extra: "x" })).not.toHaveProperty("extra");
    expect(answersMentionCrisis({ ...base, pace: "sooner" })).toBe(false);
  });
});
