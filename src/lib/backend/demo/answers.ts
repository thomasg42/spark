import { findQuestion, findSection, validateAnswer, type AnswerValue } from "@shared/questionnaires.ts";
import { UserFacingError, type Backend, type SavedAnswer } from "../types";
import { demoStore, me, nowIso, tick } from "./store";

/**
 * Demo private answers: kept per user in this browser only (sample data, never
 * sent anywhere). Enforces the same rule as the database: every call reads and
 * writes ONLY the acting persona's own answers. The partner's are never returned.
 */

const copyValue = (v: AnswerValue | null): AnswerValue | null => (Array.isArray(v) ? [...v] : v);
const copy = (a: SavedAnswer): SavedAnswer => ({ ...a, value: copyValue(a.value) });

function known(questionId: string) {
  const found = findQuestion(questionId);
  if (!found) throw new UserFacingError("That question doesn't exist.");
  return found;
}

function upsert(userId: string, answer: SavedAnswer): SavedAnswer {
  return demoStore.update((s) => {
    const list = (s.answers[userId] ??= []);
    const index = list.findIndex((a) => a.questionId === answer.questionId);
    if (index >= 0) list[index] = answer;
    else list.push(answer);
    return copy(answer);
  });
}

export const answers: Backend["answers"] = {
  async list(section) {
    await tick(80);
    const uid = me();
    if (section && !findSection(section)) throw new UserFacingError("That set of questions doesn't exist.");
    const mine = demoStore.get().answers[uid] ?? [];
    return mine.filter((a) => !section || a.section === section).map(copy);
  },
  async save(questionId, value) {
    await tick();
    const uid = me();
    const { section, question } = known(questionId);
    let normalized: AnswerValue;
    try {
      normalized = validateAnswer(question, value);
    } catch (error) {
      throw new UserFacingError(error instanceof Error ? error.message : "That answer doesn't look right.");
    }
    return upsert(uid, { questionId, section: section.key, value: copyValue(normalized), skipped: false, updatedAt: nowIso() });
  },
  async skip(questionId) {
    await tick();
    const uid = me();
    const { section } = known(questionId);
    return upsert(uid, { questionId, section: section.key, value: null, skipped: true, updatedAt: nowIso() });
  },
  async clear(questionId) {
    await tick();
    const uid = me();
    demoStore.update((s) => {
      const list = s.answers[uid];
      if (list) s.answers[uid] = list.filter((a) => a.questionId !== questionId);
    });
  },
};
