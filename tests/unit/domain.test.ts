import { ageOn, isAdult, periodOf, previousPeriod, upcomingAnniversaries, weekStartOf } from "@/lib/domain/dates";
import { socialAgreement, SOCIAL_LEVELS } from "@/lib/domain/social";
import { ACCENTS, ACCENT_ORDER, BASE, contrastRatio, themeCss } from "@/lib/domain/themes";
import { mentionsCrisis } from "@shared/crisis.ts";
import { normalizeCheckinAnswers } from "@shared/checkin-questions.ts";
import { findQuestion, SECTIONS, sectionProgress, validateAnswer } from "@shared/questionnaires.ts";
import { checkUpload, normalizeLink } from "@/lib/media-rules";

describe("dates", () => {
  it("finds the Monday of the week", () => {
    expect(weekStartOf(new Date(2026, 9, 6))).toBe("2026-10-05");
    expect(weekStartOf(new Date(2026, 9, 11))).toBe("2026-10-05"); // Sunday
    expect(weekStartOf(new Date(2026, 9, 12))).toBe("2026-10-12");
  });
  it("handles month periods across the year boundary", () => {
    expect(periodOf(new Date(2026, 0, 3))).toBe("2026-01");
    expect(previousPeriod("2026-01")).toBe("2025-12");
  });
  it("computes adulthood on the exact birthday", () => {
    expect(ageOn("2008-10-06", new Date(2026, 9, 6))).toBe(18);
    expect(isAdult("2008-10-07", new Date(2026, 9, 6))).toBe(false);
  });
  it("lists yearly reminders within the window, nearest first", () => {
    const entries = [
      { id: "a", title: "Together", happenedOn: "2024-10-18", remindYearly: true },
      { id: "b", title: "First date", happenedOn: "2024-10-08", remindYearly: true },
      { id: "c", title: "No reminder", happenedOn: "2024-10-09", remindYearly: false },
      { id: "d", title: "Far away", happenedOn: "2024-03-01", remindYearly: true },
    ];
    const up = upcomingAnniversaries(entries, new Date(2026, 9, 6), 30);
    expect(up.map((u) => u.entry.id)).toEqual(["b", "a"]);
    expect(up[0]).toMatchObject({ inDays: 2, years: 2, date: "2026-10-08" });
  });
  it("moves Feb 29 to Feb 28 in non-leap years and skips the first year", () => {
    const up = upcomingAnniversaries([{ id: "x", title: "Leap", happenedOn: "2024-02-29", remindYearly: true }], new Date(2027, 1, 20), 30);
    expect(up[0]?.date).toBe("2027-02-28");
    expect(upcomingAnniversaries([{ id: "y", title: "New", happenedOn: "2026-10-10", remindYearly: true }], new Date(2026, 9, 6), 30)).toEqual([]);
  });
});

describe("social sharing agreement", () => {
  it("is pending until both pick", () => {
    expect(socialAgreement("open", null).agreed).toBeNull();
  });
  it("always uses the more private choice", () => {
    expect(socialAgreement("open", "private")).toMatchObject({ agreed: "private", usedMorePrivate: true });
    expect(socialAgreement("milestones", "status_only").agreed).toBe("status_only");
    for (const a of SOCIAL_LEVELS) for (const b of SOCIAL_LEVELS) {
      const agreed = socialAgreement(a, b).agreed!;
      expect(SOCIAL_LEVELS.indexOf(agreed)).toBe(Math.min(SOCIAL_LEVELS.indexOf(a), SOCIAL_LEVELS.indexOf(b)));
    }
  });
});

describe("theme contrast (WCAG AA)", () => {
  for (const mode of ["light", "dark"] as const) {
    const base = BASE[mode];
    it(`${mode}: body and muted text pass 4.5:1`, () => {
      for (const bg of [base.bg, base.surface, base.surface2]) {
        expect(contrastRatio(base.ink, bg)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(base.muted, bg)).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrastRatio(base.danger, base.surface)).toBeGreaterThanOrEqual(4.5);
    });
    for (const key of ACCENT_ORDER) {
      it(`${mode} ${key}: buttons, accent text and tinted surfaces pass`, () => {
        const a = ACCENTS[key][mode];
        expect(contrastRatio(a.accentInk, a.accent)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(a.accentText, base.bg)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(a.accentText, base.surface)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(base.ink, a.accentSoft)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(a.accentText, a.accentSoft)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(a.accent, base.bg)).toBeGreaterThanOrEqual(3);
        expect(contrastRatio(a.deco, base.bg)).toBeGreaterThanOrEqual(3);
      });
    }
  }
  it("renders CSS for every accent in both modes", () => {
    const css = themeCss();
    for (const key of ACCENT_ORDER) expect(css).toContain(`[data-accent="${key}"]`);
    expect(css).toContain('[data-mode="dark"]');
    expect(css).toContain("prefers-color-scheme: dark");
  });
});

