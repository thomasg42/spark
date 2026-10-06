/**
 * Module B: the "answers" Edge Function logic (private onboarding answers).
 *
 * Every answer is PRIVATE to the person who wrote it, forever (Phase 1 shares
 * nothing). Answers are encrypted with AES-256-GCM under a key scope that
 * belongs to the caller alone (scopes.user) and bound to the exact row with
 * associated data, so a ciphertext copied into another row or account will not
 * open. The function acts with the caller's own JWT, so the owner-only RLS
 * policies on private_answers apply to every read and write here too; the repo
 * ALSO filters by the caller's id as a second, independent guard.
 *
 * Never log answers, plaintext, ciphertext or keys.
 *
 * Actions (body.action):
 *   list  { section? }          -> { answers: SavedAnswerDto[] }  caller's rows only, decrypted
 *   save  { questionId, value } -> { answer: SavedAnswerDto }     validated, encrypted, upserted
 *   skip  { questionId }        -> { answer: SavedAnswerDto }     skipped = true, no ciphertext
 *   clear { questionId }        -> { ok: true }                    deletes the caller's row
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { aad, createSealer, scopes, type Sealer } from "./crypto.ts";
import { dbError, HttpError, type Handler } from "./http.ts";
import { findQuestion, findSection, validateAnswer, type AnswerValue } from "./questionnaires.ts";

/** Same shape as SavedAnswer in src/lib/backend/types.ts (the UI contract). */
export interface SavedAnswerDto {
  questionId: string;
  section: string;
  value: AnswerValue | null; // null when skipped
  skipped: boolean;
  updatedAt: string;
}

/** A private_answers row as stored (never contains plaintext). */
export interface AnswerRow {
  section: string;
  question_id: string;
  answer_ciphertext: string | null;
  skipped: boolean;
  updated_at: string;
}

export interface AnswerWrite {
  section: string;
  question_id: string;
  answer_ciphertext: string | null;
  skipped: boolean;
}

/** Storage port. Every method is scoped to one user id, and the live version also runs under RLS. */
export interface AnswersRepo {
  list(userId: string, section?: string): Promise<AnswerRow[]>;
  upsert(userId: string, row: AnswerWrite): Promise<AnswerRow>;
  remove(userId: string, questionId: string): Promise<void>;
}

const COLUMNS = "section, question_id, answer_ciphertext, skipped, updated_at";

/** Supabase implementation, built from the caller's user-scoped client (never the service role). */
export function supabaseAnswersRepo(client: SupabaseClient): AnswersRepo {
  return {
    async list(userId, section) {
      let query = client.from("private_answers").select(COLUMNS).eq("user_id", userId);
      if (section) query = query.eq("section", section);
      const { data, error } = await query.order("updated_at", { ascending: true });
      if (error) dbError(error, "Could not load your answers.");
      return (data ?? []) as AnswerRow[];
    },
    async upsert(userId, row) {
      const { data, error } = await client
        .from("private_answers")
        .upsert({ user_id: userId, ...row }, { onConflict: "user_id,question_id" })
        .select(COLUMNS)
        .single();
      if (error) dbError(error, "Could not save your answer.");
      return data as AnswerRow;
    },
    async remove(userId, questionId) {
      const { error } = await client.from("private_answers").delete().eq("user_id", userId).eq("question_id", questionId);
      if (error) dbError(error, "Could not clear that answer.");
    },
  };
}

export const KEY_MISSING_MESSAGE = "Spark can't keep your answers safe right now, so nothing was saved or shown. Please try again later.";
export const UNLOCK_FAILED_MESSAGE = "Spark couldn't unlock your saved answers right now. Nothing was changed. Please try again later.";

/**
 * Builds the sealer from the ENCRYPTION_KEY secret, or null when it is missing
 * or too short. A null sealer makes every action fail closed with a 500.
 */
