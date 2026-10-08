import { createClient, FunctionsHttpError, type PostgrestError, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/config";
import { UserFacingError } from "../types";

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        flowType: "pkce",
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: "spark-auth",
      },
    });
  }
  return client;
}

export async function requireUserId(): Promise<string> {
  const { data } = await supabase().auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new UserFacingError("Please sign in again.");
  return id;
}

let coupleCache: { userId: string; coupleId: string } | null = null;

/** The signed-in user's couple id (RLS only returns their own membership row). */
export async function requireCoupleId(): Promise<string> {
  const userId = await requireUserId();
  if (coupleCache?.userId === userId) return coupleCache.coupleId;
  const { data, error } = await supabase().from("couple_members").select("couple_id").eq("user_id", userId).maybeSingle();
  if (error) fail(error, "Could not load your couple.");
  if (!data) throw new UserFacingError("Pair with your partner first.");
  coupleCache = { userId, coupleId: data.couple_id as string };
  return coupleCache.coupleId;
}

export function resetCoupleCache() {
  coupleCache = null;
}

/** Converts a PostgREST error into a safe, friendly error. */
export function fail(error: PostgrestError | null, fallback: string): never {
  if (error?.code === "P0001" || error?.code === "P0002") throw new UserFacingError(error.message || fallback);
  if (error?.code === "42501") throw new UserFacingError("You don't have access to that.");
  if (error?.code === "23514" && /18/.test(error.message)) throw new UserFacingError("Spark is only for adults 18 and older.");
  throw new UserFacingError(fallback);
}

/** Calls an Edge Function as the signed-in user and returns its JSON body. */
export async function invoke<T>(fn: "answers" | "checkins" | "date-ideas" | "buddy" | "shared-dreams" | "intimacy", body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase().functions.invoke(fn, { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      try {
        const payload = (await error.context.json()) as { error?: string };
        if (payload?.error) throw new UserFacingError(payload.error);
      } catch (inner) {
        if (inner instanceof UserFacingError) throw inner;
      }
    }
    throw new UserFacingError("Could not reach Spark's server. Check your connection and try again.");
  }
  return data as T;
}
