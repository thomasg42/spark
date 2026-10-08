"use client";
/**
 * Buddy's voice for one screen: speaking (queued, interruptible), listening
 * (one owned turn at a time), and the person's voice settings.
 *
 * Rules this hook guarantees (each one was a reviewed defect, 2026-10-08):
 *  - Half duplex: speaking first closes any open listening turn, and listening
 *    first silences Buddy, so the mic never transcribes Buddy's own voice.
 *  - say() resolves TRUE only when Buddy finished naturally. Stop, Esc, hiding
 *    the page, a new turn or barge-in resolve FALSE, so a hands-free loop never
 *    re-opens the mic after the person stopped it.
 *  - listen() resolves null when the turn was cancelled (Cancel, Esc, a newer
 *    turn, Buddy starting to talk) and "" only for real silence.
 *  - Only the newest listening turn may change the listening state.
 *  - The studio (server) voice is re-checked for every chunk, so turning AI off
 *    or choosing on-device voices stops it mid-reply; on-device-only never uses it.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listenOnce, MicBlockedError, recognitionCtor, VoiceUnavailableError, type ListenHandle } from "@/lib/buddy/voice/listener";
import { DEFAULT_VOICE_PREFS, loadVoicePrefs, saveVoicePrefs, type VoicePrefs } from "@/lib/buddy/voice/prefs";
import { createSpeaker, type ServerVoice, type Speaker } from "@/lib/buddy/voice/speaker";
import { rankVoices } from "@/lib/buddy/voice/voices";

export interface SayOptions {
  /** Softer delivery (crisis resources, sensitive moments). */
  calm?: boolean;
  /** Speak even when talking back is turned off (the "Hear Buddy" test button). */
  force?: boolean;
  /** Never use the studio voice for this text (crisis resources). */
  deviceOnly?: boolean;
}

export interface BuddyVoice {
  prefs: VoicePrefs;
  setPrefs(patch: Partial<VoicePrefs>): void;
  /** Ranked English voices on this device (empty until the browser lists them). */
  voices: SpeechSynthesisVoice[];
  /** True when on-device-only is on but this device has no local English voice. */
  noLocalVoice: boolean;
  canSpeak: boolean;
  canListen: boolean;
  speaking: boolean;
  listening: boolean;
  heard: string;
  countdown: number | null;
  /** Call inside a tap so speech can play on iOS (also done on any tap automatically). */
  unlock(): void;
  /** Queue something for Buddy to say. Resolves true only if it finished without being stopped. */
  say(text: string, opts?: SayOptions): Promise<boolean>;
  /** Stop talking now and drop anything queued. */
  hush(): void;
  /** One listening turn: words, "" for silence, null when cancelled. Throws MicBlockedError / VoiceUnavailableError. */
  listen(): Promise<string | null>;
  /** True while a listening turn is open (always current, unlike the `listening` state). */
  isListening(): boolean;
  /** Ends the current listening turn now, keeping the words. */
  finishListening(): void;
  /** Ends the current listening turn and throws the words away. */
  cancelListening(): void;
}

