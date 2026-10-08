/**
 * Buddy's studio voice (ElevenLabs) on the server: the request matches the
 * verified API for each model family, any provider failure resolves null so the
 * app falls back to the device voice, and the "speak" action runs only with AI
 * consent, never for crisis wording, and within the daily character meter.
 */
import { randomBytes } from "node:crypto";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createBuddyHandler, type BuddyRepo } from "@shared/buddy-handler.ts";
import { MAX_SPEAK_CHARS_PER_DAY, SPEAK_CHUNK_MAX } from "@shared/buddy.ts";
import { createSealer } from "@shared/crypto.ts";
import type { UserContext } from "@shared/http.ts";
import { createVoiceRenderer, DEFAULT_BUDDY_VOICE_ID, toBase64, voiceRequest, type VoiceRenderer } from "@shared/voice.ts";

const sealer = createSealer(randomBytes(32).toString("base64"));
const alex = "11111111-1111-4111-8111-111111111111";
const ctx: UserContext = { supabase: {} as SupabaseClient, user: { id: alex } as User };

describe("the ElevenLabs request", () => {
  it("uses tags and low stability on the expressive v4 model, style and speed on others", () => {
    expect(voiceRequest("Hey you!", "lively", "eleven_v4")).toEqual({ text: "[excited] Hey you!", model_id: "eleven_v4", voice_settings: { stability: 0.3, similarity_boost: 0.75 } });
    expect(voiceRequest("Breathe.", "calm", "eleven_v4")).toEqual({ text: "Breathe.", model_id: "eleven_v4", voice_settings: { stability: 0.6, similarity_boost: 0.75 } });
    const flash = voiceRequest("Hey!", "lively", "eleven_flash_v2_5");
    expect(flash.text).toBe("Hey!");
    expect(flash.voice_settings).toMatchObject({ style: 0.45, speed: 1.1, stability: 0.3 });
  });

  it("calls the verified endpoint with the key in a header, and the default lively voice", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fakeFetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    }) as unknown as typeof fetch;
    const voice = createVoiceRenderer({ apiKey: "sk_test", voiceId: "not valid!", model: null }, fakeFetch)!;
    expect(Array.from((await voice.render("Hi", "lively"))!)).toEqual([1, 2, 3]);
    expect(calls[0]!.url).toBe(`https://api.elevenlabs.io/v1/text-to-speech/${DEFAULT_BUDDY_VOICE_ID}?output_format=mp3_44100_128`);
    expect((calls[0]!.init.headers as Record<string, string>)["xi-api-key"]).toBe("sk_test");
    expect(JSON.parse(String(calls[0]!.init.body)).model_id).toBe("eleven_v4");
  });

  it("resolves null on any failure, and is off with no key", async () => {
    const failing = (async () => new Response("quota exceeded: secret details", { status: 401 })) as unknown as typeof fetch;
    expect(await createVoiceRenderer({ apiKey: "k" }, failing)!.render("Hi", "lively")).toBeNull();
    const throwing = (async () => {
      throw new Error("network");
    }) as unknown as typeof fetch;
    expect(await createVoiceRenderer({ apiKey: "k" }, throwing)!.render("Hi", "lively")).toBeNull();
    expect(createVoiceRenderer({ apiKey: "  " })).toBeNull();
    expect(toBase64(new Uint8Array([104, 105]))).toBe("aGk=");
  });

  it("retries once with a stability every model accepts when a setting is rejected", async () => {
    const bodies: Array<{ voice_settings: { stability: number } }> = [];
    const picky = (async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      bodies.push(body);
      return body.voice_settings.stability === 0.5 ? new Response(new Uint8Array([7]), { status: 200 }) : new Response("bad stability", { status: 400 });
    }) as unknown as typeof fetch;
    const voice = createVoiceRenderer({ apiKey: "k", model: "eleven_v3" }, picky)!;
    expect(Array.from((await voice.render("Hi", "lively"))!)).toEqual([7]);
    expect(bodies.map((b) => b.voice_settings.stability)).toEqual([0.3, 0.5]);
  });

  it("bills the performance tag too", () => {
    const voice = createVoiceRenderer({ apiKey: "k" })!;
    expect(voice.billedChars("a", "lively")).toBe(11); // "[excited] a"
    expect(voice.billedChars("a", "calm")).toBe(1);
    expect(createVoiceRenderer({ apiKey: "k", model: "eleven_flash_v2_5" })!.billedChars("a", "lively")).toBe(1);
  });
});

describe("the speak action", () => {
  let used = 0;
  const said: string[] = [];
  const repo = {
    couple: async () => ({ coupleId: "c", partnerId: null }),
    chargeVoice: async (n: number) => (used += n),
  } as unknown as BuddyRepo;
  let fail = false;
  const voice: VoiceRenderer = {
    async render(text) {
      said.push(text);
      return fail ? null : new Uint8Array([9]);
    },
    billedChars: (text, mood) => text.length + (mood === "lively" ? 10 : 0),
  };
  const handler = (v: VoiceRenderer | null = voice) => createBuddyHandler({ repo, sealer, voice: v });

  beforeEach(() => {
    used = 0;
    fail = false;
    said.length = 0;
  });

  it("returns audio only with AI consent and a configured voice", async () => {
    expect(await handler()({ action: "speak", text: "Hey!", aiConsent: false }, ctx)).toEqual({ audio: null, reason: "consent" });
    expect(await handler(null)({ action: "speak", text: "Hey!", aiConsent: true }, ctx)).toEqual({ audio: null, reason: "off" });
    expect(await handler()({ action: "speak", text: "Hey!", aiConsent: true }, ctx)).toEqual({ audio: "CQ==", mime: "audio/mpeg", reason: null });
    expect(said).toEqual(["Hey!"]);
    expect(used).toBe(14); // the billed length, tag included
    fail = true;
    expect(await handler()({ action: "speak", text: "Hey!", aiConsent: true }, ctx)).toEqual({ audio: null, reason: "failed" });
  });

  it("never sends crisis wording to the voice provider", async () => {
    expect(await handler()({ action: "speak", text: "If you're not safe, call 911.", aiConsent: true }, ctx)).toEqual({ audio: null, reason: "crisis" });
    expect(said).toEqual([]);
  });

  it("meters characters per day and validates size", async () => {
    used = MAX_SPEAK_CHARS_PER_DAY;
    expect(await handler()({ action: "speak", text: "One more", aiConsent: true }, ctx)).toEqual({ audio: null, reason: "limited" });
    expect(said).toEqual([]);
    await expect(handler()({ action: "speak", text: "x".repeat(SPEAK_CHUNK_MAX + 1), aiConsent: true }, ctx)).rejects.toThrow(/too long/);
    await expect(handler()({ action: "speak", text: "   ", aiConsent: true }, ctx)).rejects.toThrow(/Nothing to say/);
  });
});
