/**
 * Edge Function "checkins": monthly check-in get/submit with encrypted answers and
 * a shared summary once both partners have answered. All logic lives in
 * ../_shared/checkins-handler.ts (unit tested); this file only wires the environment.
 *
 * Secrets: ENCRYPTION_KEY (required), ANTHROPIC_API_KEY (optional; without it the
 * summary uses the clearly labelled non-AI fallback), ALLOWED_ORIGINS (optional).
 */
import { createClaudeGenerator } from "../_shared/anthropic.ts";
import { createCheckinsHandler, supabaseCheckinsRepository } from "../_shared/checkins-handler.ts";
import { createSealer, type Sealer } from "../_shared/crypto.ts";
import { HttpError, makeRequestHandler } from "../_shared/http.ts";

let sealer: Sealer | null = null;

function getSealer(): Sealer {
  if (!sealer) {
    try {
      sealer = createSealer(Deno.env.get("ENCRYPTION_KEY"));
    } catch {
      console.error("checkins: ENCRYPTION_KEY is missing or invalid");
      throw new HttpError(500, "Spark's server isn't fully set up yet. Please try again later.");
    }
  }
  return sealer;
}

const generate = createClaudeGenerator(Deno.env.get("ANTHROPIC_API_KEY"));

Deno.serve(
  makeRequestHandler(
    {
      supabaseUrl: Deno.env.get("SUPABASE_URL")!,
      anonKey: Deno.env.get("SUPABASE_ANON_KEY")!,
      allowedOrigins: Deno.env.get("ALLOWED_ORIGINS"),
    },
    async (body, ctx) =>
      createCheckinsHandler({ repo: supabaseCheckinsRepository(ctx.supabase, ctx.user.id), sealer: getSealer(), generate })(body, ctx),
  ),
);