export function useBuddyVoice(userId: string | null | undefined, server: ServerVoice | null): BuddyVoice {
  const speakerRef = useRef<Speaker | null>(null);
  if (!speakerRef.current && typeof window !== "undefined") speakerRef.current = createSpeaker();
  const speaker = speakerRef.current;

  const [prefs, setPrefsState] = useState<VoicePrefs>(DEFAULT_VOICE_PREFS);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState("");
  const [countdown, setCountdown] = useState<number | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const generation = useRef(0);
  const handle = useRef<ListenHandle | null>(null);
  const cancelled = useRef(new WeakSet<ListenHandle>());
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const serverRef = useRef(server);
  serverRef.current = server;

  useEffect(() => {
    if (userId) setPrefsState(loadVoicePrefs(userId));
  }, [userId]);

  useEffect(() => {
    if (!speaker) return;
    return speaker.subscribe(setSpeaking);
  }, [speaker]);

  // getVoices() is often empty until the browser fires 'voiceschanged'.
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    const load = () => setVoices(rankVoices(synth.getVoices()));
    load();
    synth.addEventListener?.("voiceschanged", load);
    return () => synth.removeEventListener?.("voiceschanged", load);
  }, []);

  const cancelTurn = useCallback(() => {
    const h = handle.current;
    if (!h) return;
    cancelled.current.add(h);
    h.cancel();
  }, []);

  const hush = useCallback(() => {
    generation.current++;
    queue.current = Promise.resolve();
    speakerRef.current?.stop();
  }, []);

  // Any tap or key primes audio (iOS needs a gesture before the first sound), so
  // starter chips and suggestion cards get a spoken reply too. Esc and hiding the
  // page stop the whole voice flow: speech, queue and the open mic.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const prime = () => speakerRef.current?.unlock();
    const stopAll = () => {
      hush();
      cancelTurn();
    };
    const onVisibility = () => {
      if (document.hidden) stopAll();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") stopAll();
      else prime();
    };
    document.addEventListener("pointerdown", prime, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", prime);
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("keydown", onKey);
    };
  }, [hush, cancelTurn]);

  // Leaving the screen silences Buddy and closes the mic.
  useEffect(
    () => () => {
      generation.current++;
      speakerRef.current?.stop();
      const h = handle.current;
      if (h) {
        cancelled.current.add(h);
        h.cancel();
      }
    },
    [],
  );

  const setPrefs = useCallback(
    (patch: Partial<VoicePrefs>) => {
      setPrefsState((current) => {
        const next = { ...current, ...patch };
        if (userId) saveVoicePrefs(userId, next);
        return next;
      });
      // Turning talk-back off, or switching voices, takes effect immediately.
      if (patch.speak === false || patch.onDeviceOnly !== undefined || patch.voiceURI !== undefined) hush();
    },
    [userId, hush],
  );

  const say = useCallback(
    (text: string, opts: SayOptions = {}): Promise<boolean> => {
      if (!speaker || !text.trim() || (!prefsRef.current.speak && !opts.force)) return Promise.resolve(true);
      cancelTurn(); // half duplex: Buddy never talks into an open mic
      const mine = generation.current;
      const mood = opts.calm ? "calm" : "lively";
      const studioAllowed = () => !opts.deviceOnly && !prefsRef.current.onDeviceOnly && !!serverRef.current;
      const run = async () => {
        if (mine !== generation.current) return;
        const p = prefsRef.current;
        await speaker.speak(text, {
          voiceURI: p.voiceURI,
          onDeviceOnly: p.onDeviceOnly,
          energy: opts.calm ? Math.min(p.energy, 0.95) : p.energy,
          // Re-checked for every chunk: AI turned off or on-device chosen mid-reply stops the studio voice.
          server: studioAllowed()
            ? (chunk) => {
                const s = serverRef.current;
                return studioAllowed() && s ? s(chunk, mood) : Promise.resolve(null);
              }
            : null,
        });
      };
      queue.current = queue.current.then(run, run);
      return queue.current.then(() => mine === generation.current);
    },
    [speaker, cancelTurn],
  );

  const listen = useCallback(async (): Promise<string | null> => {
    const Recognition = recognitionCtor();
    if (!Recognition) throw new VoiceUnavailableError("This browser can't listen. Type instead.");
    hush(); // barge-in: Buddy stops talking the moment you start
    cancelTurn();
    setHeard("");
    setCountdown(null);
    setListening(true);
    const h = listenOnce({
      Recognition,
      onHeard: (t) => handle.current === h && setHeard(t),
      onCountdown: (c) => handle.current === h && setCountdown(c),
    });
    handle.current = h;
    try {
      const words = await h.result;
      return cancelled.current.has(h) ? null : words;
    } finally {
      // Only the newest turn owns the listening state.
      if (handle.current === h) {
        handle.current = null;
        setListening(false);
        setCountdown(null);
      }
    }
  }, [hush, cancelTurn]);

  const noLocalVoice = prefs.onDeviceOnly && voices.length > 0 && !voices.some((v) => v.localService);

  return useMemo(
    () => ({
      prefs,
      setPrefs,
      voices,
      noLocalVoice,
      canSpeak: !!speaker?.available,
      canListen: typeof window !== "undefined" && recognitionCtor() !== null,
      speaking,
      listening,
      heard,
      countdown,
      unlock: () => speaker?.unlock(),
      say,
      hush,
      listen,
      isListening: () => handle.current !== null,
      finishListening: () => handle.current?.stop(),
      cancelListening: cancelTurn,
    }),
    [prefs, setPrefs, voices, noLocalVoice, speaker, speaking, listening, heard, countdown, say, hush, listen, cancelTurn],
  );
}

export { MicBlockedError, VoiceUnavailableError };
