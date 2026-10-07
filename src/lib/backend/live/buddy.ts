import { isShareLevel, MESSAGE_MAX } from "@shared/buddy.ts";
import { findQuestion } from "@shared/questionnaires.ts";
import { UserFacingError, type Backend, type BuddySendResult, type BuddyShare, type BuddyTurn } from "../types";
import { invoke, requireUserId } from "./client";

/**
 * Spark Buddy goes entirely through the "buddy" Edge Function. It is the only
 * place that can open the partner's opt-in shares (sealed under the couple key),
 * so the partner's hints and open answers never reach this browser: only Buddy's
 * reply does. Conversations are stored encrypted and readable only by their owner.
 */

function knownQuestion(questionId: string) {
  if (!findQuestion(questionId)) throw new UserFacingError("That question doesn't exist.");
}

export const buddy: Backend["buddy"] = {
  async history() {
    await requireUserId();
    const { turns } = await invoke<{ turns: BuddyTurn[] }>("buddy", { action: "history" });
    return turns ?? [];
  },
  async send(input) {
    await requireUserId();
    const text = (input.text ?? "").trim();
    if (!text) throw new UserFacingError("Say something first.");
    if (Array.from(text).length > MESSAGE_MAX) throw new UserFacingError("That's a lot at once. Try a shorter message.");
    return invoke<BuddySendResult>("buddy", { action: "send", text, interviewQuestionId: input.interviewQuestionId, context: input.context, aiConsent: input.aiConsent === true });
  },
  async shares() {
    await requireUserId();
    const { shares } = await invoke<{ shares: BuddyShare[] }>("buddy", { action: "shares" });
    return shares ?? [];
  },
  async share(questionId, level, hint) {
    await requireUserId();
    knownQuestion(questionId);
    if (!isShareLevel(level)) throw new UserFacingError("Pick off the table, hint, or open.");
    const { share } = await invoke<{ share: BuddyShare | null }>("buddy", { action: "share", questionId, level, hint: hint ?? null });
    return share;
  },
  async draftHint(questionId, aiConsent = false) {
    await requireUserId();
    knownQuestion(questionId);
    return invoke<{ hint: string; source: "claude" | "fallback" }>("buddy", { action: "draft_hint", questionId, aiConsent: aiConsent === true });
  },
  async clear() {
    await requireUserId();
    await invoke<{ ok: true }>("buddy", { action: "clear" });
  },
};
