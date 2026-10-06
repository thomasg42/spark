/**
 * Months that already have a monthly check-in, newest first. The Backend contract
 * has no list call, so this picks the matching live/demo helper. Both read only
 * metadata (which months exist and whose responses RLS shows), never answers.
 */
import type { Backend } from "@/lib/backend";
import { checkinHistory as demoHistory } from "@/lib/backend/demo/checkins";
import { checkinHistory as liveHistory, type CheckinHistoryEntry } from "@/lib/backend/live/checkins";

export type { CheckinHistoryEntry };

export function loadCheckinHistory(backend: Backend, limit = 12): Promise<CheckinHistoryEntry[]> {
  return backend.mode === "live" ? liveHistory(limit) : demoHistory(limit);
}
