"use client";
/**
 * Loads the couple's living rhythm: the split of both picks, moved by every
 * revealed monthly check-in where both partners voted the same way.
 *
 * Votes are inside the encrypted check-in answers, so each revealed month is read
 * through backend.checkins.get (live: the Edge Function decrypts; partner votes are
 * only ever returned after both submitted). A revealed check-in is final, so each
 * month is read at most once per session.
 */
import { useCallback, useEffect, useState } from "react";
import type { Backend } from "@/lib/backend";
import { loadCheckinHistory } from "@/components/checkin/history";
import { useApp } from "@/components/app-provider";
import { agreedRhythm, type PaceRound, type Rhythm } from "@/lib/domain/rhythm";
import type { LifeChange } from "@/lib/domain/cadence";
import { boostingChanges } from "@/lib/domain/rhythm-breaker";

// Live mode only: a revealed month is final, so it is decrypted once per session.
// Demo reads are local and cheap, and a demo reset can rewrite history, so no cache.
const revealedRounds = new Map<string, Promise<PaceRound>>();
const HISTORY_LIMIT = 120;

async function readRound(backend: Backend, period: string): Promise<PaceRound> {
  const view = await backend.checkins.get(period);
  return { period, mine: view.mine?.pace ?? null, partner: view.revealed ? (view.partner?.pace ?? null) : null };
}

export async function loadPaceRounds(backend: Backend, userId: string): Promise<PaceRound[]> {
  const history = await loadCheckinHistory(backend, HISTORY_LIMIT);
  const revealed = history.filter((h) => h.revealed);
  const settled = await Promise.allSettled(
    revealed.map((h) => {
      if (backend.mode !== "live") return readRound(backend, h.period);
      const key = `${userId}:${h.period}`;
      let pending = revealedRounds.get(key);
      if (!pending) {
        pending = readRound(backend, h.period);
        revealedRounds.set(key, pending);
        pending.catch(() => revealedRounds.delete(key)); // retry a failed month next time
      }
      return pending;
    }),
  );
  // A month that failed to load is left out rather than resetting the whole rhythm.
  return settled.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
}

export function useRhythm() {
  const { backend, user, profile, partner, stage } = useApp();
  const [rounds, setRounds] = useState<PaceRound[] | null>(null);
  const [changes, setChanges] = useState<LifeChange[]>([]);
  const [error, setError] = useState(false);

  const reload = useCallback(async () => {
    if (stage !== "ready" || !user) return;
    // Life changes raise the rhythm for six weeks (Module E); a failed load just means no boost.
    void backend.lifeChanges.list().then(
      (list) => setChanges(boostingChanges(list).map((c) => ({ date: c.happenedOn }))),
      () => setChanges([]),
    );
    try {
      setRounds(await loadPaceRounds(backend, user.id));
      setError(false);
    } catch {
      setError(true);
      setRounds([]);
    }
  }, [backend, stage, user]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const rhythm: Rhythm = agreedRhythm(profile?.preferredCadence ?? null, partner?.preferredCadence ?? null, rounds ?? [], changes);
  return { rhythm, loading: rounds === null, error, reload };
}
