/**
 * Spark Buddy's voice (Thomas, 2026-10-07: "make sure it talks back to us, a very
 * lively voice"): replies cleaned for speech and chunked, the liveliest device
 * voice picked (never a novelty one), a listening turn that waits for a real
 * pause, an interruptible speaker that falls back from the studio voice to the
 * device voice, and strict parsing of spoken yes/no and share levels.
 */
import { listenOnce, MicBlockedError, VoiceUnavailableError, type RecognitionLike } from "@/lib/buddy/voice/listener";
import { DEFAULT_VOICE_PREFS, parseVoicePrefs } from "@/lib/buddy/voice/prefs";
import { createSpeaker } from "@/lib/buddy/voice/speaker";
import { chunkForSpeech, toSpeechText } from "@/lib/buddy/voice/speech-text";
import { parseConfirm, parseTrustLevel, questionToSpeech } from "@/lib/buddy/voice/spoken-intents";
import { pickLivelyVoice, rankVoices, scoreVoice, type VoiceLike } from "@/lib/buddy/voice/voices";
import { findQuestion } from "@shared/questionnaires.ts";

const v = (name: string, lang = "en-US", extra: Partial<VoiceLike> = {}): VoiceLike => ({ name, lang, voiceURI: name, localService: true, default: false, ...extra });

describe("speech text", () => {
  it("drops bullets, emoji, links and markdown, and ends each list line as a sentence", () => {
    const text = "Here's what you two are working on ✦:\n1. Paint the baby's room, by 2026-11-05\n2. Finish the garage\n• Sam left a hint 💌 https://example.com/x\n**Want** to plan?";
    const spoken = toSpeechText(text);
    expect(spoken).toBe("Here's what you two are working on : Paint the baby's room, by 2026-11-05. Finish the garage. Sam left a hint. Want to plan?");
    expect(spoken).not.toMatch(/[•✦💌*]|https/);
  });

  it("chunks at sentence boundaries, never mid-word, under the limit", () => {
    const long = Array.from({ length: 12 }, (_, i) => `Sentence number ${i} is here to make this long.`).join(" ");
    const chunks = chunkForSpeech(long, 120);
    expect(chunks.length).toBeGreaterThan(3);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(120);
    expect(chunks.join(" ")).toBe(long);
    const giant = "word ".repeat(100).trim();
    for (const c of chunkForSpeech(giant, 50)) expect(c).toMatch(/^word( word)*$/);
    expect(chunkForSpeech("   ")).toEqual([]);
  });

  it("keeps money, decimals and abbreviations whole, and starts with one short sentence", () => {
    const chunks = chunkForSpeech("Hi! You saved $1,200.50 so far. Mr. Reyes says hi. That's 7.5 percent of the goal.");
    expect(chunks[0]).toBe("Hi!");
    expect(chunks.join(" ")).toContain("$1,200.50");
    expect(chunks.join(" ")).toContain("Mr. Reyes says hi.");
    expect(chunks.some((c) => c === "50 so far.")).toBe(false);
    expect(toSpeechText("Tom & Amy <3")).toBe("Tom and Amy 3.");
  });
});

describe("picking a lively voice", () => {
  it("prefers neural and premium English voices and never a novelty voice", () => {
    const voices = [v("Zarvox"), v("Bad News"), v("Fred"), v("Thomas", "fr-FR"), v("Samantha"), v("Google US English"), v("Microsoft Aria Online (Natural) - English (United States)"), v("Ava (Premium)")];
    const ranked = rankVoices(voices).map((x) => x.name);
    expect(ranked[0]).toMatch(/Aria Online \(Natural\)/);
    expect(ranked).not.toContain("Zarvox");
    expect(ranked).not.toContain("Bad News");
    expect(ranked).not.toContain("Fred");
    expect(ranked).not.toContain("Thomas");
    expect(ranked.indexOf("Ava (Premium)")).toBeLessThan(ranked.indexOf("Samantha"));
    expect(scoreVoice(v("Whisper"))).toBeLessThan(0);
  });

  it("honours a chosen voice while the device still has it", () => {
    const voices = [v("Samantha"), v("Daniel", "en-GB")];
    expect(pickLivelyVoice(voices, "Daniel")!.name).toBe("Daniel");
    expect(pickLivelyVoice(voices, "Gone")!.name).toBe("Samantha");
    expect(pickLivelyVoice([], null)).toBeNull();
  });

  it("parses saved preferences safely, talking back on by default", () => {
    expect(parseVoicePrefs(null)).toEqual(DEFAULT_VOICE_PREFS);
    expect(DEFAULT_VOICE_PREFS.speak).toBe(true);
    expect(DEFAULT_VOICE_PREFS.handsFree).toBe(false);
    expect(parseVoicePrefs('{"energy": 9, "speak": false}')).toMatchObject({ energy: 1.3, speak: false });
    expect(parseVoicePrefs("garbage")).toEqual(DEFAULT_VOICE_PREFS);
  });
});

