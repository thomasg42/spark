/**
 * "buddy" Edge Function logic (Spark Buddy), kept free of Deno APIs so it is unit
 * tested in Node with an in-memory repo, a real sealer and a fake Claude.
 *
 * Runs with the signed-in user's JWT, so RLS applies to every read and write:
 *   buddy_shares    the owner reads and writes their own; the partner can read only
 *                   rows marked hint or open (off-the-table answers never get a row)
 *   buddy_messages  owner only
 * The repo ALSO filters by user id as a second, independent guard.
 *
 * Encryption:
 *   - Shares are sealed under the COUPLE scope (so the partner's Buddy can open
 *     them) and bound to (owner, question). Only the approved hint or the answer
 *     snapshot the owner saw is ever sealed there, never anything off the table.
 *   - Conversation turns are sealed under the USER scope, bound to the row id.
 *   - Private answers are read (user scope) only to build the caller's own share.
 * Never log messages, answers, hints, ciphertext or keys.
 *
 * Actions (body.action):
 *   history                                   -> { turns }
 *   send   { text, interviewQuestionId?, context, aiConsent } -> { reply, notice }
 *          Claude is called ONLY when aiConsent is true (the person turned AI on).
 *   shares                                    -> { shares }   the caller's own
 *   share  { questionId, level, hint? }       -> { share | null }
 *   unshare { questionId }                    -> { ok }
 *   draft_hint { questionId, aiConsent }      -> { hint, source }  (Claude only with consent)
 *   speak  { text, mood, aiConsent }          -> { audio: base64 mp3 | null }  studio voice (ElevenLabs)
 *          only with aiConsent, metered per person per day; null means "use the device voice"
 *   clear                                     -> { ok }
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  answerToText,
  buildBuddyPrompt,
  BUDDY_SCHEMA,
  cleanHint,
  crisisReply,
  fallbackHint,
  fallbackReply,
  isShareLevel,
  MAX_SPEAK_CHARS_PER_DAY,
  MAX_USER_MESSAGES_PER_DAY,
  SPEAK_CHUNK_MAX,
  MESSAGE_MAX,
  parseBuddyJson,
  sanitizeClientContext,
  sharedTextFor,
  type BuddyMeta,
  type BuddyReply,
  type BuddyShare,
  type BuddyTurn,
  type PartnerShare,
  type SharedLevel,
} from "./buddy.ts";
import { mentionsCrisis } from "./crisis.ts";
import { aad, scopes, type Sealer } from "./crypto.ts";
import { dbError, HttpError, type Handler } from "./http.ts";
import type { JsonGenerator, JsonResult } from "./llm.ts";
import { toBase64, type VoiceRenderer } from "./voice.ts";
import { findQuestion, type AnswerValue } from "./questionnaires.ts";

export interface ShareRow {
  user_id: string;
  question_id: string;
  level: SharedLevel;
  shared_ciphertext: string;
  updated_at: string;
}

export interface MessageRow {
  id: string;
  role: "user" | "buddy";
  body_ciphertext: string;
  created_at: string;
}

export interface BuddyRepo {
  /** The caller's couple and partner, or null when not paired. */
  couple(): Promise<{ coupleId: string; partnerId: string | null } | null>;
  /** Share rows of one member (RLS: own rows, or the partner's hint/open rows). */
  shares(ownerId: string): Promise<ShareRow[]>;
  upsertShare(row: { coupleId: string; questionId: string; level: SharedLevel; ciphertext: string }): Promise<ShareRow>;
  deleteShare(questionId: string): Promise<void>;
  /** The caller's own stored answer for one question, or null when unanswered. */
  ownAnswer(questionId: string): Promise<{ ciphertext: string | null; skipped: boolean } | null>;
  /** The caller's newest turns, returned oldest first. */
  messages(limit: number): Promise<MessageRow[]>;
  insertMessages(rows: Array<{ id: string; coupleId: string; role: "user" | "buddy"; ciphertext: string }>): Promise<void>;
  clearMessages(): Promise<void>;
  userMessagesSince(sinceIso: string): Promise<number>;
  /** Adds to the caller's studio-voice meter for today and returns today's total. */
  chargeVoice(chars: number): Promise<number>;
}

const SHARE_COLUMNS = "user_id, question_id, level, shared_ciphertext, updated_at";

