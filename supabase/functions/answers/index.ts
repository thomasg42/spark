/**
 * Edge Function "answers": private onboarding answers (Module B).
 * Wiring only; the logic and its tests live in ../_shared/answers-handler.ts.
 *
 * Acts with the caller's own JWT (ctx.supabase), so owner-only RLS applies.
 * ENCRYPTION_KEY missing or invalid -> every request fails closed with a 500.
 */
import { createAnswersHandler, sealerFromEnv, supabaseAnswersRepo } from "../_shared/answers-handler.ts";
import { makeRequestHandler } from "../_shared/http.ts";

const sealer = sealerFromEnv(Deno.env.get("ENCRYPTION_KEY"));

Deno.serve(
  makeRequestHandler(
    {
      supabaseUrl: Deno.env.get("SUPABASE_URL")!,
      anonKey: Deno.env.get("SUPABASE_ANON_KEY")!,
      allowedOrigins: Deno.env.get("ALLOWED_ORIGINS"),
    },
    async (body, ctx) => createAnswersHandler({ repo: supabaseAnswersRepo(ctx.supabase), sealer })(body, ctx),
  ),
);
