/**
 * Buddy's voice. Speaks a reply chunk by chunk and can be interrupted at any
 * moment (a new reply, the Stop button, or you starting to talk).
 *
 * Two engines, tried in this order:
 *   1. Server voice (live mode only, when AI is on and the server has a voice
 *      key): an expressive ElevenLabs voice rendered by the "buddy" Edge
 *      Function. The next chunk is fetched while the current one plays.
 *   2. This device's own voice (speechSynthesis), tuned to sound lively. Always
 *      available as the fallback, and the only engine in the demo.
 * If the server voice fails mid-reply, the rest of the reply continues in the
 * device voice instead of going quiet.
 *
 * Lessons ported from Cortana (cortana-ui/index.html) and the GMM voice
 * interview: a token supersedes older speech, one shared <audio> element is
 * unlocked inside the first tap (iOS blocks audio started outside a gesture),
 * speechSynthesis is warmed in the same tap, and stop() must also release a
 * pending playback because pause() fires no 'ended'.
 */
import { setAudioSession } from "./audio-session";
import { chunkForSpeech, toSpeechText } from "./speech-text";
import { pickLivelyVoice } from "./voices";

export type ServerVoice = (text: string, mood?: "lively" | "calm") => Promise<Blob | null>;

export interface SpeakOptions {
  voiceURI?: string | null;
  /** 0.8 .. 1.3; drives speaking rate (and a touch of pitch) for the device voice. */
  energy?: number;
  /** Renders one chunk on the server, or resolves null when unavailable. */
  server?: ServerVoice | null;
  /** Only use device voices that run locally (no browser speech servers). */
  onDeviceOnly?: boolean;
}

export interface SpeakerDeps {
  synth?: SpeechSynthesis | null;
  Utterance?: typeof SpeechSynthesisUtterance | null;
  createAudio?: () => HTMLAudioElement;
  createObjectURL?: (blob: Blob) => string;
  revokeObjectURL?: (url: string) => void;
}

// 0.1 s of silence: playing it inside the first tap unlocks the shared element on iOS.
const SILENT_WAV = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

/**
 * Why Buddy may not be heard: "blocked" = the browser refused speech (no tap
 * yet); "silent" = speech never started (iPhone silent switch, muted, or a
 * stuck speech engine). null = speech is working.
 */
export type SpeechTrouble = "blocked" | "silent" | null;

/** How long speech may take to start before we say something is wrong. */
export const START_WATCHDOG_MS = 4000;

export interface Speaker {
  /** Call from inside a tap/keypress so later speech is allowed to play (iOS). */
  unlock(): void;
  /** Notified when speech is refused or never starts, and again (null) once it works. */
  onTrouble(listener: (trouble: SpeechTrouble) => void): () => void;
  speak(text: string, opts?: SpeakOptions): Promise<void>;
  stop(): void;
  readonly speaking: boolean;
  /** Notified when Buddy starts or stops talking. */
  subscribe(listener: (speaking: boolean) => void): () => void;
  /** True when this device can speak at all. */
  readonly available: boolean;
}

