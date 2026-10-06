import {
  cadenceSavedMessage,
  formatLongDate,
  ladderSteps,
  morePrivate,
  nextRevisitDate,
  personName,
  possessive,
  previewAgreed,
  revisitInfo,
  rhythmExplanation,
  rhythmView,
  SOCIAL_RULE,
  socialSavedMessage,
  socialView,
} from "@/components/agreements/view-model";
import { CADENCE_LADDER, CADENCE_LABELS, PICKABLE_CADENCES } from "@/lib/domain/cadence";
import { addDays, toISODate } from "@/lib/domain/dates";
import { SOCIAL_COPY, SOCIAL_LEVELS } from "@/lib/domain/social";

const EM_DASH = "—";

describe("names", () => {
  it("prefers nickname, then display name, then the fallback", () => {
    expect(personName({ nickname: "Al", displayName: "Alex" })).toBe("Al");
    expect(personName({ nickname: null, displayName: "Sam" })).toBe("Sam");
    expect(personName({ nickname: "   ", displayName: "Sam" })).toBe("Sam");
    expect(personName(null)).toBe("Your partner");
    expect(personName(undefined, "You")).toBe("You");
  });

  it("makes possessives", () => {
    expect(possessive("Sam")).toBe("Sam's");
  });
});

describe("rhythm view", () => {
  it("shows both picks and the split for the demo couple (weekly + monthly)", () => {
    const view = rhythmView("weekly", "monthly", "Sam");
    expect(view.mineLabel).toBe("Every week");
    expect(view.partnerLabel).toBe("Every month");
    expect(view.agreed).toBe("biweekly");
    expect(view.agreedLabel).toBe("Every two weeks");
    expect(view.explanation).toMatch(/halfway between your two choices/i);
    expect(view.explanation).toMatch(/more space/i);
  });

  it("matches the spec examples", () => {
    expect(rhythmView("daily", "monthly", "Sam").agreed).toBe("weekly");
    expect(rhythmView("weekly", "monthly", "Sam").agreed).toBe("biweekly");
    expect(rhythmView("daily", "weekly", "Sam").agreed).toBe("twice_weekly");
  });

  it("waits for the partner when they have not picked", () => {
    const view = rhythmView("weekly", null, "Sam");
    expect(view.agreed).toBeNull();
    expect(view.agreedLabel).toBeNull();
    expect(view.partnerLabel).toBeNull();
    expect(view.explanation).toBe("Once Sam picks, Spark finds the middle.");
  });

  it("explains same picks, even splits and uneven splits differently", () => {
    expect(rhythmExplanation("weekly", "weekly", "Sam")).toMatch(/same rhythm/);
    expect(rhythmExplanation("daily", "monthly", "Sam")).toMatch(/^Right halfway/);
    // Not reachable with today's three pickable options, but the domain supports it.
    expect(rhythmExplanation("daily", "biweekly", "Sam")).toMatch(/uneven, so Spark leaned toward more space/);
  });

  it("previews the shared rhythm for each option", () => {
    expect(previewAgreed("daily", "monthly")).toBe("weekly");
    expect(previewAgreed("monthly", "monthly")).toBe("monthly");
    expect(previewAgreed("daily", null)).toBeNull();
  });

  it("writes a plain toast after saving", () => {
    expect(cadenceSavedMessage("daily", "monthly")).toBe("Saved. Your shared rhythm is every week.");
    expect(cadenceSavedMessage("daily", null)).toBe("Saved your pick.");
  });
});

describe("ladder markers", () => {
  it("has five rungs from most to least often", () => {
    const steps = ladderSteps("weekly", "monthly", "biweekly", "Sam");
    expect(steps.map((s) => s.cadence)).toEqual([...CADENCE_LADDER]);
    expect(steps.map((s) => s.label)).toEqual(CADENCE_LADDER.map((c) => CADENCE_LABELS[c]));
  });

  it("marks exactly one rung each for my pick, their pick and the result", () => {
    for (const a of PICKABLE_CADENCES) {
      for (const b of PICKABLE_CADENCES) {
        const view = rhythmView(a, b, "Sam");
        expect(view.steps.filter((s) => s.mine).map((s) => s.cadence)).toEqual([a]);
        expect(view.steps.filter((s) => s.partner).map((s) => s.cadence)).toEqual([b]);
        expect(view.steps.filter((s) => s.agreed).map((s) => s.cadence)).toEqual([view.agreed]);
      }
    }
  });

  it("describes every marked rung in text for screen readers", () => {
    const steps = ladderSteps("weekly", "monthly", "biweekly", "Sam");
    const byCadence = Object.fromEntries(steps.map((s) => [s.cadence, s.srText]));
    expect(byCadence.weekly).toBe("Every week: your pick");
    expect(byCadence.monthly).toBe("Every month: Sam's pick");
    expect(byCadence.biweekly).toBe("Every two weeks: your shared rhythm");
    expect(byCadence.daily).toBe("Every day");
  });

  it("combines markers when both picked the same rung", () => {
    const steps = ladderSteps("monthly", "monthly", "monthly", "Sam");
    expect(steps.find((s) => s.cadence === "monthly")!.srText).toBe("Every month: your pick and Sam's pick, your shared rhythm");
  });

  it("marks no result before both have picked", () => {
    expect(ladderSteps("daily", null, null, "Sam").some((s) => s.agreed)).toBe(false);
  });
});

