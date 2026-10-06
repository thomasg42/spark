import { findQuestion, validateAnswer, type AnswerValue } from "@shared/questionnaires.ts";
import { UserFacingError, type Backend, type SavedAnswer } from "../types";
import { invoke, requireUserId } from "./client";

/**
 * Private onboarding answers. Everything goes through the "answers" Edge Function,
 * which encrypts before saving and decrypts only the caller's own rows (RLS is
 * owner-only, so not even a hand-written query can read a partner's answers).
 */

function question(questionId: string) {
  const found = findQuestion(questionId);
  if (!found) throw new UserFacingError("That question doesn't exist.");
  return found.question;
}

export const answers: Backend["answers"] = {
  async list(section) {
    await requireUserId();
    const { answers: list } = await invoke<{ answers: SavedAnswer[] }>("answers", section ? { action: "list", section } : { action: "list" });
    return list ?? [];
  },
  async save(questionId, value) {
    await requireUserId();
    // Same checks as the server, so mistakes show instantly without a round trip.
    let normalized: AnswerValue;
    try {
      normalized = validateAnswer(question(questionId), value);
    } catch (error) {
      if (error instanceof UserFacingError) throw error;
      throw new UserFacingError(error instanceof Error ? error.message : "That answer doesn't look right.");
    }
    const { answer } = await invoke<{ answer: SavedAnswer }>("answers", { action: "save", questionId, value: normalized });
    return answer;
  },
  async skip(questionId) {
    await requireUserId();
    question(questionId);
    const { answer } = await invoke<{ answer: SavedAnswer }>("answers", { action: "skip", questionId });
    return answer;
  },
  async clear(questionId) {
    await requireUserId();
    await invoke<{ ok: true }>("answers", { action: "clear", questionId });
  },
};
