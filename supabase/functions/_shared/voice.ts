/**
 * Spark Buddy's studio voice: ElevenLabs text-to-speech, called only from the
 * "buddy" Edge Function so the billable key never reaches the browser.
 *
 * Verified 2026-10-07 against ElevenLabs' docs (research workflow, fact-checked):
 *   - POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}?output_format=mp3_44100_128
 *     with header xi-api-key; the response body is the MP3.
 *   - eleven_v4 is the most expressive model on that endpoint. It accepts only
 *     stability and similarity_boost (no style/speed), and gets its liveliness
 *     from LOW stability plus audio tags such as [excited] written into the text.
 *   - Older/faster models (eleven_flash_v2_5, eleven_multilingual_v2) accept style
 *     and speed instead. eleven_turbo_v2_5 is deprecated.
 *   - Default voice: "Jade - Upbeat and Natural" (g7LVvkPWALzPxOQbF6OE), ElevenLabs'
 *     replacement for the retiring Default voices. Override with BUDDY_VOICE_ID.
 *   - ElevenLabs keeps submitted text by default (zero retention is Enterprise
 *     only), which is why the app sends Buddy's words here only with AI consent.
 *
 * Pure fetch, no SDK: unit tested in Node with a fake fetch.
 */

export const DEFAULT_BUDDY_VOICE_ID = "g7LVvkPWALzPxOQbF6OE"; // Jade - Upbeat and Natural
export const DEFAULT_BUDDY_VOICE_MODEL = "eleven_v4";
export const VOICE_TIMEOUT_MS = 15_000;

export type Mood = "lively" | "calm";

export interface VoiceConfig {
  apiKey: string | undefined | null;
  voiceId?: string | null;
  model?: string | null;
}

export interface VoiceRenderer {
  /** MP3 bytes, or null on any failure (the app then uses the device voice). */
  render(text: string, mood: Mood): Promise<Uint8Array | null>;
  /** Characters the provider bills for this request, tags included (what the daily meter charges). */
  billedChars(text: string, mood: Mood): number;
}

const VOICE_ID = /^[A-Za-z0-9]{10,40}$/;
const MODEL_ID = /^[a-z0-9_]{3,40}$/;

const isExpressive = (model: string) => /^eleven_v[34]/.test(model);

/**
 * The request body for a model family: v3/v4 take tags + stability; others take
 * style + speed. `safe` uses stability 0.5 ("Natural"), which every model accepts:
 * the fallback when a model rejects a finer value (eleven_v3 has been reported to
 * accept only 0.0 / 0.5 / 1.0).
 */
export function voiceRequest(text: string, mood: Mood, model: string, safe = false): Record<string, unknown> {
  if (isExpressive(model)) {
    // Tags are read as performance directions, not spoken (but they are billed).
    const tagged = mood === "lively" ? `[excited] ${text}` : text;
    const stability = safe ? 0.5 : mood === "lively" ? 0.3 : 0.6;
    return { text: tagged, model_id: model, voice_settings: { stability, similarity_boost: 0.75 } };
  }
  return {
    text,
    model_id: model,
    voice_settings:
      mood === "lively"
        ? { stability: 0.3, similarity_boost: 0.75, style: 0.45, use_speaker_boost: true, speed: 1.1 }
        : { stability: 0.6, similarity_boost: 0.75, style: 0, use_speaker_boost: true, speed: 0.95 },
  };
}

/**
 * Builds the renderer, or null when no key is configured. Any failure (bad key,
 * expired plan, timeout, unknown voice) resolves null so the app falls back to
 * the device voice; the upstream error body is never forwarded or logged.
 */
export function createVoiceRenderer(config: VoiceConfig, fetchImpl: typeof fetch = fetch): VoiceRenderer | null {
  const apiKey = config.apiKey?.trim();
  if (!apiKey) return null;
  const voiceId = config.voiceId && VOICE_ID.test(config.voiceId) ? config.voiceId : DEFAULT_BUDDY_VOICE_ID;
  const model = config.model && MODEL_ID.test(config.model) ? config.model : DEFAULT_BUDDY_VOICE_MODEL;
  async function attempt(body: Record<string, unknown>): Promise<{ bytes: Uint8Array | null; status: number }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), VOICE_TIMEOUT_MS);
    try {
      const response = await fetchImpl(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
        method: "POST",
        headers: { "xi-api-key": apiKey!, "Content-Type": "application/json", Accept: "audio/mpeg" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) {
        console.error(`buddy voice: provider status ${response.status}`);
        return { bytes: null, status: response.status };
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      return { bytes: bytes.length ? bytes : null, status: response.status };
    } catch (error) {
      console.error("buddy voice: request failed", error instanceof Error ? error.name : "unknown");
      return { bytes: null, status: 0 };
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async render(text, mood) {
      const first = await attempt(voiceRequest(text, mood, model));
      if (first.bytes) return first.bytes;
      // A rejected setting (400/422) gets one retry with values every model accepts.
      if (isExpressive(model) && (first.status === 400 || first.status === 422)) return (await attempt(voiceRequest(text, mood, model, true))).bytes;
      return null;
    },
    billedChars(text, mood) {
      return Array.from(String(voiceRequest(text, mood, model).text)).length;
    },
  };
}

/** Base64 for the JSON response (chunked so large clips don't overflow the call stack). */
export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
