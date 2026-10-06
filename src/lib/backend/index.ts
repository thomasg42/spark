import { IS_LIVE } from "@/lib/config";
import { createDemoBackend } from "./demo";
import { createLiveBackend } from "./live";
import type { Backend } from "./types";

let instance: Backend | null = null;

/** The live Supabase backend when configured at build time, otherwise the demo. */
export function getBackend(): Backend {
  if (!instance) instance = IS_LIVE ? createLiveBackend() : createDemoBackend();
  return instance;
}

export * from "./types";
