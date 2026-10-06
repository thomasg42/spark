/**
 * Pure view-model helpers for the Agreements screen (Module C). No React, no I/O,
 * so every rule the screen shows can be unit tested:
 *   - rhythm: both picks shown openly, the agreed rhythm, how it was split, the ladder
 *   - quarterly revisit: due or "next revisit around <date>"
 *   - social: both choices side by side, the agreement is ALWAYS the more private one
 *
 * Copy rules: warm, plain, never blaming, no em dashes.
 */
import {
  CADENCE_LABELS,
  CADENCE_LADDER,
  CADENCE_REVIEW_DAYS,
  cadenceReviewDue,
  coupleCadence,
  negotiateCadence,
  type Cadence,
} from "@/lib/domain/cadence";
import { addDays, daysBetween } from "@/lib/domain/dates";
import { SOCIAL_COPY, SOCIAL_LEVELS, socialAgreement, type SocialLevel } from "@/lib/domain/social";

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

/** What to call someone in the UI: nickname first, then display name, then a fallback. */
export function personName(
  person: { nickname: string | null; displayName: string } | null | undefined,
  fallback = "Your partner",
): string {
  const nick = person?.nickname?.trim();
  if (nick) return nick;
  const name = person?.displayName?.trim();
  return name || fallback;
}

/** "Sam" -> "Sam's". Generic fallbacks read naturally too ("Your partner's"). */
export function possessive(name: string): string {
  return `${name}'s`;
}

// ---------------------------------------------------------------------------
// Check-in rhythm
// ---------------------------------------------------------------------------

/** Short labels for the five-rung ladder visual (full labels stay in the text alternative). */
export const LADDER_SHORT_LABELS: Record<Cadence, string> = {
  daily: "Daily",
  twice_weekly: "Twice a week",
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  monthly: "Monthly",
};

export interface LadderStep {
  cadence: Cadence;
  label: string;
  shortLabel: string;
  mine: boolean;
  partner: boolean;
  agreed: boolean;
  /** Screen-reader text for this rung, e.g. "Every two weeks: your shared rhythm". */
  srText: string;
}

/** The ladder from most to least often, with both picks and the result marked. */
export function ladderSteps(
  mine: Cadence | null,
  partner: Cadence | null,
  agreed: Cadence | null,
  partnerName: string,
): LadderStep[] {
  return CADENCE_LADDER.map((cadence) => {
    const isMine = mine === cadence;
    const isPartner = partner === cadence;
    const isAgreed = agreed === cadence;
    const marks: string[] = [];
    if (isMine && isPartner) marks.push(`your pick and ${possessive(partnerName)} pick`);
    else if (isMine) marks.push("your pick");
    else if (isPartner) marks.push(`${possessive(partnerName)} pick`);
    if (isAgreed) marks.push("your shared rhythm");
    const label = CADENCE_LABELS[cadence];
    return {
      cadence,
      label,
      shortLabel: LADDER_SHORT_LABELS[cadence],
      mine: isMine,
      partner: isPartner,
      agreed: isAgreed,
      srText: marks.length ? `${label}: ${marks.join(", ")}` : label,
    };
  });
}

/** One plain line on how the rhythm was split. */
export function rhythmExplanation(mine: Cadence | null, partner: Cadence | null, partnerName: string): string {
  if (!mine && !partner) return "Once you both pick, Spark finds the middle.";
  if (!partner) return `Once ${partnerName} picks, Spark finds the middle.`;
  if (!mine) return "Once you pick, Spark finds the middle.";
  if (mine === partner) return "You both picked the same rhythm, so that's the one.";
  const sum = CADENCE_LADDER.indexOf(mine) + CADENCE_LADDER.indexOf(partner);
  if (sum % 2 === 1) return "Halfway between your two choices. It was uneven, so Spark leaned toward more space.";
  return "Right halfway between your two choices. If it's ever uneven, Spark leans toward more space.";
}

export interface RhythmView {
  mine: Cadence | null;
  partner: Cadence | null;
  agreed: Cadence | null;
  mineLabel: string | null;
  partnerLabel: string | null;
  agreedLabel: string | null;
  explanation: string;
  steps: LadderStep[];
}

export function rhythmView(mine: Cadence | null, partner: Cadence | null, partnerName: string): RhythmView {
  const { agreed } = coupleCadence(mine, partner);
  return {
    mine,
    partner,
    agreed,
    mineLabel: mine ? CADENCE_LABELS[mine] : null,
    partnerLabel: partner ? CADENCE_LABELS[partner] : null,
    agreedLabel: agreed ? CADENCE_LABELS[agreed] : null,
    explanation: rhythmExplanation(mine, partner, partnerName),
    steps: ladderSteps(mine, partner, agreed, partnerName),
  };
}

/** What the shared rhythm would become if I picked `option` (null until the partner picks). */
export function previewAgreed(option: Cadence, partner: Cadence | null): Cadence | null {
  return partner ? negotiateCadence(option, partner) : null;
}

