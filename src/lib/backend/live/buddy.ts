import { isShareLevel, MESSAGE_MAX, SPEAK_CHUNK_MAX } from "@shared/buddy.ts";
import { findQuestion } from "@shared/questionnaires.ts";
import { UserFacingError, type Backend, type BuddySendResult, type BuddyShare, type BuddyTurn, type PartnerShare, type ShareTeaser, type StudioVoiceResult } from "../types";
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
  async share(questionId, level, hint, showWhen = null) {
    await requireUserId();
    knownQuestion(questionId);
    if (!isShareLevel(level)) throw new UserFacingError("Pick off the table, hint, or open.");
    const { share } = await invoke<{ share: BuddyShare | null }>("buddy", { action: "share", questionId, level, hint: hint ?? null, showWhen: level === "hint" ? showWhen : null });
    return share;
  },
  async partnerHints() {
    await requireUserId();
    const { shares, teasers } = await invoke<{ shares: PartnerShare[]; teasers: ShareTeaser[] }>("buddy", { action: "partner_hints" });
    return { shares: shares ?? [], teasers: teasers ?? [] };
  },
  async draftHint(questionId, aiConsent = false) {
    await requireUserId();
    knownQuestion(questionId);
    return invoke<{ hint: string; source: "claude" | "fallback" }>("buddy", { action: "draft_hint", questionId, aiConsent: aiConsent === true });
  },
  async speak(text, aiConsent, mood = "lively") {
    // The studio voice sends Buddy's words to the voice provider, so it needs the same consent as AI replies.
    if (!aiConsent) return { audio: null, reason: "consent" };
    const clean = (text ?? "").trim();
    if (!clean) return { audio: null, reason: "failed" };
    try {
      const { audio, mime, reason } = await invoke<{ audio: string | null; mime?: string; reason?: StudioVoiceResult["reason"] }>("buddy", {
        action: "speak",
        text: clean.slice(0, SPEAK_CHUNK_MAX),
        aiConsent: true,
        mood,
      });
      if (!audio) return { audio: null, reason: reason ?? "failed" };
      const bytes = Uint8Array.from(atob(audio), (c) => c.charCodeAt(0));
      return { audio: new Blob([bytes], { type: mime || "audio/mpeg" }), reason: null };
    } catch {
      return { audio: null, reason: "failed" }; // any failure falls back to the device voice
    }
  },

  async clear() {
    await requireUserId();
    await invoke<{ ok: true }>("buddy", { action: "clear" });
  },
};
