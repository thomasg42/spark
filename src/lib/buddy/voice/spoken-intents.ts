/**
 * Understanding short spoken replies to Buddy's own questions: "yes, add it",
 * "no thanks", "off the table", "make it a hint". Deliberately strict: a reply
 * only counts as YES when the whole utterance is an affirmative with no
 * negation anywhere (FGA lesson: "not correct" must never parse as yes).
 */
import type { Question } from "@shared/questionnaires.ts";
import type { ShareLevel } from "@shared/buddy.ts";

const NEGATION = /\b(no|nope|nah|not|don'?t|do not|never|cancel|stop|wait|hold on|wrong|isn'?t|won'?t|nevermind|never mind)\b/i;
const AFFIRM = "(?:yes|yeah|yep|yup|sure|ok|okay|perfect|great|absolutely|definitely|sounds good|that works|please do|go ahead|let'?s do it)";
const ACT = "(?:do it|add it|send it|save it|book it|share it|go for it)";
// One or two affirmatives and/or an action ("yeah add it", "okay sounds good"), then optional politeness.
const YES = new RegExp(`^(?:${AFFIRM}(?: ${AFFIRM})?(?: ${ACT})?|${ACT})(?: please| thanks| thank you| buddy)*$`, "i");
const NO = /^(no|nope|nah|not now|no thanks|no thank you|skip it|cancel|never mind|nevermind|don'?t)( please| thanks| thank you| buddy)*$/i;

const tidy = (text: string) =>
  (text ?? "")
    .toLowerCase()
    .replace(/[.!?,]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export function parseConfirm(text: string): "yes" | "no" | null {
  const t = tidy(text);
  if (!t) return null;
  if (NO.test(t)) return "no";
  if (NEGATION.test(t)) return null;
  return YES.test(t) ? "yes" : null;
}

/** "off the table" / "keep it private" / "hint" / "open" / "share it". */
export function parseTrustLevel(text: string): ShareLevel | null {
  const t = tidy(text);
  if (!t) return null;
  if (/\b(off the table|private|keep it|just me|nobody|no one|nothing|none|don'?t share|do not share|no)\b/.test(t)) return "private";
  if (/\bhint\b|\bvague\b|\bgentle\b|\bsubtle\b/.test(t)) return "hint";
  // Sharing openly is never inferred from a bare "yes": it takes an explicit word.
  if (/\b(open|openly|share it|share that|share everything|transparent|tell (him|her|them))\b/.test(t) && !NEGATION.test(t)) return "open";
  return null;
}

/** What Buddy says to ask a question out loud, with the choices for tap-style questions. */
export function questionToSpeech(question: Question): string {
  switch (question.kind) {
    case "text":
      return question.prompt;
    case "scale":
      return `${question.prompt} From one, ${question.minLabel.toLowerCase()}, to five, ${question.maxLabel.toLowerCase()}.`;
    case "single":
    case "multi": {
      const labels = question.options.map((o) => o.label);
      const list = labels.length > 1 ? `${labels.slice(0, -1).join(", ")}, or ${labels[labels.length - 1]}` : labels[0];
      return `${question.prompt} For example: ${list}.`;
    }
  }
}
