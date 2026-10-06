import {
  boostCadence,
  cadenceReviewDue,
  CADENCE_LADDER,
  coupleCadence,
  isCheckinDue,
  lifeChangeBoostActive,
  negotiateCadence,
  nextCheckinDue,
  PICKABLE_CADENCES,
  type Cadence,
} from "@/lib/domain/cadence";
import { toISODate } from "@/lib/domain/dates";

describe("cadence negotiation (splits the difference)", () => {
  it("matches the spec examples", () => {
    expect(negotiateCadence("daily", "monthly")).toBe("weekly");
    expect(negotiateCadence("weekly", "monthly")).toBe("biweekly");
  });

  it("is symmetric and idempotent for every pickable pair", () => {
    for (const a of PICKABLE_CADENCES) {
      expect(negotiateCadence(a, a)).toBe(a);
      for (const b of PICKABLE_CADENCES) {
        expect(negotiateCadence(a, b)).toBe(negotiateCadence(b, a));
      }
    }
  });

  it("splits daily and weekly into twice a week", () => {
    expect(negotiateCadence("daily", "weekly")).toBe("twice_weekly");
  });

  it("always lands between the two choices (inclusive)", () => {
    for (const a of CADENCE_LADDER) {
      for (const b of CADENCE_LADDER) {
        const result = CADENCE_LADDER.indexOf(negotiateCadence(a, b));
        const [lo, hi] = [CADENCE_LADDER.indexOf(a), CADENCE_LADDER.indexOf(b)].sort((x, y) => x - y) as [number, number];
        expect(result).toBeGreaterThanOrEqual(lo);
        expect(result).toBeLessThanOrEqual(hi);
      }
    }
  });

  it("rounds an uneven midpoint toward the less frequent rung (respects the partner needing space)", () => {
    expect(negotiateCadence("daily", "twice_weekly")).toBe("twice_weekly");
    expect(negotiateCadence("weekly", "biweekly")).toBe("biweekly");
    expect(negotiateCadence("daily", "biweekly")).toBe("weekly");
  });

  it("rejects unknown values", () => {
    expect(() => negotiateCadence("hourly" as Cadence, "weekly")).toThrow();
  });
});

describe("couple cadence shows both choices openly", () => {
  const today = new Date(2026, 9, 6);

  it("is pending until both partners pick", () => {
    expect(coupleCadence("weekly", null, [], today)).toMatchObject({ mine: "weekly", partner: null, agreed: null, effective: null });
  });

  it("reports both picks and the agreed rhythm", () => {
    expect(coupleCadence("daily", "monthly", [], today)).toMatchObject({ mine: "daily", partner: "monthly", agreed: "weekly", effective: "weekly", boosted: false });
  });

  it("a life change raises frequency one rung for six weeks, then returns", () => {
    const recent = [{ date: toISODate(new Date(2026, 9, 1)) }];
    expect(coupleCadence("weekly", "monthly", recent, today)).toMatchObject({ agreed: "biweekly", effective: "weekly", boosted: true });
    const old = [{ date: toISODate(new Date(2026, 7, 20)) }]; // 47 days before
    expect(coupleCadence("weekly", "monthly", old, today)).toMatchObject({ effective: "biweekly", boosted: false });
  });

  it("never boosts past daily", () => {
    expect(boostCadence("daily")).toBe("daily");
    expect(coupleCadence("daily", "daily", [{ date: "2026-10-05" }], today)).toMatchObject({ effective: "daily", boosted: false });
  });
});

describe("life change window", () => {
  const today = new Date(2026, 9, 6);
  it("counts day 0 to day 41 as active and ignores future-dated changes", () => {
    expect(lifeChangeBoostActive([{ date: "2026-10-06" }], today)).toBe(true);
    expect(lifeChangeBoostActive([{ date: "2026-08-26" }], today)).toBe(true); // 41 days
    expect(lifeChangeBoostActive([{ date: "2026-08-25" }], today)).toBe(false); // 42 days
    expect(lifeChangeBoostActive([{ date: "2026-10-20" }], today)).toBe(false);
  });
});

describe("due dates and quarterly review", () => {
  const today = new Date(2026, 9, 6);
  it("is due immediately when there's no previous check-in", () => {
    expect(isCheckinDue("weekly", null, today)).toBe(true);
  });
  it("adds the interval to the last check-in", () => {
    expect(toISODate(nextCheckinDue("biweekly", "2026-10-01", today))).toBe("2026-10-15");
    expect(isCheckinDue("weekly", "2026-10-01", today)).toBe(false);
    expect(isCheckinDue("weekly", "2026-09-29", today)).toBe(true);
  });
  it("prompts a revisit every 90 days", () => {
    expect(cadenceReviewDue(new Date(2026, 6, 8), today)).toBe(true); // 90 days
    expect(cadenceReviewDue(new Date(2026, 6, 9), today)).toBe(false); // 89 days
  });
});