export function createSpeaker(deps: SpeakerDeps = {}): Speaker {
  const synth = deps.synth !== undefined ? deps.synth : typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null;
  const Utterance = deps.Utterance !== undefined ? deps.Utterance : typeof window !== "undefined" && "SpeechSynthesisUtterance" in window ? window.SpeechSynthesisUtterance : null;
  const createAudio = deps.createAudio ?? (() => new Audio());
  const toUrl = deps.createObjectURL ?? ((b: Blob) => URL.createObjectURL(b));
  const revoke = deps.revokeObjectURL ?? ((u: string) => URL.revokeObjectURL(u));

  let token = 0;
  let speaking = false;
  let audio: HTMLAudioElement | null = null;
  let unlocked = false;
  let release: (() => void) | null = null;
  const listeners = new Set<(s: boolean) => void>();
  const troubleListeners = new Set<(t: SpeechTrouble) => void>();
  let trouble: SpeechTrouble = null;
  const report = (t: SpeechTrouble) => {
    if (trouble === t) return;
    trouble = t;
    troubleListeners.forEach((l) => l(t));
  };
  // Safari can garbage-collect an utterance that nothing references, and then its
  // onend never fires: hold every utterance until it settles.
  const alive = new Set<SpeechSynthesisUtterance>();
  /** True once speech has actually started on this page (the iOS gesture prime worked). */
  let primed = false;
  /** An utterance of OURS is queued or speaking (never cancel a silent warm-up). */
  let deviceInFlight = 0;
  let lastCancelAt = -Infinity;
  const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

  const setSpeaking = (value: boolean) => {
    if (speaking === value) return;
    speaking = value;
    listeners.forEach((l) => l(value));
  };

  const shared = () => {
    if (!audio) {
      audio = createAudio();
      audio.preload = "auto";
      (audio as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
    }
    return audio;
  };

  function unlock() {
    // Never swap the shared element's source while a reply is playing.
    if (!unlocked && !speaking) {
      try {
        const a = shared();
        a.src = SILENT_WAV;
        const played = a.play();
        const ok = () => {
          unlocked = true;
          try {
            a.pause();
          } catch {
            // ignore
          }
        };
        if (played && typeof played.then === "function") played.then(ok, () => undefined);
        else ok();
      } catch {
        // No audio element (tests, old browsers): the device voice still works.
      }
    }
    // iOS only lets a page speak after a speak() inside a real tap. Warm up on
    // every tap until speech has actually started once: a warm-up made outside a
    // counted gesture is silently dropped, so it must not count as done.
    if (synth && Utterance && !primed && !speaking) {
      try {
        const warm = new Utterance(" ");
        warm.volume = 0;
        const settle = () => alive.delete(warm);
        warm.onstart = () => {
          primed = true;
        };
        warm.onend = () => {
          primed = true;
          settle();
        };
        warm.onerror = settle;
        alive.add(warm);
        synth.speak(warm);
      } catch {
        // ignore
      }
    }
  }

  function playBlob(blob: Blob, mine: number): Promise<void> {
    return new Promise((resolve, reject) => {
      if (mine !== token) return resolve();
      const a = shared();
      const url = toUrl(blob);
      let done = false;
      const finish = (fn: () => void) => () => {
        if (done) return;
        done = true;
        a.onended = null;
        a.onerror = null;
        if (release === releaseThis) release = null;
        revoke(url);
        fn();
      };
      const releaseThis = finish(resolve);
      release = releaseThis;
      a.onended = finish(resolve);
      a.onerror = finish(() => reject(new Error("playback failed")));
      a.src = url;
      setAudioSession("playback");
      try {
        const played = a.play();
        if (played && typeof played.catch === "function") played.catch(finish(() => reject(new Error("playback blocked"))));
      } catch {
        finish(() => reject(new Error("playback failed")))();
      }
    });
  }

  /** Speaks one chunk with the device voice. Resolves false when speech failed to start. */
  async function sayWithDevice(text: string, mine: number, opts: SpeakOptions): Promise<boolean> {
    // Safari drops an utterance queued in the same instant as cancel(): give it a beat.
    const sinceCancel = now() - lastCancelAt;
    if (sinceCancel < 80) await new Promise((r) => setTimeout(r, 80 - sinceCancel));
    return new Promise<boolean>((resolve) => {
      if (!synth || !Utterance || mine !== token) return resolve(true);
      const u = new Utterance(text);
      const energy = Math.min(1.3, Math.max(0.8, opts.energy ?? 1.1));
      u.rate = energy;
      u.pitch = Math.min(1.4, 1 + (energy - 1) * 0.9 + 0.03); // a little brighter as energy rises
      u.volume = 1;
      const voice = pickLivelyVoice(synth.getVoices(), opts.voiceURI ?? null, opts.onDeviceOnly ?? false);
      // On-device only with no local voice: stay silent rather than use a network voice.
      if (!voice && opts.onDeviceOnly) return resolve(true);
      if (voice) {
        u.voice = voice;
        u.lang = voice.lang;
      } else u.lang = "en-US";
      let done = false;
      let started = false;
      // Safari drops onend often enough to stall a conversation: never wait longer than the words could take.
      const ceiling = setTimeout(() => end(true), Math.min(20000, 900 + text.length * 90));
      // Speech that never starts (silent switch, refused, stuck engine) must not leave Buddy "talking" in silence.
      const watchdog = setTimeout(() => {
        if (!started && !done) {
          report("silent");
          end(false);
        }
      }, START_WATCHDOG_MS);
      const end = (ok: boolean) => {
        if (done) return;
        done = true;
        clearTimeout(ceiling);
        clearTimeout(watchdog);
        alive.delete(u);
        deviceInFlight = Math.max(0, deviceInFlight - 1);
        if (release === endInterrupted) release = null;
        resolve(ok);
      };
      const endInterrupted = () => end(true);
      u.onstart = () => {
        started = true;
        primed = true;
        report(null);
      };
      u.onend = () => end(true);
      u.onerror = (event: Event) => {
        // cancel() fires "interrupted"/"canceled": just finished. "not-allowed": no tap yet.
        const code = (event as Event & { error?: string })?.error;
        if (code === "not-allowed") {
          primed = false;
          report("blocked");
          return end(false);
        }
        end(true);
      };
      release = endInterrupted;
      alive.add(u);
      deviceInFlight++;
      setAudioSession("playback"); // after the mic, iOS would otherwise use the quiet earpiece
      synth.speak(u);
    });
  }

  async function speak(text: string, opts: SpeakOptions = {}) {
    const mine = ++token;
    haltCurrent();
    const chunks = chunkForSpeech(toSpeechText(text));
    if (!chunks.length) return;
    setSpeaking(true);
    try {
      let useServer = !!opts.server;
      // Render the next chunk while the current one plays, so there is no gap.
      let pending: Promise<Blob | null> | null = useServer ? opts.server!(chunks[0]!).catch(() => null) : null;
      for (let i = 0; i < chunks.length; i++) {
        if (mine !== token) return;
        if (useServer && pending) {
          const blob = await pending;
          pending = i + 1 < chunks.length ? opts.server!(chunks[i + 1]!).catch(() => null) : null;
          if (mine !== token) return;
          if (blob) {
            try {
              await playBlob(blob, mine);
              continue;
            } catch {
              // fall through to the device voice for this and later chunks
            }
          }
          useServer = false;
          pending = null;
        }
        // If speech didn't start, the rest of the reply won't either: stop instead of waiting per chunk.
        if (!(await sayWithDevice(chunks[i]!, mine, opts))) return;
      }
    } finally {
      if (mine === token) setSpeaking(false);
    }
  }

  function haltCurrent() {
    if (audio) {
      try {
        audio.pause();
      } catch {
        // ignore
      }
    }
    // Only cancel when our own speech is queued or playing: cancelling a silent
    // warm-up (or nothing) can undo the iOS prime or swallow the next reply.
    if (synth && deviceInFlight > 0) {
      try {
        synth.cancel();
        lastCancelAt = now();
      } catch {
        // ignore
      }
    }
    if (release) {
      const r = release;
      release = null;
      r();
    }
  }

  function stop() {
    token++;
    haltCurrent();
    setSpeaking(false);
  }

  return {
    unlock,
    speak,
    stop,
    get speaking() {
      return speaking;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    onTrouble(listener) {
      troubleListeners.add(listener);
      return () => troubleListeners.delete(listener);
    },
    get available() {
      return !!(synth && Utterance);
    },
  };
}