export function sealerFromEnv(masterKeyBase64: string | undefined | null): Sealer | null {
  try {
    return createSealer(masterKeyBase64);
  } catch {
    // Do not log the value or the reason: either could hint at the key.
    return null;
  }
}

const QUESTION_ID = /^[a-z0-9_]{2,60}$/;

function readQuestionId(body: Record<string, unknown>): string {
  const id = body.questionId;
  if (typeof id !== "string" || !QUESTION_ID.test(id)) throw new HttpError(400, "That question doesn't exist.");
  return id;
}

function knownQuestion(body: Record<string, unknown>) {
  const questionId = readQuestionId(body);
  const found = findQuestion(questionId);
  if (!found) throw new HttpError(400, "That question doesn't exist.");
  return { questionId, ...found };
}

export interface AnswersHandlerDeps {
  repo: AnswersRepo;
  /** null when ENCRYPTION_KEY is missing or invalid: every action then fails closed. */
  sealer: Sealer | null;
}

export function createAnswersHandler({ repo, sealer }: AnswersHandlerDeps): Handler {
  return async (body, ctx) => {
    const userId = ctx.user?.id;
    if (!userId) throw new HttpError(401, "Please sign in.");
    // Fail closed before touching storage: never read or write answers without encryption.
    if (!sealer) {
      console.error("answers: encryption key unavailable");
      throw new HttpError(500, KEY_MISSING_MESSAGE);
    }
    const scope = scopes.user(userId);

    async function toDto(row: AnswerRow): Promise<SavedAnswerDto> {
      let value: AnswerValue | null = null;
      if (!row.skipped) {
        if (!row.answer_ciphertext) throw new HttpError(500, UNLOCK_FAILED_MESSAGE);
        try {
          value = await sealer!.decryptJson<AnswerValue>(row.answer_ciphertext, scope, aad.privateAnswer(userId, row.question_id));
        } catch {
          // Fail closed instead of hiding the row: an empty list would invite the
          // user to re-answer and overwrite answers that a correct key could open.
          console.error("answers: decrypt failed");
          throw new HttpError(500, UNLOCK_FAILED_MESSAGE);
        }
      }
      return { questionId: row.question_id, section: row.section, value, skipped: row.skipped, updatedAt: row.updated_at };
    }

    switch (body.action) {
      case "list": {
        let section: string | undefined;
        if (body.section !== undefined && body.section !== null) {
          if (typeof body.section !== "string" || !findSection(body.section)) throw new HttpError(400, "That set of questions doesn't exist.");
          section = body.section;
        }
        const rows = await repo.list(userId, section);
        const mine = rows.filter((r) => !section || r.section === section);
        return { answers: await Promise.all(mine.map(toDto)) };
      }
      case "save": {
        const { questionId, section, question } = knownQuestion(body);
        let value: AnswerValue;
        try {
          value = validateAnswer(question, body.value);
        } catch (error) {
          throw new HttpError(400, error instanceof Error && error.message ? error.message : "That answer doesn't look right.");
        }
        const ciphertext = await sealer.encryptJson(value, scope, aad.privateAnswer(userId, questionId));
        const row = await repo.upsert(userId, { section: section.key, question_id: questionId, answer_ciphertext: ciphertext, skipped: false });
        return { answer: { questionId, section: section.key, value, skipped: false, updatedAt: row.updated_at } satisfies SavedAnswerDto };
      }
      case "skip": {
        const { questionId, section } = knownQuestion(body);
        const row = await repo.upsert(userId, { section: section.key, question_id: questionId, answer_ciphertext: null, skipped: true });
        return { answer: { questionId, section: section.key, value: null, skipped: true, updatedAt: row.updated_at } satisfies SavedAnswerDto };
      }
      case "clear": {
        // Any well-formed id may be cleared, so answers to retired questions can still be removed.
        const questionId = readQuestionId(body);
        await repo.remove(userId, questionId);
        return { ok: true };
      }
      default:
        throw new HttpError(400, "Unknown action.");
    }
  };
}