describe("quarterly revisit", () => {
  const today = new Date(2026, 9, 6, 12, 0, 0); // Oct 6, 2026

  it("is not due 40 days after a review and names the next date (review + 90 days)", () => {
    const reviewed = addDays(today, -40);
    reviewed.setHours(19, 15);
    const info = revisitInfo(reviewed.toISOString(), today);
    expect(info.due).toBe(false);
    expect(toISODate(info.nextDate!)).toBe(toISODate(addDays(today, 50)));
    expect(info.daysUntil).toBe(50);
    expect(info.nextLabel).toBe("November 25, 2026");
  });

  it("is due at 90 days and after", () => {
    expect(revisitInfo(addDays(today, -90).toISOString(), today).due).toBe(true);
    expect(revisitInfo(addDays(today, -200).toISOString(), today).due).toBe(true);
    expect(revisitInfo(addDays(today, -89).toISOString(), today).due).toBe(false);
  });

  it("handles a missing or broken timestamp without crashing", () => {
    expect(revisitInfo(null, today)).toEqual({ due: false, nextDate: null, nextLabel: null, daysUntil: null });
    expect(revisitInfo("not a date", today).due).toBe(false);
    expect(nextRevisitDate("not a date")).toBeNull();
  });

  it("formats long dates", () => {
    expect(formatLongDate(new Date(2027, 0, 4))).toBe("January 4, 2027");
  });
});

describe("social agreement view", () => {
  it("always shows the MORE private choice as the agreement, for every pair", () => {
    for (const mine of SOCIAL_LEVELS) {
      for (const partner of SOCIAL_LEVELS) {
        const view = socialView(mine, partner, "Sam");
        const expected = SOCIAL_LEVELS[Math.min(SOCIAL_LEVELS.indexOf(mine), SOCIAL_LEVELS.indexOf(partner))]!;
        expect(view.state).toBe("agreed");
        expect(view.agreed).toBe(expected);
        expect(view.agreed).toBe(morePrivate(mine, partner));
        expect(view.agreedLabel).toBe(SOCIAL_COPY[expected].label);
        // The agreement is never more public than either partner's choice.
        expect(SOCIAL_LEVELS.indexOf(view.agreed!)).toBeLessThanOrEqual(SOCIAL_LEVELS.indexOf(mine));
        expect(SOCIAL_LEVELS.indexOf(view.agreed!)).toBeLessThanOrEqual(SOCIAL_LEVELS.indexOf(partner));
        // The highlighted tile is exactly the choice(s) equal to the agreement.
        expect(view.sides[0].isAgreement).toBe(mine === expected);
        expect(view.sides[1].isAgreement).toBe(partner === expected);
        expect(view.usedMorePrivate).toBe(mine !== partner);
      }
    }
  });

  it("uses Sam's status-only choice for the demo couple (milestones vs status only)", () => {
    const view = socialView("milestones", "status_only", "Sam");
    expect(view.agreed).toBe("status_only");
    expect(view.sides[0]).toMatchObject({ heading: "Your choice", label: "Big milestones", isAgreement: false });
    expect(view.sides[1]).toMatchObject({ heading: "Sam's choice", label: "Relationship status only", isAgreement: true });
    expect(view.statusBody).toMatch(/more private/);
  });

  it("shows both choices with labels and details side by side", () => {
    const view = socialView("open", "private", "Sam");
    expect(view.sides[0].detail).toBe(SOCIAL_COPY.open.detail);
    expect(view.sides[1].detail).toBe(SOCIAL_COPY.private.detail);
  });

  it("waits for the partner when only I picked", () => {
    const view = socialView("open", null, "Sam");
    expect(view.state).toBe("waiting_partner");
    expect(view.agreed).toBeNull();
    expect(view.statusTitle).toBe("Waiting for Sam to choose");
    expect(view.sides.some((s) => s.isAgreement)).toBe(false);
  });

  it("asks me to pick when only the partner picked, or neither did", () => {
    expect(socialView(null, "open", "Sam")).toMatchObject({ state: "needs_mine", statusTitle: "Pick yours", agreed: null });
    expect(socialView(null, null, "Sam")).toMatchObject({ state: "needs_both", statusTitle: "Pick yours", agreed: null });
  });

  it("states the more-private rule plainly", () => {
    expect(SOCIAL_RULE).toBe("Spark always goes with the more private choice. Nobody gets pushed to share more than they want.");
  });

  it("writes a plain toast after saving", () => {
    expect(socialSavedMessage("open", "status_only")).toBe('Saved. Your agreement is "Relationship status only".');
    expect(socialSavedMessage("open", null)).toBe("Saved your choice.");
  });
});

describe("copy rules", () => {
  it("never uses em dashes or blaming words in generated copy", () => {
    const texts: string[] = [SOCIAL_RULE];
    for (const a of [null, ...PICKABLE_CADENCES]) {
      for (const b of [null, ...PICKABLE_CADENCES]) {
        const v = rhythmView(a, b, "Sam");
        texts.push(v.explanation, ...v.steps.map((s) => s.srText));
      }
    }
    for (const a of [null, ...SOCIAL_LEVELS]) {
      for (const b of [null, ...SOCIAL_LEVELS]) {
        const v = socialView(a, b, "Sam");
        texts.push(v.statusTitle, v.statusBody);
      }
    }
    for (const t of texts) {
      expect(t).not.toContain(EM_DASH);
      expect(t).not.toMatch(/\b(fault|blame|should have|failed)\b/i);
    }
  });
});