/** A scriptable fake recogniser plus a fake clock and interval. */
function harness() {
  let time = 0;
  let tick: (() => void) | null = null;
  const instances: FakeRecognition[] = [];
  class FakeRecognition implements RecognitionLike {
    lang = "";
    interimResults = false;
    continuous = false;
    maxAlternatives = 1;
    onresult: RecognitionLike["onresult"] = null;
    onerror: RecognitionLike["onerror"] = null;
    onend: RecognitionLike["onend"] = null;
    started = false;
    stopped = false;
    constructor() {
      instances.push(this);
    }
    start() {
      this.started = true;
    }
    stop() {
      this.stopped = true;
    }
    say(words: string, isFinal: boolean) {
      this.onresult?.({ resultIndex: 0, results: { length: 1, 0: { isFinal, 0: { transcript: words } } } });
    }
  }
  return {
    Recognition: FakeRecognition,
    instances,
    now: () => time,
    every: (fn: () => void) => {
      tick = fn;
      return () => {
        tick = null;
      };
    },
    advance(ms: number) {
      for (let t = 0; t < ms; t += 250) {
        time += 250;
        tick?.();
      }
    },
    get current() {
      return instances[instances.length - 1]!;
    },
  };
}

describe("listening for one turn", () => {
  it("rides through the phone ending recognition at a pause, and ends on real silence", async () => {
    const h = harness();
    const heard: string[] = [];
    const turn = listenOnce({ Recognition: h.Recognition, now: h.now, every: h.every, onHeard: (t) => heard.push(t), pacing: { silenceHoldMs: 1600, leadInMs: 8000, maxMs: 45000 } });
    h.current.say("I see Sam pulling", false);
    h.advance(500);
    // iOS ends recognition at the first gap, dropping the interim tail unless it's kept.
    h.current.onend!();
    expect(h.instances).toHaveLength(2); // restarted, not finished
    h.current.say("away is it something I did", true);
    h.advance(1000);
    let settled = false;
    void turn.result.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    h.advance(1750);
    expect(await turn.result).toBe("I see Sam pulling away is it something I did");
    expect(heard.at(-1)).toBe("I see Sam pulling away is it something I did");
  });

  it("re-fired results with no new words don't keep the turn open", async () => {
    const h = harness();
    const turn = listenOnce({ Recognition: h.Recognition, now: h.now, every: h.every });
    h.current.say("plan a date", false);
    for (let i = 0; i < 10; i++) {
      h.advance(250);
      h.current.say("plan a date", false); // a noisy room re-firing the same words
    }
    expect(await turn.result).toBe("plan a date");
  });

  it("stops at once on errors that would repeat on every restart", async () => {
    for (const error of ["audio-capture", "network"]) {
      const h = harness();
      const turn = listenOnce({ Recognition: h.Recognition, now: h.now, every: h.every });
      h.current.onerror!({ error });
      h.current.onend!();
      await expect(turn.result).rejects.toBeInstanceOf(VoiceUnavailableError);
      expect(h.instances).toHaveLength(1); // no restart loop
    }
  });

  it("gives up quietly when nothing is said, and reports a blocked mic", async () => {
    const h = harness();
    const silent = listenOnce({ Recognition: h.Recognition, now: h.now, every: h.every });
    h.advance(8250);
    expect(await silent.result).toBe("");
    const h2 = harness();
    const blocked = listenOnce({ Recognition: h2.Recognition, now: h2.now, every: h2.every });
    h2.current.onerror!({ error: "not-allowed" });
    await expect(blocked.result).rejects.toBeInstanceOf(MicBlockedError);
  });

  it("doesn't repeat a final result the recogniser re-delivers after a restart", async () => {
    const h = harness();
    const turn = listenOnce({ Recognition: h.Recognition, now: h.now, every: h.every });
    h.current.say("add two hundred dollars", true);
    h.current.onend!();
    h.current.say("add two hundred dollars", true);
    h.advance(2000);
    expect(await turn.result).toBe("add two hundred dollars");
  });

  it("finish keeps the words, cancel throws them away", async () => {
    const h = harness();
    const a = listenOnce({ Recognition: h.Recognition, now: h.now, every: h.every });
    h.current.say("yes add it", false);
    a.stop();
    expect(await a.result).toBe("yes add it");
    const b = listenOnce({ Recognition: h.Recognition, now: h.now, every: h.every });
    h.current.say("oops", false);
    b.cancel();
    expect(await b.result).toBe("");
  });
});

