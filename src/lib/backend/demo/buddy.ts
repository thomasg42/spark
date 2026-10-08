import { fallbackHint, fallbackReply, isShareLevel, MESSAGE_MAX, sanitizeClientContext, sharedTextFor, type BuddyShare, type BuddyTurn, type PartnerShare } from "@shared/buddy.ts";
import { findQuestion } from "@shared/questionnaires.ts";
import { UserFacingError, type Backend } from "../types";
import { demoStore, me, myCouple, nowIso, partnerOf, tick } from "./store";

/**
 * Demo Spark Buddy (in this browser only, no AI). Same rules as the live Edge
 * Function: the partner's Buddy only ever gets the partner's hint/open shares,
 * each person's conversation is theirs alone, and an off-the-table answer has
 * no share at all. Replies come from the built-in rule-based Buddy.
 */

export const DEMO_NOTICE = "Demo mode: Buddy uses its built-in guide here. The live app uses Claude for smarter, more personal replies.";

const copyShare = (x: BuddyShare): BuddyShare => ({ ...x });
const copyTurn = (t: BuddyTurn): BuddyTurn => ({ ...t, meta: t.meta ? { ...t.meta } : null });

function ownAnswer(userId: string, questionId: string) {
  const a = (demoStore.get().answers[userId] ?? []).find((x) => x.questionId === questionId);
  return a && !a.skipped && a.value !== null ? a.value : null;
}

/** The partner's shares as the acting persona's Buddy may see them. */
export function partnerSharesFor(userId: string): PartnerShare[] {
  const partner = partnerOf(userId);
  if (!partner) return [];
  return (demoStore.get().buddyShares[partner] ?? [])
    .filter((x) => x.level === "hint" || x.level === "open")
    .map((x) => ({ questionId: x.questionId, level: x.level, text: x.text }));
}

export const buddy: Backend["buddy"] = {
  async history() {
    await tick(60);
    const uid = me();
    myCouple();
    return (demoStore.get().buddyChats[uid] ?? []).map(copyTurn);
  },

  async send(input) {
    await tick(250);
    const uid = me();
    myCouple();
    const text = (input.text ?? "").trim();
    if (!text) throw new UserFacingError("Say something first.");
    if (Array.from(text).length > MESSAGE_MAX) throw new UserFacingError("That's a lot at once. Try a shorter message.");
    let interviewQuestionId: string | null = null;
    if (input.interviewQuestionId) {
      if (!findQuestion(input.interviewQuestionId)) throw new UserFacingError("That question doesn't exist.");
      interviewQuestionId = input.interviewQuestionId;
    }
    const history = (demoStore.get().buddyChats[uid] ?? []).slice(-12).map(copyTurn);
    const reply = fallbackReply({ text, interviewQuestionId, context: sanitizeClientContext(input.context), partnerShares: partnerSharesFor(uid), history });
    demoStore.update((s) => {
      const chat = (s.buddyChats[uid] ??= []);
      chat.push({ role: "user", text, at: nowIso(), meta: null }, { role: "buddy", text: reply.reply, at: nowIso(), meta: reply.meta });
      if (chat.length > 200) chat.splice(0, chat.length - 200);
    });
    return { reply, notice: DEMO_NOTICE };
  },

  async shares() {
    await tick(60);
    const uid = me();
    myCouple();
    return (demoStore.get().buddyShares[uid] ?? []).map(copyShare);
  },

  async share(questionId, level, hint) {
    await tick();
    const uid = me();
    myCouple();
    const found = findQuestion(questionId);
    if (!found) throw new UserFacingError("That question doesn't exist.");
    if (!isShareLevel(level)) throw new UserFacingError("Pick off the table, hint, or open.");
    if (level === "private") {
      demoStore.update((s) => {
        s.buddyShares[uid] = (s.buddyShares[uid] ?? []).filter((x) => x.questionId !== questionId);
      });
      return null;
    }
    const value = ownAnswer(uid, questionId);
    if (value === null) throw new UserFacingError("Answer this question first, then choose what Buddy may share.");
    let text: string;
    try {
      text = sharedTextFor(level, found.question, value, hint);
    } catch (error) {
      throw new UserFacingError(error instanceof Error ? error.message : "That hint doesn't look right.");
    }
    const share: BuddyShare = { questionId, level, text, updatedAt: nowIso() };
    demoStore.update((s) => {
      const list = (s.buddyShares[uid] ??= []);
      const i = list.findIndex((x) => x.questionId === questionId);
      if (i >= 0) list[i] = share;
      else list.push(share);
    });
    return copyShare(share);
  },

  async draftHint(questionId) {
    await tick();
    const uid = me();
    myCouple();
    if (!findQuestion(questionId)) throw new UserFacingError("That question doesn't exist.");
    const value = ownAnswer(uid, questionId);
    if (value === null) throw new UserFacingError("Answer this question first.");
    return { hint: fallbackHint(questionId, value), source: "fallback" as const };
  },

  /** The demo has no server: Buddy talks with this device's own voice. */
  async speak() {
    return { audio: null, reason: "off" as const };
  },

  async clear() {
    await tick(60);
    const uid = me();
    demoStore.update((s) => {
      s.buddyChats[uid] = [];
    });
  },
};