export function createSupabaseBuddyRepo(supabase: SupabaseClient, userId: string): BuddyRepo {
  return {
    async couple() {
      const { data: member, error } = await supabase.from("couple_members").select("couple_id").eq("user_id", userId).maybeSingle();
      if (error) dbError(error, "Could not load your couple.");
      if (!member) return null;
      const { data: members, error: mErr } = await supabase.from("couple_members").select("user_id").eq("couple_id", member.couple_id);
      if (mErr) dbError(mErr, "Could not load your couple.");
      const partner = ((members ?? []) as Array<{ user_id: string }>).find((m) => m.user_id !== userId);
      return { coupleId: member.couple_id as string, partnerId: partner?.user_id ?? null };
    },
    async shares(ownerId) {
      const { data, error } = await supabase.from("buddy_shares").select(SHARE_COLUMNS).eq("user_id", ownerId).limit(200);
      if (error) dbError(error, "Could not load what's shared.");
      return (data ?? []) as ShareRow[];
    },
    async upsertShare(row) {
      const { data, error } = await supabase
        .from("buddy_shares")
        .upsert(
          { user_id: userId, couple_id: row.coupleId, question_id: row.questionId, level: row.level, shared_ciphertext: row.ciphertext },
          { onConflict: "user_id,question_id" },
        )
        .select(SHARE_COLUMNS)
        .single();
      if (error) dbError(error, "Could not save that share.");
      return data as ShareRow;
    },
    async deleteShare(questionId) {
      const { error } = await supabase.from("buddy_shares").delete().eq("user_id", userId).eq("question_id", questionId);
      if (error) dbError(error, "Could not stop sharing that.");
    },
    async ownAnswer(questionId) {
      const { data, error } = await supabase
        .from("private_answers")
        .select("answer_ciphertext, skipped")
        .eq("user_id", userId)
        .eq("question_id", questionId)
        .maybeSingle();
      if (error) dbError(error, "Could not load your answer.");
      return data ? { ciphertext: (data.answer_ciphertext as string | null) ?? null, skipped: !!data.skipped } : null;
    },
    async messages(limit) {
      const { data, error } = await supabase
        .from("buddy_messages")
        .select("id, role, body_ciphertext, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .order("seq", { ascending: false })
        .limit(limit);
      if (error) dbError(error, "Could not load your conversation.");
      return ((data ?? []) as MessageRow[]).reverse();
    },
    async insertMessages(rows) {
      const { error } = await supabase
        .from("buddy_messages")
        .insert(rows.map((r) => ({ id: r.id, user_id: userId, couple_id: r.coupleId, role: r.role, body_ciphertext: r.ciphertext })));
      if (error) dbError(error, "Could not save your conversation.");
    },
    async clearMessages() {
      const { error } = await supabase.from("buddy_messages").delete().eq("user_id", userId);
      if (error) dbError(error, "Could not clear your conversation.");
    },
    async chargeVoice(chars) {
      const { data, error } = await supabase.rpc("buddy_voice_charge", { p_chars: chars });
      if (error) dbError(error, "Could not check your voice usage.");
      return Number(data ?? 0);
    },
    async userMessagesSince(sinceIso) {
      const { count, error } = await supabase
        .from("buddy_messages")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("role", "user")
        .gte("created_at", sinceIso);
      if (error) dbError(error, "Could not check your recent messages.");
      return count ?? 0;
    },
  };
}

export const RATE_LIMIT_MESSAGE = "We've talked a lot today. Give it a rest and pick this up tomorrow. Your answers are all saved.";
export const KEY_MISSING_MESSAGE = "Spark Buddy can't keep things safe right now, so nothing was saved or shared. Please try again later.";

export const BUDDY_NOTICES = {
  aiOff: "AI is off for your Buddy, so it's using its built-in guide. Nothing you say is sent to AI. You can turn AI on at the top of this screen.",
  noKey: "Buddy is running on its built-in guide. Smarter, more personal replies switch on once Claude is connected.",
  unavailable: "Claude was unavailable just now, so Buddy used its built-in guide.",
} as const;

export const HINT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["hint"],
  properties: { hint: { type: "string", description: "A gentle hint, under 200 characters." } },
} as const;

export interface BuddyDeps {
  repo: BuddyRepo;
  /** null when ENCRYPTION_KEY is missing or invalid: every action then fails closed. */
  sealer: Sealer | null;
  /** Claude, or null/undefined when ANTHROPIC_API_KEY is not configured. */
  generate?: JsonGenerator | null;
  /** The studio voice, or null/undefined when ELEVENLABS_API_KEY is not configured. */
  voice?: VoiceRenderer | null;
  now?: () => Date;
  newId?: () => string;
}

const QUESTION_ID = /^[a-z0-9_]{2,60}$/;

function readQuestion(body: Record<string, unknown>) {
  const id = body.questionId;
  if (typeof id !== "string" || !QUESTION_ID.test(id)) throw new HttpError(400, "That question doesn't exist.");
  const found = findQuestion(id);
  if (!found) throw new HttpError(400, "That question doesn't exist.");
  return found.question;
}

