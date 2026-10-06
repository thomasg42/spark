/**
 * Social sharing agreement: how public each partner wants the relationship to be.
 * Both choices are shown openly, and the couple agreement is always the MORE
 * private of the two. Consent first: nobody is pushed to be more public than
 * they chose.
 */
export const SOCIAL_LEVELS = ["private", "status_only", "milestones", "open"] as const;
export type SocialLevel = (typeof SOCIAL_LEVELS)[number];

export const SOCIAL_COPY: Record<SocialLevel, { label: string; detail: string }> = {
  private: {
    label: "Keep us private",
    detail: "No relationship status or couple posts. Our moments live here, just for us.",
  },
  status_only: {
    label: "Relationship status only",
    detail: "A status or a profile mention is fine. No couple photos or posts.",
  },
  milestones: {
    label: "Big milestones",
    detail: "Occasional posts for big moments, like anniversaries or trips, after we both say yes.",
  },
  open: {
    label: "Share freely",
    detail: "Couple photos and posts are welcome. Still ask before posting each other.",
  },
};

export function isSocialLevel(value: unknown): value is SocialLevel {
  return typeof value === "string" && (SOCIAL_LEVELS as readonly string[]).includes(value);
}

export interface SocialAgreement {
  mine: SocialLevel | null;
  partner: SocialLevel | null;
  agreed: SocialLevel | null;
  /** True when both picked and the choices differ, so the agreement used the more private one. */
  usedMorePrivate: boolean;
}

export function socialAgreement(mine: SocialLevel | null, partner: SocialLevel | null): SocialAgreement {
  if (!mine || !partner) return { mine, partner, agreed: null, usedMorePrivate: false };
  const agreed = SOCIAL_LEVELS[Math.min(SOCIAL_LEVELS.indexOf(mine), SOCIAL_LEVELS.indexOf(partner))]!;
  return { mine, partner, agreed, usedMorePrivate: mine !== partner };
}
