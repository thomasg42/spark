/**
 * Agreements → Boundaries. A boundary is about what I will do, not a rule for the other person.
 * Drafts stay with the author. Sharing is an explicit step. Understanding is not a vote.
 */
import { mentionsCrisis } from "./crisis.ts";

export const BOUNDARY_PRINCIPLE =
  "A boundary is about what I will do, not what you are not allowed to do.";

export const BOUNDARY_CATEGORIES = [
  "safety",
  "substances",
  "honesty",
  "time",
  "money",
  "family",
  "intimacy",
  "privacy",
  "custom",
] as const;
export type BoundaryCategory = (typeof BOUNDARY_CATEGORIES)[number];

export const BOUNDARY_CATEGORY_LABELS: Record<BoundaryCategory, string> = {
  safety: "Safety",
  substances: "Substances",
  honesty: "Honesty and communication",
  time: "Time and plans",
  money: "Money",
  family: "Family and friends",
  intimacy: "Intimacy",
  privacy: "Privacy",
  custom: "Custom",
};

export type BoundaryStatus = "draft" | "shared" | "archived";
export type AckResponse = "understood" | "discuss";

export interface BoundaryRecord {
  id: string;
  coupleId: string;
  authorId: string;
  category: BoundaryCategory;
  text: string;
  myAction: string;
  status: BoundaryStatus;
  createdAt: string;
  updatedAt: string;
}

export interface BoundaryAck {
  boundaryId: string;
  userId: string;
  response: AckResponse;
  createdAt: string;
}

export interface AgreementVersion {
  version: number;
  body: string;
  createdBy: string;
  createdAt: string;
}

export interface AgreementRecord {
  id: string;
  coupleId: string;
  status: "proposed" | "active" | "left" | "archived";
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  versions: AgreementVersion[];
  acceptedBy: string[];
}

export const BOUNDARY_RESOURCES = [
  { id: "988", name: "988 Suicide & Crisis Lifeline", detail: "Call or text 988 (US)." },
  { id: "911", name: "Emergency services", detail: "If you are in immediate danger, call 911." },
  { id: "dv", name: "National Domestic Violence Hotline", detail: "Call 1-800-799-7233." },
  { id: "samhsa", name: "SAMHSA helpline", detail: "Call 1-800-662-4357." },
  { id: "rainn", name: "RAINN", detail: "Call 1-800-656-4673." },
] as const;

export const STARTER_TEMPLATES: Array<{ category: BoundaryCategory; text: string; myAction: string }> = [
  { category: "time", text: "I need a heads-up when plans change.", myAction: "I'll say what I need and we can pick a new time." },
  { category: "substances", text: "No big conversations late at night or when either of us is drunk or high.", myAction: "I'll pause the conversation and we'll pick it up when we're both clear-headed." },
  { category: "honesty", text: "I need honesty even when it's hard.", myAction: "I'll ask once, then give us a calm time to talk." },
  { category: "time", text: "If I need space, I'll say 'I need a few days.'", myAction: "I'll name the time I need, and I'll come back when I said I would." },
  { category: "substances", text: "I won't stay in a relationship where drugs are being sold.", myAction: "I'll leave the situation and get support." },
];

const CONTROLLING = [
  /you(?:'re| are) not allowed/i,
  /you (?:can(?:not|'t)|must(?: not)?|have to)\b/i,
  /don'?t you (?:dare|ever)/i,
  /\b(?:hand over|give me) your\b/i,
  /\byour (?:phone|passwords?|bank(?: account)?|location)\b/i,
  /\btrack(?:ing)? (?:you|your|them|their location)\b/i,
  /you(?:'re| are) forbidden/i,
];

const EXTRA_CRISIS = /\b(overdos\w*|coerci\w*|coerced|selling drugs)\b/i;

export type BoundaryReview =
  | { kind: "ok" }
  | { kind: "crisis"; resources: typeof BOUNDARY_RESOURCES }
  | { kind: "reword"; why: string; text: string; myAction: string };

export function isControlling(...parts: Array<string | null | undefined>): boolean {
  return parts.some((part) => typeof part === "string" && CONTROLLING.some((pattern) => pattern.test(part)));
}

export function reviewBoundary(text: string, myAction: string): BoundaryReview {
  const joined = `${text}\n${myAction}`;
  if (mentionsCrisis(joined) || EXTRA_CRISIS.test(joined)) return { kind: "crisis", resources: BOUNDARY_RESOURCES };
  if (isControlling(text, myAction)) {
    const aboutDevices = /phone|password|bank|location|track/i.test(joined);
    return {
      kind: "reword",
      why: `${BOUNDARY_PRINCIPLE} Spark will not write a rule that controls the other person, including their phone, bank, location, or passwords.`,
      text: aboutDevices ? "I need honesty about plans that affect both of us." : "I need us to talk about this before it happens.",
      myAction: isControlling(myAction) ? "I'll step away and we'll talk when we're calm." : myAction.trim() || "I'll step away and we'll talk when we're calm.",
    };
  }
  return { kind: "ok" };
}

/** Sharing never sends push, email, or SMS. The preference stays off until notifications exist. */
export function onBoundaryShared(): { notified: false; channel: null } {
  return { notified: false, channel: null };
}

export function assertSavable(text: string, myAction: string): { text: string; myAction: string } {
  const cleanText = text.trim();
  const cleanAction = myAction.trim();
  if (!cleanText) throw new Error("Add what matters to you.");
  if (!cleanAction) throw new Error("Add what you'll do if it's crossed.");
  if (cleanText.length > 280 || cleanAction.length > 280) throw new Error("Keep each part under 280 characters.");
  const review = reviewBoundary(cleanText, cleanAction);
  if (review.kind === "crisis") throw new Error("This needs support resources, not a saved boundary. Nothing was saved.");
  if (review.kind === "reword") throw new Error(review.why);
  return { text: cleanText, myAction: cleanAction };
}

export function canReadBoundary(row: BoundaryRecord, uid: string): boolean {
  return row.authorId === uid || row.status === "shared" || row.status === "archived";
}

export function nextBoundaryStatus(current: BoundaryStatus, next: BoundaryStatus): BoundaryStatus {
  if (next === current) return current;
  if (current === "draft" && next === "shared") return next;
  if (current === "draft" && next === "archived") throw new Error("A draft can be deleted or shared. Archive is for something you already shared.");
  if (current === "shared" && next === "archived") return next;
  if (current === "shared" && next === "draft") throw new Error("A shared boundary stays visible. You can archive it.");
  throw new Error("That change isn't available.");
}

export function canAck(row: BoundaryRecord, uid: string): boolean {
  return row.status === "shared" && row.authorId !== uid;
}

export function unseenBoundaryIds(rows: BoundaryRecord[], uid: string, seenAt: string | null): string[] {
  return rows
    .filter((row) => row.authorId !== uid && row.status === "shared" && (!seenAt || row.updatedAt > seenAt))
    .map((row) => row.id);
}

export function acceptAgreement(record: AgreementRecord, userId: string, memberIds: string[]): AgreementRecord {
  const latest = record.versions[record.versions.length - 1];
  if (!latest) throw new Error("This agreement has no wording yet.");
  if (record.status === "left" || record.status === "archived") throw new Error("This agreement is closed. Its history is still here.");
  const acceptedBy = record.acceptedBy.includes(userId) ? record.acceptedBy : [...record.acceptedBy, userId];
  const active = memberIds.every((id) => acceptedBy.includes(id));
  return { ...record, acceptedBy, status: active ? "active" : "proposed", updatedAt: new Date().toISOString() };
}
