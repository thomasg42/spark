import type { SavedAnswer } from "@/lib/backend/types";
import {
  answersMentionCrisis,
  draftMentionsCrisis,
  draftToValue,
  emptyMessage,
  formatAnswer,
  initialDraft,
  isUnchanged,
  nextInSitting,
  nextUnfinishedSitting,
  resumePosition,
  toSavedMap,
} from "@/components/questions/flow";
import { findQuestion, findSection, SECTIONS, type Question, type Section } from "@shared/questionnaires.ts";

const beginnings = findSection("beginnings") as Section;
const q = (id: string) => findQuestion(id)!.question as Question;
const ans = (questionId: string, value: SavedAnswer["value"], skipped = false): SavedAnswer => ({
  questionId,
  section: findQuestion(questionId)!.section.key,
  value,
  skipped,
  updatedAt: "2026-10-06T00:00:00.000Z",
});
const sittingIds = (section: Section, index: number) => section.sittings[index]!.questions.map((x) => x.id);

describe("question bank fits the database and the spec", () => {
  it("every id matches the private_answers CHECK constraints and is unique", () => {
    const ids = new Set<string>();
    for (const section of SECTIONS) {
      expect(section.key).toMatch(/^[a-z_]{2,40}$/);
      for (const sitting of section.sittings) {
        for (const question of sitting.questions) {
          expect(question.id).toMatch(/^[a-z0-9_]{2,60}$/);
          expect(ids.has(question.id)).toBe(false);
          ids.add(question.id);
        }
      }
    }
  });

  it("each Phase 1 sitting is short: 5 to 8 questions", () => {
    for (const section of SECTIONS) {
      expect(section.phase).toBe(1);
      for (const sitting of section.sittings) {
        expect(sitting.questions.length).toBeGreaterThanOrEqual(5);
        expect(sitting.questions.length).toBeLessThanOrEqual(8);
      }
    }
  });
});

describe("resume and next", () => {
  it("starts at the very first question when nothing is saved", () => {
    expect(resumePosition(beginnings, {})).toEqual({ sitting: 0, question: 0 });
  });

  it("resumes at the first unanswered question of the first unfinished sitting (skips count as done)", () => {
    const saved = toSavedMap([ans("how_we_met_mine", "Trivia"), ans("what_attracted_you", null, true)]);
    expect(resumePosition(beginnings, saved)).toEqual({ sitting: 0, question: 2 });
  });

  it("moves to the next sitting once the first is finished, and returns null when all done", () => {
    const first = toSavedMap(sittingIds(beginnings, 0).map((id) => ans(id, null, true)));
    expect(resumePosition(beginnings, first)).toEqual({ sitting: 1, question: 0 });
    expect(nextUnfinishedSitting(beginnings, first)).toBe(1);
    const all = toSavedMap([...sittingIds(beginnings, 0), ...sittingIds(beginnings, 1)].map((id) => ans(id, null, true)));
    expect(resumePosition(beginnings, all)).toBeNull();
    expect(nextUnfinishedSitting(beginnings, all)).toBeNull();
  });

  it("goes to the next unanswered question later in the sitting, then wraps to earlier gaps, then finishes", () => {
    const ids = sittingIds(beginnings, 0);
    const saved = toSavedMap([ans(ids[0]!, "a"), ans(ids[2]!, "c")]);
    expect(nextInSitting(beginnings, saved, { sitting: 0, question: 0 })).toEqual({ sitting: 0, question: 1 });
    expect(nextInSitting(beginnings, saved, { sitting: 0, question: 1 })).toEqual({ sitting: 0, question: 3 });
    const late = toSavedMap(ids.slice(2).map((id) => ans(id, "x")));
    expect(nextInSitting(beginnings, late, { sitting: 0, question: 4 })).toEqual({ sitting: 0, question: 0 });
    const full = toSavedMap(ids.map((id) => ans(id, "x")));
    expect(nextInSitting(beginnings, full, { sitting: 0, question: 4 })).toBeNull();
  });
});

describe("drafts", () => {
  it("prefills from saved answers and stays empty for skipped ones", () => {
    expect(initialDraft(q("what_attracted_you"), ans("what_attracted_you", "Kindness"))).toBe("Kindness");
    expect(initialDraft(q("what_attracted_you"), ans("what_attracted_you", null, true))).toBe("");
    expect(initialDraft(q("met_through"))).toBeNull();
    expect(initialDraft(q("trust_helps"), ans("trust_helps", ["honesty"]))).toEqual(["honesty"]);
    expect(initialDraft(q("trust_level"), ans("trust_level", 4))).toBe(4);
    expect(initialDraft(q("trust_level"))).toBeNull();
  });

  it("turns drafts into values, or null when still empty", () => {
    expect(draftToValue(q("what_attracted_you"), "  hi  ")).toBe("hi");
    expect(draftToValue(q("what_attracted_you"), "   ")).toBeNull();
    expect(draftToValue(q("met_through"), null)).toBeNull();
    expect(draftToValue(q("met_through"), "work")).toBe("work");
    expect(draftToValue(q("trust_helps"), [])).toBeNull();
    expect(draftToValue(q("trust_level"), 3)).toBe(3);
    expect(emptyMessage(q("trust_level"))).toMatch(/Skip/);
  });

  it("knows when nothing changed (multi answers ignore order)", () => {
    expect(isUnchanged(q("trust_helps"), ["plans_shared", "honesty"], ans("trust_helps", ["honesty", "plans_shared"]))).toBe(true);
    expect(isUnchanged(q("trust_helps"), ["honesty"], ans("trust_helps", ["honesty", "plans_shared"]))).toBe(false);
    expect(isUnchanged(q("what_attracted_you"), "Kindness ", ans("what_attracted_you", "Kindness"))).toBe(true);
    expect(isUnchanged(q("what_attracted_you"), "", ans("what_attracted_you", null, true))).toBe(false);
    expect(isUnchanged(q("trust_level"), 3, undefined)).toBe(false);
  });
});

describe("display and safety", () => {
  it("formats answers in plain words", () => {
    expect(formatAnswer(q("met_through"), "online")).toBe("Online or an app");
    expect(formatAnswer(q("reassurance_style"), ["words", "touch"])).toBe("Words, Touch");
    expect(formatAnswer(q("trust_level"), 5)).toBe("5 of 5 (Rock solid)");
    expect(formatAnswer(q("trust_level"), 3)).toBe("3 of 5");
    expect(formatAnswer(q("what_attracted_you"), null)).toBe("");
  });

  it("flags crisis language in free text only", () => {
    expect(draftMentionsCrisis(q("trust_hurts"), "Sometimes I feel unsafe at home.")).toBe(true);
    expect(draftMentionsCrisis(q("trust_hurts"), "When plans change last minute.")).toBe(false);
    expect(draftMentionsCrisis(q("met_through"), "work")).toBe(false);
    expect(answersMentionCrisis([ans("trust_hurts", "They hit me when angry.")])).toBe(true);
    expect(answersMentionCrisis([ans("met_through", "work"), ans("trust_level", 2)])).toBe(false);
  });
});