export function createBuddyHandler(deps: BuddyDeps): Handler {
  const now = deps.now ?? (() => new Date());
  const newId = deps.newId ?? (() => crypto.randomUUID());

  return async (body, ctx) => {
    const userId = ctx.user?.id;
    if (!userId) throw new HttpError(401, "Please sign in.");
    const sealer = deps.sealer;
    if (!sealer) {
      console.error("buddy: encryption key unavailable");
      throw new HttpError(500, KEY_MISSING_MESSAGE);
    }
    const couple = await deps.repo.couple();
    if (!couple) throw new HttpError(400, "Pair with your partner first.");

    async function ownAnswerValue(questionId: string): Promise<AnswerValue | null> {
      const stored = await deps.repo.ownAnswer(questionId);
      if (!stored || stored.skipped || !stored.ciphertext) return null;
      try {
        return await sealer!.decryptJson<AnswerValue>(stored.ciphertext, scopes.user(userId!), aad.privateAnswer(userId!, questionId));
      } catch {
        console.error("buddy: answer decrypt failed");
        throw new HttpError(500, "Spark couldn't unlock that answer right now. Nothing was shared.");
      }
    }

    async function openShares(ownerId: string): Promise<PartnerShare[]> {
      const rows = await deps.repo.shares(ownerId);
      const out: PartnerShare[] = [];
      for (const row of rows) {
        // Second guard behind RLS: only hint/open rows of the requested owner, ever.
        if (row.user_id !== ownerId || (row.level !== "hint" && row.level !== "open")) continue;
        try {
          const text = await sealer!.decrypt(row.shared_ciphertext, scopes.couple(couple!.coupleId), aad.buddyShare(ownerId, row.question_id));
          out.push({ questionId: row.question_id, level: row.level, text });
        } catch {
          console.error("buddy: share decrypt failed");
        }
      }
      return out;
    }

    async function history(limit: number): Promise<BuddyTurn[]> {
      const rows = await deps.repo.messages(limit);
      const turns: BuddyTurn[] = [];
      for (const row of rows) {
        try {
          const body = await sealer!.decryptJson<{ text: string; meta?: BuddyMeta | null }>(row.body_ciphertext, scopes.user(userId!), aad.buddyMessage(userId!, row.id));
          turns.push({ role: row.role, text: body.text, at: row.created_at, meta: body.meta ?? null });
        } catch {
          console.error("buddy: message decrypt failed");
        }
      }
      return turns;
    }

    switch (body.action) {
      case "history":
        return { turns: await history(60) };

      case "send": {
        const text = typeof body.text === "string" ? body.text.trim() : "";
        if (!text) throw new HttpError(400, "Say something first.");
        if (Array.from(text).length > MESSAGE_MAX) throw new HttpError(400, "That's a lot at once. Try a shorter message.");
        let interviewQuestionId: string | null = null;
        if (body.interviewQuestionId !== undefined && body.interviewQuestionId !== null) interviewQuestionId = readQuestion({ questionId: body.interviewQuestionId }).id;

        const at = now();
        if ((await deps.repo.userMessagesSince(new Date(at.getTime() - 86_400_000).toISOString())) >= MAX_USER_MESSAGES_PER_DAY) {
          throw new HttpError(429, RATE_LIMIT_MESSAGE);
        }

        const context = sanitizeClientContext(body.context);
        const [partnerShares, past] = await Promise.all([couple.partnerId ? openShares(couple.partnerId) : Promise.resolve([]), history(12)]);
        const request = { text, interviewQuestionId, context, partnerShares, history: past };

        let reply: BuddyReply;
        let notice: string | null = null;
        if (mentionsCrisis(text)) {
          // Never route a possible emergency through the model: resources come first, every time.
          reply = crisisReply();
        } else {
          let result: JsonResult | null = null;
          // AI only with the person's explicit consent: otherwise nothing they said or answered leaves Spark.
          const aiConsent = body.aiConsent === true;
          if (deps.generate && aiConsent) {
            const prompt = buildBuddyPrompt(request);
            result = await deps.generate({ system: prompt.system, user: prompt.user, schema: BUDDY_SCHEMA, effort: "medium", maxTokens: 3000 });
          }
          const parsed = result?.ok ? parseBuddyJson(result.json, request) : null;
          if (parsed) {
            reply = parsed;
          } else {
            reply = fallbackReply(request);
            notice = !aiConsent ? BUDDY_NOTICES.aiOff : !result || (!result.ok && result.reason === "no_key") ? BUDDY_NOTICES.noKey : BUDDY_NOTICES.unavailable;
          }
        }

        const userTurnId = newId();
        const buddyTurnId = newId();
        await deps.repo.insertMessages([
          { id: userTurnId, coupleId: couple.coupleId, role: "user", ciphertext: await sealer.encryptJson({ text }, scopes.user(userId), aad.buddyMessage(userId, userTurnId)) },
          { id: buddyTurnId, coupleId: couple.coupleId, role: "buddy", ciphertext: await sealer.encryptJson({ text: reply.reply, meta: reply.meta }, scopes.user(userId), aad.buddyMessage(userId, buddyTurnId)) },
        ]);
        return { reply, notice };
      }

      case "shares": {
        const rows = await deps.repo.shares(userId);
        const shares: BuddyShare[] = [];
        for (const row of rows) {
          if (row.user_id !== userId) continue;
          try {
            const text = await sealer.decrypt(row.shared_ciphertext, scopes.couple(couple.coupleId), aad.buddyShare(userId, row.question_id));
            shares.push({ questionId: row.question_id, level: row.level, text, updatedAt: row.updated_at });
          } catch {
            console.error("buddy: own share decrypt failed");
          }
        }
        return { shares };
      }

      case "share": {
        const question = readQuestion(body);
        if (!isShareLevel(body.level)) throw new HttpError(400, "Pick off the table, hint, or open.");
        if (body.level === "private") {
          await deps.repo.deleteShare(question.id);
          return { share: null };
        }
        const value = await ownAnswerValue(question.id);
        if (value === null) throw new HttpError(400, "Answer this question first, then choose what Buddy may share.");
        let text: string;
        try {
          text = sharedTextFor(body.level, question, value, body.hint);
        } catch (error) {
          throw new HttpError(400, error instanceof Error ? error.message : "That hint doesn't look right.");
        }
        const ciphertext = await sealer.encrypt(text, scopes.couple(couple.coupleId), aad.buddyShare(userId, question.id));
        const row = await deps.repo.upsertShare({ coupleId: couple.coupleId, questionId: question.id, level: body.level, ciphertext });
        return { share: { questionId: question.id, level: body.level, text, updatedAt: row.updated_at } satisfies BuddyShare };
      }

      case "unshare": {
        const id = body.questionId;
        if (typeof id !== "string" || !QUESTION_ID.test(id)) throw new HttpError(400, "That question doesn't exist.");
        await deps.repo.deleteShare(id);
        return { ok: true };
      }

      case "draft_hint": {
        const question = readQuestion(body);
        const value = await ownAnswerValue(question.id);
        if (value === null) throw new HttpError(400, "Answer this question first.");
        const answerText = answerToText(question, value);
        if (deps.generate && body.aiConsent === true && !mentionsCrisis(answerText)) {
          const result = await deps.generate({
            system:
              "You turn one private answer from a relationship app into a gentle hint that the writer's partner's assistant may pass on. The hint must be kind, specific enough to act on, written about 'them' (the writer), never quote the answer, never reveal names, past events, or sensitive specifics, and stay under 200 characters.",
            user: `Question: ${question.prompt}\nPrivate answer: ${answerText.slice(0, 1500)}\n\nWrite the hint.`,
            schema: HINT_SCHEMA,
            effort: "low",
            maxTokens: 400,
          });
          if (result.ok) {
            try {
              return { hint: cleanHint((result.json as { hint?: unknown })?.hint), source: "claude" };
            } catch {
              // fall through to the built-in hint
            }
          }
        }
        return { hint: fallbackHint(question.id, value), source: "fallback" };
      }

      case "speak": {
        // Buddy's words go to the voice provider only with the same consent as AI replies.
        // Every "no" below resolves { audio: null }: the app then speaks with the device voice.
        // reason tells the app whether to keep trying the studio voice: "off" and "limited"
        // last (no voice configured / today's quota used); "failed" and "crisis" are one-offs.
        if (!deps.voice) return { audio: null, reason: "off" };
        if (body.aiConsent !== true) return { audio: null, reason: "consent" };
        const text = typeof body.text === "string" ? body.text.replace(/\s+/g, " ").trim() : "";
        if (!text) throw new HttpError(400, "Nothing to say.");
        if (Array.from(text).length > SPEAK_CHUNK_MAX) throw new HttpError(400, "That's too long to say at once.");
        if (mentionsCrisis(text)) return { audio: null, reason: "crisis" }; // never route crisis wording to a third party
        const mood = body.mood === "calm" ? "calm" : "lively";
        // Charge exactly what the provider bills (performance tags included), before spending it.
        const used = await deps.repo.chargeVoice(deps.voice.billedChars(text, mood));
        if (used > MAX_SPEAK_CHARS_PER_DAY) return { audio: null, reason: "limited" };
        const audio = await deps.voice.render(text, mood);
        return audio ? { audio: toBase64(audio), mime: "audio/mpeg", reason: null } : { audio: null, reason: "failed" };
      }

      case "clear":
        await deps.repo.clearMessages();
        return { ok: true };

      default:
        throw new HttpError(400, "Unknown action.");
    }
  };
}
