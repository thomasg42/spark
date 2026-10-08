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

export interface Speaker {
  /** Call from inside a tap/keypress so later speech is allowed to play (iOS). */
  unlock(): void;
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

  let warmed = false;

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
    if (synth && Utterance && !warmed) {
      warmed = true;
      try {
        const warm = new Utterance(" ");
        warm.volume = 0;
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
      try {
        const played = a.play();
        if (played && typeof played.catch === "function") played.catch(finish(() => reject(new Error("playback blocked"))));
      } catch {
        finish(() => reject(new Error("playback failed")))();
      }
    });
  }

  function sayWithDevice(text: string, mine: number, opts: SpeakOptions): Promise<void> {
    return new Promise((resolve) => {
      if (!synth || !Utterance || mine !== token) return resolve();
      const u = new Utterance(text);
      const energy = Math.min(1.3, Math.max(0.8, opts.energy ?? 1.1));
      u.rate = energy;
      u.pitch = Math.min(1.4, 1 + (energy - 1) * 0.9 + 0.03); // a little brighter as energy rises
      u.volume = 1;
      const voice = pickLivelyVoice(synth.getVoices(), opts.voiceURI ?? null, opts.onDeviceOnly ?? false);
      // On-device only with no local voice: stay silent rather than use a network voice.
      if (!voice && opts.onDeviceOnly) return resolve();
      if (voice) {
        u.voice = voice;
        u.lang = voice.lang;
      } else u.lang = "en-US";
      let done = false;
      // Safari drops onend often enough to stall a conversation: never wait longer than the words could take.
      const ceiling = setTimeout(() => end(), Math.min(20000, 900 + text.length * 90));
      const end = () => {
        if (done) return;
        done = true;
        clearTimeout(ceiling);
        if (release === end) release = null;
        resolve();
      };
      u.onend = end;
      u.onerror = end; // cancel() fires onerror ("interrupted"): treat as finished
      release = end;
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
        await sayWithDevice(chunks[i]!, mine, opts);
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
    if (synth) {
      try {
        synth.cancel();
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
    get available() {
      return !!(synth && Utterance);
    },
  };
}
