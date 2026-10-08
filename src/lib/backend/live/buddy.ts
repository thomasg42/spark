import { buddySession, setBuddySession, clearBuddySessions, waitBuddySession, withBuddyTurn } from "@/lib/buddy/session";
import type { SavedConversation, ConversationSummary } from "@shared/buddy-conversations.ts";
import { dreams } from "./shared-dreams";
import { isShareLevel, MESSAGE_MAX, SPEAK_CHUNK_MAX } from "@shared/buddy.ts";
import { findQuestion } from "@shared/questionnaires.ts";
import { UserFacingError, type Backend, type BuddySendResult, type BuddyShare, type BuddyTurn, type PartnerShare, type ShareTeaser, type StudioVoiceResult } from "../types";
import { invoke, requireUserId } from "./client";

/**
 * Spark Buddy goes entirely through the "buddy" Edge Function. It is the only
 * place that can open the partner's opt-in shares (sealed under the couple key),
 * so the partner's hints and open answers never reach this browser: only Buddy's
 * reply does. Active conversations stay in document memory; only explicit saves
 * are stored encrypted and readable by their owner.
 */

function knownQuestion(questionId: string) {
  if (!findQuestion(questionId)) throw new UserFacingError("That question doesn't exist.");
}

export const buddy: Backend["buddy"] = {
  async history() {
    const uid=await requireUserId();
    await waitBuddySession(`live:${uid}`);
    return structuredClone(buddySession(`live:${uid}`).turns);
  },
  async send(input) {
    const uid = await requireUserId();
    const sessionId=buddySession(`live:${uid}`).id;
    return withBuddyTurn(`live:${uid}`, async()=>{
    const text = (input.text ?? "").trim();
    if (!text) throw new UserFacingError("Say something first.");
    if (Array.from(text).length > MESSAGE_MAX) throw new UserFacingError("That's a lot at once. Try a shorter message.");
    const anchor = (await dreams.list()).items.find(x => x.kind === "anchors" && x.ownerId === uid);
    const context = {...input.context, lifeAnchors: anchor?.kind === "anchors" ? anchor.payload : undefined};
    if(await requireUserId()!==uid) throw new UserFacingError("Your session changed. Please try again.");
    const history=input.history ?? buddySession(`live:${uid}`).turns;
    const result=await invoke<BuddySendResult>("buddy", { action: "send", history, text, interviewQuestionId: input.interviewQuestionId, context, aiConsent: input.aiConsent === true });
    if(buddySession(`live:${uid}`).id===sessionId) setBuddySession(`live:${uid}`, [...history,{role:"user",text,at:new Date().toISOString(),meta:null},{role:"buddy",text:result.reply.reply,at:new Date().toISOString(),meta:result.reply.meta}]);
    return result;
    });
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

  async conversations() {return (await invoke<{conversations:ConversationSummary[]}>("buddy",{action:"conversations"})).conversations;},
  async saveConversation(input) {return (await invoke<{conversation:SavedConversation}>("buddy",{action:"save_conversation",...input})).conversation;},
  async openConversation(id) {return (await invoke<{conversation:SavedConversation}>("buddy",{action:"open_conversation",id})).conversation;},
  async clear() {clearBuddySessions(`live:${await requireUserId()}`);},
};
