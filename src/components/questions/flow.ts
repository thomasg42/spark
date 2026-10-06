/**
 * Pure helpers for the private questionnaire flow: where to resume, where to go
 * next, and how a draft maps to a saved answer. No React here so it is easy to test.
 */
import type { SavedAnswer } from "@/lib/backend/types";
import { mentionsCrisis } from "@shared/crisis.ts";
import { findQuestion, type AnswerValue, type Question, type Section } from "@shared/questionnaires.ts";

export type Draft = string | string[] | number | null;
export type SavedMap = Record<string, SavedAnswer>;

export interface Position {
  sitting: number;
  question: number;
}

export function toSavedMap(list: SavedAnswer[] | null | undefined): SavedMap {
  const map: SavedMap = {};
  for (const answer of list ?? []) map[answer.questionId] = answer;
  return map;
}

/** First unanswered question of the first unfinished sitting, or null when the section is done. */
export function resumePosition(section: Section, saved: SavedMap): Position | null {
  for (let s = 0; s < section.sittings.length; s++) {
    const questions = section.sittings[s]!.questions;
    const q = questions.findIndex((question) => !saved[question.id]);
    if (q >= 0) return { sitting: s, question: q };
  }
  return null;
}

/**
 * Where to go after answering or skipping the current question: the next
 * unanswered question later in this sitting, else any unanswered one earlier in
 * it, else null (the sitting is finished).
 */
export function nextInSitting(section: Section, saved: SavedMap, current: Position): Position | null {
  const questions = section.sittings[current.sitting]?.questions ?? [];
  for (let q = current.question + 1; q < questions.length; q++) {
    if (!saved[questions[q]!.id]) return { sitting: current.sitting, question: q };
  }
  for (let q = 0; q < current.question && q < questions.length; q++) {
    if (!saved[questions[q]!.id]) return { sitting: current.sitting, question: q };
  }
  return null;
}

/** The first sitting with anything left, or null when every question has an answer or a skip. */
export function nextUnfinishedSitting(section: Section, saved: SavedMap): number | null {
  const index = section.sittings.findIndex((sitting) => sitting.questions.some((q) => !saved[q.id]));
  return index >= 0 ? index : null;
}

/** The editable draft for a question, prefilled from a saved (non-skipped) answer. */
export function initialDraft(question: Question, saved?: SavedAnswer): Draft {
  const value = saved && !saved.skipped ? saved.value : null;
  switch (question.kind) {
    case "text":
      return typeof value === "string" ? value : "";
    case "single":
      return typeof value === "string" ? value : null;
    case "multi":
      return Array.isArray(value) ? [...value] : [];
    case "scale":
      return typeof value === "number" ? value : null;
  }
}

/** The value to submit, or null when the draft is still empty. */
export function draftToValue(question: Question, draft: Draft): AnswerValue | null {
  switch (question.kind) {
    case "text":
      return typeof draft === "string" && draft.trim() ? draft.trim() : null;
    case "single":
      return typeof draft === "string" && draft ? draft : null;
    case "multi":
      return Array.isArray(draft) && draft.length > 0 ? draft : null;
    case "scale":
      return typeof draft === "number" ? draft : null;
  }
}

/** Friendly prompt shown when someone taps Save with nothing chosen yet. */
export function emptyMessage(question: Question): string {
  switch (question.kind) {
    case "text":
      return "Write a little, or tap Skip for now.";
    case "single":
      return "Pick one, or tap Skip for now.";
    case "multi":
      return "Pick at least one, or tap Skip for now.";
    case "scale":
      return "Pick a number from 1 to 5, or tap Skip for now.";
  }
}

export function sameValue(a: AnswerValue | null | undefined, b: AnswerValue | null | undefined): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    const set = new Set(a);
    return b.every((v) => set.has(v));
  }
  return a === b;
}

/** True when the draft matches what is already saved, so no save is needed. */
export function isUnchanged(question: Question, draft: Draft, saved?: SavedAnswer): boolean {
  if (!saved || saved.skipped) return false;
  return sameValue(draftToValue(question, draft), saved.value);
}

/** A saved answer in plain words, for the review list. */
export function formatAnswer(question: Question, value: AnswerValue | null): string {
  if (value === null) return "";
  switch (question.kind) {
    case "text":
      return typeof value === "string" ? value : "";
    case "single":
      return question.options.find((o) => o.value === value)?.label ?? String(value);
    case "multi": {
      const values = Array.isArray(value) ? value : [String(value)];
      return values.map((v) => question.options.find((o) => o.value === v)?.label ?? v).join(", ");
    }
    case "scale": {
      if (typeof value !== "number") return String(value);
      const end = value === 1 ? ` (${question.minLabel})` : value === 5 ? ` (${question.maxLabel})` : "";
      return `${value} of 5${end}`;
    }
  }
}

/** Whether typed text suggests someone may need crisis support right now. */
export function draftMentionsCrisis(question: Question, draft: Draft): boolean {
  return question.kind === "text" && typeof draft === "string" && mentionsCrisis(draft);
}

/** Whether any saved free-text answer in a list suggests crisis support should be shown. */
export function answersMentionCrisis(list: SavedAnswer[]): boolean {
  return list.some((a) => typeof a.value === "string" && findQuestion(a.questionId)?.question.kind === "text" && mentionsCrisis(a.value));
}

export function questionsIn(section: Section): Question[] {
  return section.sittings.flatMap((s) => s.questions);
}