describe("crisis detection", () => {
  it("flags danger, abuse and self-harm language", () => {
    for (const t of ["sometimes I want to die", "he hits me when he's drunk", "I've been thinking about suicide", "I feel unsafe at home", "they threatened to leave me stranded", "he said he is going to kill me", "I keep thinking about killing myself"]) {
      expect(mentionsCrisis(t)).toBe(true);
    }
  });
  it("leaves ordinary relationship talk alone", () => {
    for (const t of ["We argued about dishes", "I miss our Sunday mornings", "Work has been killing me lately"]) {
      expect(mentionsCrisis(t)).toBe(false);
    }
  });
});

describe("questionnaires", () => {
  it("has 5 to 8 questions per sitting and unique question ids", () => {
    const ids = new Set<string>();
    for (const section of SECTIONS) {
      for (const sitting of section.sittings) {
        expect(sitting.questions.length).toBeGreaterThanOrEqual(5);
        expect(sitting.questions.length).toBeLessThanOrEqual(8);
        for (const q of sitting.questions) {
          expect(ids.has(q.id)).toBe(false);
          expect(q.id).toMatch(/^[a-z0-9_]{2,60}$/);
          ids.add(q.id);
        }
      }
      expect(section.key).toMatch(/^[a-z_]{2,40}$/);
    }
  });
  it("covers the four Phase 1 sections", () => {
    expect(SECTIONS.map((s) => s.key)).toEqual(["beginnings", "closeness_trust", "attachment", "direction"]);
  });
  it("validates answers by question type", () => {
    expect(validateAnswer(findQuestion("trust_level")!.question, 4)).toBe(4);
    expect(() => validateAnswer(findQuestion("trust_level")!.question, 7)).toThrow();
    expect(validateAnswer(findQuestion("trust_helps")!.question, ["honesty", "honesty"])).toEqual(["honesty"]);
    expect(() => validateAnswer(findQuestion("trust_helps")!.question, ["made_up"])).toThrow();
    expect(() => validateAnswer(findQuestion("long_term")!.question, "forever")).toThrow();
    expect(() => validateAnswer(findQuestion("what_attracted_you")!.question, "   ")).toThrow();
  });
  it("tracks progress and the next unfinished sitting", () => {
    const section = SECTIONS[0]!;
    const firstSitting = Object.fromEntries(section.sittings[0]!.questions.map((q) => [q.id, { skipped: false }]));
    const p = sectionProgress(section, firstSitting);
    expect(p.done).toBe(false);
    expect(p.nextSittingIndex).toBe(1);
    expect(p.answered).toBe(section.sittings[0]!.questions.length);
  });
});

describe("check-in answers", () => {
  it("normalizes, rejects unknown keys and all-empty submissions", () => {
    expect(normalizeCheckinAnswers({ best: " Hike ", closest: "", distant: "", more_of: "", talk_about: "" }).best).toBe("Hike");
    expect(() => normalizeCheckinAnswers({ best: "", closest: "" })).toThrow(/at least one/);
    expect(() => normalizeCheckinAnswers({ best: "x", hacked: "y" })).toThrow(/Unknown/);
    expect(() => normalizeCheckinAnswers({ best: "x".repeat(1001) })).toThrow(/too long/);
  });
});

describe("media rules", () => {
  it("accepts photos and short clips, rejects others and oversize files", () => {
    expect(checkUpload({ size: 1000, type: "image/jpeg" })).toBeNull();
    expect(checkUpload({ size: 1000, type: "video/mp4" })).toBeNull();
    expect(checkUpload({ size: 1000, type: "video/mp4" }, "photo")).toMatch(/photo/);
    expect(checkUpload({ size: 1000, type: "application/pdf" })).toMatch(/isn't supported/);
    expect(checkUpload({ size: 60 * 1024 * 1024, type: "image/png" })).toMatch(/50 MB/);
  });
  it("normalizes links to https and rejects junk", () => {
    expect(normalizeLink("tiktok.com/@x/video/1")).toBe("https://tiktok.com/@x/video/1");
    expect(normalizeLink("http://example.com/a")).toBe("https://example.com/a");
    expect(normalizeLink("javascript:alert(1)")).toBeNull();
    expect(normalizeLink("not a link")).toBeNull();
  });
});
