/**
 * Each person's Buddy voice settings, remembered on this device. Talking back
 * is ON by default (Thomas: "it talks back to us"); hands-free conversation is
 * off until someone turns it on, because it opens the microphone after every
 * reply.
 */
export interface VoicePrefs {
  /** Buddy reads its replies out loud. */
  speak: boolean;
  /** After Buddy finishes talking, it listens for your answer again. */
  handsFree: boolean;
  /** A specific browser voice (voiceURI), or null for Buddy's lively pick. */
  voiceURI: string | null;
  /** 0.8 (calmer) .. 1.3 (faster, more energy). */
  energy: number;
  /**
   * Only use speech voices that run on this device. Off by default because the
   * liveliest browser voices (Chrome's "Google", Edge's "Natural") are rendered
   * on Google's or Microsoft's servers, which the settings panel says plainly.
   */
  onDeviceOnly: boolean;
}

export const DEFAULT_VOICE_PREFS: VoicePrefs = { speak: true, handsFree: false, voiceURI: null, energy: 1.1, onDeviceOnly: false };

const key = (userId: string) => `spark-buddy-voice:${userId}`;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function parseVoicePrefs(raw: string | null | undefined): VoicePrefs {
  if (!raw) return { ...DEFAULT_VOICE_PREFS };
  try {
    const v = JSON.parse(raw) as Partial<VoicePrefs>;
    return {
      speak: typeof v.speak === "boolean" ? v.speak : DEFAULT_VOICE_PREFS.speak,
      handsFree: typeof v.handsFree === "boolean" ? v.handsFree : DEFAULT_VOICE_PREFS.handsFree,
      voiceURI: typeof v.voiceURI === "string" && v.voiceURI.length < 300 ? v.voiceURI : null,
      energy: typeof v.energy === "number" && Number.isFinite(v.energy) ? clamp(v.energy, 0.8, 1.3) : DEFAULT_VOICE_PREFS.energy,
      onDeviceOnly: typeof v.onDeviceOnly === "boolean" ? v.onDeviceOnly : DEFAULT_VOICE_PREFS.onDeviceOnly,
    };
  } catch {
    return { ...DEFAULT_VOICE_PREFS };
  }
}

export function loadVoicePrefs(userId: string): VoicePrefs {
  try {
    return parseVoicePrefs(localStorage.getItem(key(userId)));
  } catch {
    return { ...DEFAULT_VOICE_PREFS };
  }
}

export function saveVoicePrefs(userId: string, prefs: VoicePrefs) {
  try {
    localStorage.setItem(key(userId), JSON.stringify(prefs));
  } catch {
    // Storage blocked: the choice lasts for this visit only.
  }
}
