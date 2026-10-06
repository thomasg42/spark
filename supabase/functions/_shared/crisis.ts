/**
 * Crisis support. Spark is not therapy and not an emergency service. If text
 * suggests danger, abuse or self-harm, the app shows these resources right away.
 * Detection is deliberately broad: a false positive only shows a phone number.
 */
export const CRISIS_RESOURCES = [
  {
    id: "988",
    name: "988 Suicide & Crisis Lifeline",
    detail: "Call or text 988, any time, free and confidential (US).",
    tel: "988",
    sms: "988",
  },
  {
    id: "dv",
    name: "National Domestic Violence Hotline",
    detail: "Call 1-800-799-7233, or text START to 88788 (US).",
    tel: "18007997233",
    sms: "88788",
  },
  {
    id: "911",
    name: "Emergency services",
    detail: "If you are in immediate danger, call 911.",
    tel: "911",
    sms: null,
  },
] as const;

const PATTERNS: RegExp[] = [
  /\bkill(ing)? myself\b/i,
  /\b(want(s|ed)?|going|gonna|tried|try(ing)?|threaten(s|ed)?) to kill (me|myself)\b/i,
  /\bsuicid(e|al)\b/i,
  /\bend (my|it all|my life)\b/i,
  /\bwant(ed)? to die\b/i,
  /\bdon'?t want to (be here|live)\b/i,
  /\bself[- ]?harm\b/i,
  /\bhurt(ing)? myself\b/i,
  /\bcut(ting)? myself\b/i,
  /\b(hits?|hitting|hit|slaps?|slapped|chok(es|ed|ing)|punch(es|ed)?|beat(s|ing)?) me\b/i,
  /\b(abuse[sd]?|abusive|abusing)\b/i,
  /\bafraid (of|for) (him|her|them|my partner|my life)\b/i,
  /\b(threaten(s|ed|ing)?) (me|to)\b/i,
  /\bnot safe\b|\bunsafe\b/i,
  /\b(forced|forces|forcing) me\b/i,
];

export function mentionsCrisis(...texts: Array<string | null | undefined>): boolean {
  return texts.some((t) => typeof t === "string" && PATTERNS.some((p) => p.test(t)));
}

export const NOT_THERAPY_NOTE =
  "Spark supports your relationship. It is not therapy, counseling, or an emergency service.";