/** Toast text after changing my pick. */
export function cadenceSavedMessage(mine: Cadence, partner: Cadence | null): string {
  const agreed = previewAgreed(mine, partner);
  return agreed ? `Saved. Your shared rhythm is ${CADENCE_LABELS[agreed].toLowerCase()}.` : "Saved your pick.";
}

// ---------------------------------------------------------------------------
// Quarterly revisit
// ---------------------------------------------------------------------------

/** "January 4, 2027" */
export function formatLongDate(d: Date, locale = "en-US"): string {
  return d.toLocaleDateString(locale, { month: "long", day: "numeric", year: "numeric" });
}

export function nextRevisitDate(reviewedAt: string): Date | null {
  const reviewed = new Date(reviewedAt);
  if (Number.isNaN(reviewed.getTime())) return null;
  return addDays(reviewed, CADENCE_REVIEW_DAYS);
}

export interface RevisitInfo {
  due: boolean;
  nextDate: Date | null;
  nextLabel: string | null;
  daysUntil: number | null;
}

export function revisitInfo(reviewedAt: string | null | undefined, today: Date, locale = "en-US"): RevisitInfo {
  const next = reviewedAt ? nextRevisitDate(reviewedAt) : null;
  if (!reviewedAt || !next) return { due: false, nextDate: null, nextLabel: null, daysUntil: null };
  const due = cadenceReviewDue(reviewedAt, today);
  return { due, nextDate: next, nextLabel: formatLongDate(next, locale), daysUntil: daysBetween(today, next) };
}

// ---------------------------------------------------------------------------
// Social media agreement
// ---------------------------------------------------------------------------

export const SOCIAL_RULE = "Spark always goes with the more private choice. Nobody gets pushed to share more than they want.";

export type SocialState = "agreed" | "waiting_partner" | "needs_mine" | "needs_both";

export interface SocialSide {
  who: "mine" | "partner";
  heading: string;
  level: SocialLevel | null;
  label: string | null;
  detail: string | null;
  /** True when this choice is the one the agreement uses. */
  isAgreement: boolean;
}

export interface SocialView {
  state: SocialState;
  agreed: SocialLevel | null;
  agreedLabel: string | null;
  agreedDetail: string | null;
  usedMorePrivate: boolean;
  sides: [SocialSide, SocialSide];
  statusTitle: string;
  statusBody: string;
}

const levelRank = (level: SocialLevel) => SOCIAL_LEVELS.indexOf(level);

/** Lower is more private. Exposed for tests and for anyone comparing two levels. */
export function morePrivate(a: SocialLevel, b: SocialLevel): SocialLevel {
  return levelRank(a) <= levelRank(b) ? a : b;
}

export function socialView(mine: SocialLevel | null, partner: SocialLevel | null, partnerName: string): SocialView {
  const agreement = socialAgreement(mine, partner);
  const { agreed } = agreement;
  const side = (who: "mine" | "partner", level: SocialLevel | null): SocialSide => ({
    who,
    heading: who === "mine" ? "Your choice" : `${possessive(partnerName)} choice`,
    level,
    label: level ? SOCIAL_COPY[level].label : null,
    detail: level ? SOCIAL_COPY[level].detail : null,
    isAgreement: agreed !== null && level === agreed,
  });

  let state: SocialState;
  let statusTitle: string;
  let statusBody: string;
  if (agreed) {
    state = "agreed";
    statusTitle = SOCIAL_COPY[agreed].label;
    statusBody = agreement.usedMorePrivate
      ? "You chose differently, so Spark went with the more private of the two."
      : "You both chose this.";
  } else if (mine && !partner) {
    state = "waiting_partner";
    statusTitle = `Waiting for ${partnerName} to choose`;
    statusBody = "There's no agreement yet. Until there is, check with each other before posting.";
  } else if (!mine && partner) {
    state = "needs_mine";
    statusTitle = "Pick yours";
    statusBody = `${partnerName} has chosen. Pick what feels right for you, and Spark will go with the more private choice.`;
  } else {
    state = "needs_both";
    statusTitle = "Pick yours";
    statusBody = "Neither of you has chosen yet. Spark will go with the more private of your two choices.";
  }

  return {
    state,
    agreed,
    agreedLabel: agreed ? SOCIAL_COPY[agreed].label : null,
    agreedDetail: agreed ? SOCIAL_COPY[agreed].detail : null,
    usedMorePrivate: agreement.usedMorePrivate,
    sides: [side("mine", mine), side("partner", partner)],
    statusTitle,
    statusBody,
  };
}

/** Toast text after changing my social choice. */
export function socialSavedMessage(mine: SocialLevel, partner: SocialLevel | null): string {
  if (!partner) return "Saved your choice.";
  const agreed = socialAgreement(mine, partner).agreed!;
  return `Saved. Your agreement is "${SOCIAL_COPY[agreed].label}".`;
}
