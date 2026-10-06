/**
 * Request plumbing shared by every Edge Function: CORS, JSON responses, and a
 * Supabase client that acts AS THE SIGNED-IN USER (their JWT), so Row Level
 * Security applies to everything a function reads or writes.
 */
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

export function corsHeaders(origin: string | null, allowedOrigins: string | undefined): Record<string, string> {
  const allowList = (allowedOrigins ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const allowOrigin = allowList.length === 0 ? "*" : origin && allowList.includes(origin) ? origin : allowList[0]!;
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export interface UserContext {
  supabase: SupabaseClient;
  user: User;
}

/** Builds a user-scoped client from the Authorization header and verifies the token. */
export async function userContext(req: Request, supabaseUrl: string, anonKey: string): Promise<UserContext> {
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) throw new HttpError(401, "Please sign in.");
  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getUser(authorization.slice("Bearer ".length));
  if (error || !data.user) throw new HttpError(401, "Your session expired. Please sign in again.");
  return { supabase, user: data.user };
}

export type Handler = (body: Record<string, unknown>, ctx: UserContext) => Promise<unknown>;

export interface ServeEnv {
  supabaseUrl: string;
  anonKey: string;
  allowedOrigins?: string;
}

/** Wraps a handler with CORS, method checks, auth, JSON parsing and safe error output. */
export function makeRequestHandler(env: ServeEnv, handler: Handler) {
  return async (req: Request): Promise<Response> => {
    const cors = corsHeaders(req.headers.get("Origin"), env.allowedOrigins);
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, cors);
    try {
      const ctx = await userContext(req, env.supabaseUrl, env.anonKey);
      let body: Record<string, unknown> = {};
      try {
        const parsed = await req.json();
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) body = parsed as Record<string, unknown>;
      } catch {
        throw new HttpError(400, "Invalid request body.");
      }
      return json(await handler(body, ctx), 200, cors);
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status, cors);
      // Never echo internals, answers, or stack traces to the client.
      console.error("Unhandled function error:", error instanceof Error ? error.name : "unknown");
      return json({ error: "Something went wrong. Please try again." }, 500, cors);
    }
  };
}

/** Maps a PostgREST/Postgres error to a user-facing HttpError without leaking internals. */
export function dbError(error: { message?: string; code?: string } | null, fallback = "Could not save. Please try again."): never {
  const message = error?.message ?? "";
  // Messages raised deliberately by our SQL functions are written for users.
  if (error?.code === "P0001" || error?.code === "P0002") throw new HttpError(400, message || fallback);
  if (error?.code === "42501") throw new HttpError(403, "You don't have access to that.");
  throw new HttpError(400, fallback);
}
