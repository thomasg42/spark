/**
 * Edge Function "buddy": Spark Buddy (interview, coaching, go-between, sharing).
 * Wiring only; the logic and its tests live in ../_shared/buddy-handler.ts.
 *
 * Acts with the caller's own JWT (ctx.supabase), so RLS applies to every row.
 * ENCRYPTION_KEY missing or invalid -> every request fails closed with a 500.
 * Uses Claude when ANTHROPIC_API_KEY is set, otherwise the built-in rule-based Buddy.
 */
import { sealerFromEnv } from "../_shared/answers-handler.ts";
import { createClaudeGenerator } from "../_shared/anthropic.ts";
import { createBuddyHandler, createSupabaseBuddyRepo } from "../_shared/buddy-handler.ts";
import { makeRequestHandler } from "../_shared/http.ts";
import { createVoiceRenderer } from "../_shared/voice.ts";

const sealer = sealerFromEnv(Deno.env.get("ENCRYPTION_KEY"));
const generate = createClaudeGenerator(Deno.env.get("ANTHROPIC_API_KEY"));
// Buddy's studio voice. Without ELEVENLABS_API_KEY the app speaks with the device's own voice.
const voice = createVoiceRenderer({
  apiKey: Deno.env.get("ELEVENLABS_API_KEY"),
  voiceId: Deno.env.get("BUDDY_VOICE_ID"),
  model: Deno.env.get("BUDDY_VOICE_MODEL"),
});

Deno.serve(
  makeRequestHandler(
    {
      supabaseUrl: Deno.env.get("SUPABASE_URL")!,
      anonKey: Deno.env.get("SUPABASE_ANON_KEY")!,
      allowedOrigins: Deno.env.get("ALLOWED_ORIGINS"),
    },
    async (body, ctx) => createBuddyHandler({ repo: createSupabaseBuddyRepo(ctx.supabase, ctx.user.id), sealer, generate, voice })(body, ctx),
  ),
);
