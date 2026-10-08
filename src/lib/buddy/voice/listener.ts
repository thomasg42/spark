/**
 * One turn of listening, owned by Spark, not by the phone's recogniser.
 *
 * Ported from the Gold Mobile Mechanic voice interview (docs/voice.js
 * listenWithBrowser), where it was paid for: left alone, iOS ignores
 * `continuous` and ends the turn at the first pause ("it cut me off mid-
 * sentence"). So every `onend` inside the patience window restarts the
 * recogniser and keeps appending, and the turn ends only on real silence,
 * the hard ceiling, or when nothing is said at all.
 *
 * Silence means "no NEW words": recognisers re-fire `onresult` on the same
 * audio (and in a noisy room), so only transcript growth resets the timer.
 * Clock, timers and the recogniser are injectable for tests.
 */

import { setAudioSession } from "./audio-session";

export interface Pacing {
  /** Quiet time after speech that ends the turn. */
  silenceHoldMs: number;
  /** Give up if nothing at all is said in this long. */
  leadInMs: number;
  /** Hard ceiling for one turn. */
  maxMs: number;
}

export const CHAT_PACING: Pacing = { silenceHoldMs: 1600, leadInMs: 8000, maxMs: 45000 };

interface RecognitionResultList {
  length: number;
  [index: number]: { isFinal: boolean; 0: { transcript: string } };
}
export interface RecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((event: { resultIndex?: number; results: RecognitionResultList }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort?(): void;
}
export type RecognitionCtor = new () => RecognitionLike;

export function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface ListenOptions {
  Recognition: RecognitionCtor;
  pacing?: Pacing;
  /** Live transcript, for the "I heard: …" line while you talk. */
  onHeard?(text: string): void;
  /** Seconds left before the pause ends your turn (null while you're talking). */
  onCountdown?(seconds: number | null): void;
  now?: () => number;
  every?: (fn: () => void, ms: number) => () => void;
}

export class MicBlockedError extends Error {
  constructor() {
    super("Spark can't use the microphone. Allow it in your browser settings, or type instead.");
    this.name = "MicBlockedError";
  }
}

/** The recogniser can't work here right now (no mic hardware, offline, unsupported language). */
export class VoiceUnavailableError extends Error {
  constructor(message = "Voice isn't available right now. Type instead.") {
    super(message);
    this.name = "VoiceUnavailableError";
  }
}

/** Errors that will repeat on every restart, so restarting would only loop. */
const FATAL: Record<string, () => Error> = {
  "not-allowed": () => new MicBlockedError(),
  "service-not-allowed": () => new MicBlockedError(),
  "audio-capture": () => new VoiceUnavailableError("Spark can't find a microphone. Type instead."),
  network: () => new VoiceUnavailableError("Listening needs a connection right now. Type instead."),
  "language-not-supported": () => new VoiceUnavailableError(),
};

export interface ListenHandle {
  /** Resolves with what was said ("" when nothing was). Rejects only when the mic is refused. */
  result: Promise<string>;
  /** Ends the turn now, keeping what was heard so far. */
  stop(): void;
  /** Ends the turn now and throws the words away. */
  cancel(): void;
}

export function listenOnce(opts: ListenOptions): ListenHandle {
  const pacing = opts.pacing ?? CHAT_PACING;
  const now = opts.now ?? (() => Date.now());
  const every =
    opts.every ??
    ((fn: () => void, ms: number) => {
      const id = setInterval(fn, ms);
      return () => clearInterval(id);
    });

  const startedAt = now();
  let finalText = "";
  let liveText = "";
  let lastVoiceAt = now();
  let lastHeardLen = 0;
  let settled = false;
  let discard = false;
  let current: RecognitionLike | null = null;
  let stopWatchdog: (() => void) | null = null;
  let resolveFn!: (v: string) => void;
  let rejectFn!: (e: Error) => void;
  const result = new Promise<string>((resolve, reject) => {
    resolveFn = resolve;
    rejectFn = reject;
  });

  const transcript = () => `${finalText}${liveText}`.replace(/\s+/g, " ").trim();

  const finish = (error?: Error) => {
    if (settled) return;
    settled = true;
    stopWatchdog?.();
    try {
      current?.stop();
    } catch {
      // already stopped
    }
    opts.onCountdown?.(null);
    if (error) rejectFn(error);
    else resolveFn(discard ? "" : transcript());
  };

  const shouldEnd = () => {
    const elapsed = now() - startedAt;
    const quietFor = now() - lastVoiceAt;
    const spoken = transcript();
    if (elapsed >= pacing.maxMs) return true;
    if (spoken && quietFor >= pacing.silenceHoldMs) return true;
    if (!spoken && elapsed >= pacing.leadInMs) return true;
    return false;
  };

  const listenLonger = () => {
    const recognition = new opts.Recognition();
    current = recognition;
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.continuous = true; // honoured on desktop, ignored on iOS; the restart covers both

    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex ?? 0; i < event.results.length; i++) {
        const r = event.results[i]!;
        if (r.isFinal) {
          // Some recognisers re-deliver the last final after a restart: don't say it twice.
          const piece = r[0].transcript.trim();
          if (piece && !finalText.trimEnd().endsWith(piece)) finalText += `${piece} `;
        }
        else interim += r[0].transcript;
      }
      liveText = interim;
      const spoken = transcript();
      if (spoken.length > lastHeardLen) {
        lastHeardLen = spoken.length;
        lastVoiceAt = now();
      }
      opts.onHeard?.(spoken);
    };

    recognition.onerror = (event) => {
      // "no-speech" and "aborted" are what a pause looks like. A refused mic, a
      // missing mic or no network would only repeat on every restart: stop now.
      const fatal = event?.error ? FATAL[event.error] : undefined;
      if (!fatal) return;
      if (transcript()) finish();
      else finish(fatal());
    };

    recognition.onend = () => {
      if (settled) return;
      // A restart drops the interim tail that was never finalised: keep it.
      if (liveText.trim()) {
        finalText += `${liveText.trim()} `;
        liveText = "";
      }
      if (shouldEnd()) return finish();
      try {
        listenLonger();
      } catch {
        finish();
      }
    };

    try {
      setAudioSession("play-and-record"); // iPhone: tell Safari we're recording now
      recognition.start();
    } catch {
      finish();
    }
  };

  // Continuous recognisers never fire onend during a pause, so silence is also enforced here.
  stopWatchdog = every(() => {
    if (settled) return;
    const quietFor = now() - lastVoiceAt;
    if (transcript()) opts.onCountdown?.(quietFor > 400 ? Math.max(0, Math.ceil((pacing.silenceHoldMs - quietFor) / 1000)) : null);
    if (shouldEnd()) finish();
  }, 250);

  listenLonger();

  return {
    result,
    stop: () => finish(),
    cancel: () => {
      discard = true;
      finish();
    },
  };
}
