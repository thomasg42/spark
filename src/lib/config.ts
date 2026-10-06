/** Build-time configuration. Empty Supabase settings build the self-contained demo. */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
export const IS_LIVE = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/** Absolute URL for a path inside the app, honoring the GitHub Pages base path. */
export function appUrl(path: string): string {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}${BASE_PATH}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Path for files in /public, honoring the base path. */
export function asset(path: string): string {
  return `${BASE_PATH}${path.startsWith("/") ? path : `/${path}`}`;
}