/** Fake speechSynthesis that "speaks" instantly (or holds until released). */
function fakeSynth(hold = false) {
  const spoken: Array<{ text: string; rate: number; pitch: number; voice: string | null }> = [];
  const pending: Array<() => void> = [];
  class Utterance {
    text: string;
    rate = 1;
    pitch = 1;
    volume = 1;
    lang = "";
    voice: { name: string } | null = null;
    onend: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(text: string) {
      this.text = text;
    }
  }
  const synth = {
    getVoices: () => [v("Samantha"), v("Microsoft Jenny Online (Natural) - English (United States)"), v("Zarvox")],
    speak(u: Utterance) {
      if (!u.text.trim()) return;
      spoken.push({ text: u.text, rate: u.rate, pitch: u.pitch, voice: u.voice?.name ?? null });
      if (hold) pending.push(() => u.onend?.());
      else queueMicrotask(() => u.onend?.());
    },
    cancel() {
      while (pending.length) pending.shift()!(); // cancel fires the end/error handlers
    },
  };
  return { synth: synth as unknown as SpeechSynthesis, Utterance: Utterance as unknown as typeof SpeechSynthesisUtterance, spoken, pending };
}

function fakeAudio(fail = false) {
  const played: string[] = [];
  const el = {
    src: "",
    preload: "",
    onended: null as null | (() => void),
    onerror: null as null | (() => void),
    play() {
      played.push(this.src);
      if (this.src.startsWith("data:")) return Promise.resolve();
      if (fail) return Promise.reject(new Error("blocked"));
      queueMicrotask(() => this.onended?.());
      return Promise.resolve();
    },
    pause() {},
  };
  return { el: el as unknown as HTMLAudioElement, played };
}

