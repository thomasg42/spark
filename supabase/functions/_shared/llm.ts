/**
 * The narrow port every Claude-powered feature uses. Logic modules depend on this
 * type, not on the SDK, so they can be unit tested with a fake generator and run
 * unchanged in Deno. The real implementation is in anthropic.ts.
 */
export interface JsonRequest {
  system: string;
  user: string;
  /** JSON Schema for structured output (objects need additionalProperties: false). */
  schema: Record<string, unknown>;
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
}

export type JsonResult =
  | { ok: true; json: unknown }
  | { ok: false; reason: "no_key" | "refusal" | "truncated" | "invalid_json" | "api_error" };

export type JsonGenerator = (request: JsonRequest) => Promise<JsonResult>;

/** Generator used when no ANTHROPIC_API_KEY is configured: features fall back cleanly. */
export const unavailableGenerator: JsonGenerator = async () => ({ ok: false, reason: "no_key" });

/**
 * Structured outputs accept only a subset of JSON Schema. Raw messages.create does
 * not strip unsupported keywords (only the SDK's parse() helpers do), and an
 * unsupported keyword makes the whole request fail. This removes them recursively;
 * callers already validate and clamp the parsed output themselves.
 *
 * Removed: minLength, maxLength, pattern, minimum, maximum, exclusiveMinimum,
 * exclusiveMaximum, multipleOf, maxItems, uniqueItems, minItems > 1.
 * Also forces additionalProperties: false on every object (required by the API).
 */
const UNSUPPORTED_KEYS = new Set([
  "minLength", "maxLength", "pattern", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum",
  "multipleOf", "maxItems", "uniqueItems", "minProperties", "maxProperties",
]);

export function sanitizeSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(sanitizeSchema);
  if (!schema || typeof schema !== "object") return schema;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
    if (UNSUPPORTED_KEYS.has(key)) continue;
    if (key === "minItems" && typeof value === "number" && value > 1) {
      out.minItems = 1;
      continue;
    }
    if ((key === "properties" || key === "$defs" || key === "definitions") && value && typeof value === "object" && !Array.isArray(value)) {
      // Keys here are property NAMES (which may be e.g. "pattern"), never keywords.
      out[key] = Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([name, sub]) => [name, sanitizeSchema(sub)]));
      continue;
    }
    // enum/const values are data, not schema: copy them untouched.
    out[key] = key === "enum" || key === "const" ? value : sanitizeSchema(value);
  }
  if (out.type === "object" || (Array.isArray(out.type) && out.type.includes("object"))) out.additionalProperties = false;
  return out;
}
