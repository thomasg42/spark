/**
 * iPhone audio routing. While the microphone is in use, iOS switches to a
 * play-and-record session that sends speech to the quiet earpiece (or mutes
 * it), so Buddy seemed silent right after you talked to it. Safari 16.4+ lets
 * a page say what it is doing: "playback" while Buddy speaks, "play-and-record"
 * while it listens. Elsewhere this is a no-op.
 */
export type AudioSessionType = "auto" | "playback" | "play-and-record";

export function setAudioSession(type: AudioSessionType) {
  try {
    const nav = (typeof navigator !== "undefined" ? navigator : null) as (Navigator & { audioSession?: { type: string } }) | null;
    if (nav?.audioSession && nav.audioSession.type !== type) nav.audioSession.type = type;
  } catch {
    // Not supported here: nothing to do.
  }
}

/** iPhone, iPad, or an iPad that reports itself as a Mac. */
export function isAppleMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iP(hone|ad|od)/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && (navigator.maxTouchPoints ?? 0) > 1);
}