describe("Buddy's speaker", () => {
  it("speaks every chunk in the liveliest device voice, with lively rate and pitch", async () => {
    const f = fakeSynth();
    const speaker = createSpeaker({ synth: f.synth, Utterance: f.Utterance, createAudio: () => fakeAudio().el });
    const states: boolean[] = [];
    speaker.subscribe((s) => states.push(s));
    await speaker.speak("Hey! You two are doing great. Want me to book Friday?", { energy: 1.2 });
    expect(f.spoken.map((s) => s.text).join(" ")).toBe("Hey! You two are doing great. Want me to book Friday?");
    expect(f.spoken[0]!.voice).toMatch(/Jenny Online \(Natural\)/);
    expect(f.spoken[0]!.rate).toBeCloseTo(1.2);
    expect(f.spoken[0]!.pitch).toBeGreaterThan(1.1);
    expect(states).toEqual([true, false]);
  });

  it("a new reply or Stop interrupts what is playing", async () => {
    const f = fakeSynth(true);
    const speaker = createSpeaker({ synth: f.synth, Utterance: f.Utterance, createAudio: () => fakeAudio().el });
    const first = speaker.speak("This is a very long first reply. It has many sentences. Keep going.");
    await Promise.resolve();
    expect(f.spoken).toHaveLength(1);
    speaker.stop();
    await first;
    expect(speaker.speaking).toBe(false);
    expect(f.spoken).toHaveLength(1); // nothing more after Stop
  });

  it("uses the studio voice when available and falls back to the device voice mid-reply", async () => {
    const f = fakeSynth();
    const audio = fakeAudio();
    let calls = 0;
    const server = async () => (++calls === 1 ? new Blob(["mp3"]) : null); // first chunk renders, then the server stops answering
    const speaker = createSpeaker({ synth: f.synth, Utterance: f.Utterance, createAudio: () => audio.el, createObjectURL: () => "blob:1", revokeObjectURL: () => undefined });
    // The first chunk is always one sentence, so these two render as two chunks.
    const one = "First sentence here.";
    const two = "Second sentence here.";
    await speaker.speak(`${one} ${two}`, { server });
    expect(audio.played).toEqual(["blob:1"]);
    expect(f.spoken.map((s) => s.text)).toEqual([two]);
  });

  it("never hangs when Safari drops the end event", async () => {
    vi.useFakeTimers();
    try {
      const f = fakeSynth(true); // holds forever: no onend
      const speaker = createSpeaker({ synth: f.synth, Utterance: f.Utterance, createAudio: () => fakeAudio().el });
      const p = speaker.speak("Short line.");
      await vi.advanceTimersByTimeAsync(3000);
      await p;
      expect(speaker.speaking).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stays silent rather than use a network voice when on-device only has no local voice", async () => {
    const f = fakeSynth();
    (f.synth as unknown as { getVoices: () => VoiceLike[] }).getVoices = () => [v("Google US English", "en-US", { localService: false })];
    const speaker = createSpeaker({ synth: f.synth, Utterance: f.Utterance, createAudio: () => fakeAudio().el });
    await speaker.speak("Hello there.", { onDeviceOnly: true });
    expect(f.spoken).toEqual([]);
    expect(pickLivelyVoice([v("Google US English", "en-US", { localService: false })], null, true)).toBeNull();
  });

  it("can stay on this device's own voices", async () => {
    const f = fakeSynth();
    (f.synth as unknown as { getVoices: () => VoiceLike[] }).getVoices = () => [v("Google US English", "en-US", { localService: false }), v("Samantha", "en-US", { localService: true })];
    const speaker = createSpeaker({ synth: f.synth, Utterance: f.Utterance, createAudio: () => fakeAudio().el });
    await speaker.speak("Hello there.", { onDeviceOnly: true });
    expect(f.spoken[0]!.voice).toBe("Samantha");
    await speaker.speak("Hello there.");
    expect(f.spoken[1]!.voice).toBe("Google US English");
  });

  it("unlocks audio and warms speech inside a tap", () => {
    const f = fakeSynth();
    const audio = fakeAudio();
    const speaker = createSpeaker({ synth: f.synth, Utterance: f.Utterance, createAudio: () => audio.el });
    speaker.unlock();
    expect(audio.played[0]).toMatch(/^data:audio\/wav/);
    expect(speaker.available).toBe(true);
    expect(createSpeaker({ synth: null, Utterance: null, createAudio: () => audio.el }).available).toBe(false);
  });
});

describe("iPhone speech reliability (Thomas, 2026-10-08: Buddy wasn't talking back on his phone)", () => {
  /** A scriptable speech engine: utterances wait until the test starts/ends/fails them. */
  function engine() {
    const queued: Array<{ text: string; volume: number; fire: (ev: "start" | "end" | "error", data?: unknown) => void }> = [];
    let cancels = 0;
    class Utterance {
      text: string;
      rate = 1;
      pitch = 1;
      volume = 1;
      lang = "";
      voice: unknown = null;
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      constructor(text: string) {
        this.text = text;
      }
    }
    const synth = {
      getVoices: () => [v("Samantha")],
      speak(u: Utterance) {
        queued.push({
          text: u.text,
          volume: u.volume,
          fire: (ev, data) => (ev === "start" ? u.onstart?.() : ev === "end" ? u.onend?.() : u.onerror?.(data)),
        });
      },
      cancel() {
        cancels++;
      },
    };
    return { synth: synth as unknown as SpeechSynthesis, Utterance: Utterance as unknown as typeof SpeechSynthesisUtterance, queued, cancels: () => cancels };
  }

  it("keeps warming up on each tap until speech has really started, then stops", () => {
    const e = engine();
    const speaker = createSpeaker({ synth: e.synth, Utterance: e.Utterance, createAudio: () => fakeAudio().el });
    speaker.unlock(); // e.g. a touch iOS didn't count: the warm-up is dropped, no events
    speaker.unlock(); // the real tap must warm up again
    expect(e.queued.filter((q) => q.volume === 0)).toHaveLength(2);
    e.queued[1]!.fire("start");
    speaker.unlock();
    expect(e.queued.filter((q) => q.volume === 0)).toHaveLength(2); // primed: no more warm-ups
  });

  it("never cancels when nothing of Buddy's is playing (Safari drops speech queued right after a cancel)", async () => {
    const e = engine();
    const speaker = createSpeaker({ synth: e.synth, Utterance: e.Utterance, createAudio: () => fakeAudio().el });
    speaker.unlock();
    const p = speaker.speak("Hi there.");
    await new Promise((r) => setTimeout(r, 0));
    expect(e.cancels()).toBe(0);
    const reply = e.queued.find((q) => q.text === "Hi there.")!;
    reply.fire("start");
    reply.fire("end");
    await p;
  });

  it("reports silence instead of 'talking' forever when speech never starts, and skips the rest", async () => {
    vi.useFakeTimers();
    try {
      const e = engine();
      const speaker = createSpeaker({ synth: e.synth, Utterance: e.Utterance, createAudio: () => fakeAudio().el });
      const troubles: unknown[] = [];
      speaker.onTrouble((t) => troubles.push(t));
      const p = speaker.speak("This first sentence is long enough to wait on. And here is a second one.");
      await vi.advanceTimersByTimeAsync(4100);
      await p;
      expect(troubles).toEqual(["silent"]);
      expect(speaker.speaking).toBe(false);
      expect(e.queued.map((q) => q.text)).toEqual(["This first sentence is long enough to wait on."]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports 'blocked' when the browser refuses speech, and clears it once speech works", async () => {
    const e = engine();
    const speaker = createSpeaker({ synth: e.synth, Utterance: e.Utterance, createAudio: () => fakeAudio().el });
    const troubles: unknown[] = [];
    speaker.onTrouble((t) => troubles.push(t));
    const first = speaker.speak("Hello.");
    await new Promise((r) => setTimeout(r, 0));
    e.queued.at(-1)!.fire("error", { error: "not-allowed" });
    await first;
    const second = speaker.speak("Hello again.");
    await new Promise((r) => setTimeout(r, 100));
    e.queued.at(-1)!.fire("start");
    e.queued.at(-1)!.fire("end");
    await second;
    expect(troubles).toEqual(["blocked", null]);
  });

  it("tells iOS it's playing before speaking and recording before listening", async () => {
    const session = { type: "auto" };
    const types: string[] = [];
    Object.defineProperty(session, "type", { get: () => types.at(-1) ?? "auto", set: (t: string) => types.push(t), configurable: true });
    vi.stubGlobal("navigator", { ...globalThis.navigator, audioSession: session, userAgent: "iPhone" });
    try {
      const e = engine();
      const speaker = createSpeaker({ synth: e.synth, Utterance: e.Utterance, createAudio: () => fakeAudio().el });
      const p = speaker.speak("Hey!");
      await new Promise((r) => setTimeout(r, 0));
      e.queued.at(-1)!.fire("end");
      await p;
      const h = harness();
      listenOnce({ Recognition: h.Recognition, now: h.now, every: h.every }).cancel();
      expect(types).toEqual(["playback", "play-and-record"]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("understanding short spoken replies", () => {
  it("only an unambiguous yes counts as yes", () => {
    for (const t of ["Yes", "yeah, add it!", "do it please", "Sounds good", "okay"]) expect(parseConfirm(t)).toBe("yes");
    for (const t of ["no", "Not now", "no thanks", "cancel"]) expect(parseConfirm(t)).toBe("no");
    for (const t of ["not correct", "yes but not friday", "don't do it", "maybe", "yes wait", ""]) expect(parseConfirm(t)).not.toBe("yes");
  });

  it("maps spoken share levels, and never opens up an answer on a bare yes", () => {
    expect(parseTrustLevel("off the table")).toBe("private");
    expect(parseTrustLevel("no, keep it private")).toBe("private");
    expect(parseTrustLevel("make it a hint")).toBe("hint");
    expect(parseTrustLevel("open, share it")).toBe("open");
    expect(parseTrustLevel("yes")).toBeNull();
    expect(parseTrustLevel("don't share it")).toBe("private");
    expect(parseTrustLevel("tell them nothing")).toBe("private");
    expect(parseTrustLevel("I'd want him to be more open with me")).toBe("open"); // why the trust question must be bound to its answer
  });

  it("asks questions out loud with their choices", () => {
    expect(questionToSpeech(findQuestion("siblings")!.question)).toBe("How many brothers and sisters did you grow up with? For example: None, I'm an only child, One, Two, or Three or more.");
    expect(questionToSpeech(findQuestion("family_close")!.question)).toBe("How close are you with your family today? From one, distant, to five, very close.");
  });
});
