/**
 * Edge Function "date-ideas": five new date ideas that fit the couple's vibe and
 * are not repeats. Acts with the caller's JWT (RLS applies). Uses Claude when
 * ANTHROPIC_API_KEY is set, otherwise a clearly labelled non-AI list.
 * All logic lives in ../_shared/date-ideas-handler.ts (unit tested in Node).
 */
import { createClaudeGenerator } from "../_shared/anthropic.ts";
import { createDateIdeasHandler, createSupabaseDateIdeasRepo } from "../_shared/date-ideas-handler.ts";
import { makeRequestHandler } from "../_shared/http.ts";

const generate = createClaudeGenerator(Deno.env.get("ANTHROPIC_API_KEY"));

Deno.serve(
  makeRequestHandler(
    {
      supabaseUrl: Deno.env.get("SUPABASE_URL")!,
      anonKey: Deno.env.get("SUPABASE_ANON_KEY")!,
      allowedOrigins: Deno.env.get("ALLOWED_ORIGINS"),
    },
    async (body, ctx) =>
      createDateIdeasHandler({ repo: createSupabaseDateIdeasRepo(ctx.supabase, ctx.user.id), generate })(body, ctx),
  ),
);
