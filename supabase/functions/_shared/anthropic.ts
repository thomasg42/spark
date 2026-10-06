/**
 * Real Claude implementation of the JsonGenerator port (Deno / Edge Functions only).
 *
 * - Model: claude-sonnet-5-5 (named in the product spec).
 * - Structured output via output_config.format (JSON Schema).
 * - Server-side refusal fallback opted in by default (fallbacks: "default" with the
 *   server-side-fallback-2026-07-01 beta), and stop_reason is checked before content.
 * - The API key comes from the ANTHROPIC_API_KEY secret and is never logged.
 */
import Anthropic from "@anthropic-ai/sdk";
import { sanitizeSchema, type JsonGenerator, type JsonRequest, type JsonResult } from "./llm.ts";

export const CLAUDE_MODEL = "claude-sonnet-5-5";

export function createClaudeGenerator(apiKey: string | undefined): JsonGenerator | null {
  if (!apiKey) return null;
  const client = new Anthropic({ apiKey, maxRetries: 2, timeout: 60_000 });

  return async (request: JsonRequest): Promise<JsonResult> => {
    try {
      const response = await client.beta.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: request.maxTokens ?? 4000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: request.system,
        messages: [{ role: "user", content: request.user }],
        output_config: {
          effort: request.effort ?? "medium",
          format: { type: "json_schema", schema: sanitizeSchema(request.schema) as Record<string, unknown> },
        },
      });

      if (response.stop_reason === "refusal") return { ok: false, reason: "refusal" };
      if (response.stop_reason === "max_tokens") return { ok: false, reason: "truncated" };

      const text = response.content
        .map((block) => (block.type === "text" ? block.text : ""))
        .join("")
        .trim();
      try {
        return { ok: true, json: JSON.parse(text) };
      } catch {
        return { ok: false, reason: "invalid_json" };
      }
    } catch (error) {
      // Log only the error class and status; never request bodies, answers, or keys.
      if (error instanceof Anthropic.APIError) {
        console.error(`Claude API error: ${error.constructor.name} status=${error.status}`);
      } else {
        console.error("Claude request failed:", error instanceof Error ? error.name : "unknown");
      }
      return { ok: false, reason: "api_error" };
    }
  };
}
