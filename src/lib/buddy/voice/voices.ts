/**
 * Picking the liveliest voice this device has. Browsers expose very different
 * lists: Edge has expressive "Online (Natural)" neural voices, Chrome has
 * network "Google" voices, Apple devices have Siri-grade "Premium"/"Enhanced"
 * voices next to robotic novelty ones ("Zarvox", "Bad News"). Scores are a
 * heuristic: natural-sounding first, English, never a novelty voice.
 */

export interface VoiceLike {
  name: string;
  lang: string;
  voiceURI: string;
  localService: boolean;
  default: boolean;
}

// macOS/iOS novelty and legacy robotic voices: never pick these for Buddy.
const NOVELTY = /\b(albert|bad news|bahh|bells|boing|bubbles|cellos|deranged|good news|hysterical|jester|junior|organ|pipe organ|ralph|superstar|trinoids|whisper|wobble|zarvox|fred|kathy|eddy|flo|grandma|grandpa|reed|rocko|sandy|shelley)\b/i;
const NEURAL = /\b(natural|neural|online)\b/i;
const PREMIUM = /\b(premium|enhanced|siri)\b/i;
const WARM_AND_LIVELY = /\b(aria|jenny|ava|emma|michelle|sonia|libby|natasha|zoe|samantha|allison|nicky|evan|guy|andrew|brian|christopher|eric)\b/i;

export function scoreVoice(v: VoiceLike): number {
  if (NOVELTY.test(v.name)) return -1000;
  let score = 0;
  const lang = (v.lang || "").toLowerCase().replace("_", "-");
  if (lang.startsWith("en")) score += 100;
  else return -500;
  if (lang === "en-us") score += 12;
  else if (lang === "en-gb" || lang === "en-au" || lang === "en-ca") score += 6;
  if (NEURAL.test(v.name)) score += 60;
  if (PREMIUM.test(v.name)) score += 50;
  if (/^google\b/i.test(v.name)) score += 35;
  if (WARM_AND_LIVELY.test(v.name)) score += 15;
  if (/\bcompact\b/i.test(v.name)) score -= 20;
  if (v.default) score += 3;
  return score;
}

/** English voices, best first, novelty voices removed. */
export function rankVoices<T extends VoiceLike>(voices: readonly T[]): T[] {
  return voices
    .filter((v) => scoreVoice(v) > 0)
    .map((v, i) => ({ v, s: scoreVoice(v), i }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.v);
}

/** The chosen voice if this device still has it, otherwise the liveliest one. */
export function pickLivelyVoice<T extends VoiceLike>(all: readonly T[], preferredURI: string | null, onDeviceOnly = false): T | null {
  // On-device only means exactly that: never a network voice, even if that leaves none (the panel says so).
  const voices = onDeviceOnly ? all.filter((v) => v.localService) : all;
  if (preferredURI) {
    const chosen = voices.find((v) => v.voiceURI === preferredURI);
    if (chosen) return chosen;
  }
  // Safari can stay silent when no voice is set explicitly, so fall back to any English voice, then any voice.
  return rankVoices(voices)[0] ?? voices.find((v) => /^en/i.test(v.lang)) ?? voices[0] ?? null;
}
