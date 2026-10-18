"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AttentionSignal, Backend } from "@/lib/backend";
import { useAttentionViewer } from "./attention-viewer";

export const ATTENTION_REFRESH_MS = 45_000;
export const ATTENTION_REFRESH_EVENT = "spark-attention-refresh";

/** One shared-alert reader, with coalesced updates and no data retained across viewers. */
export function useAttentionSignals(backend: Backend, viewerId: string, coupleId: string) {
  const [signals, setSignals] = useState<AttentionSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const reloadRef = useRef<() => Promise<void>>(async () => {});
  const { valid, current: viewerIsCurrent } = useAttentionViewer(backend, viewerId);

  useEffect(() => {
    let active = true;
    let inFlight: Promise<void> | null = null;
    let queued = false;
    const current = () => active && viewerIsCurrent();
    const reload = (): Promise<void> => {
      if (!current()) {
        if (active) setSignals([]);
        return Promise.resolve();
      }
      if (inFlight) {
        queued = true;
        return inFlight;
      }
      inFlight = (async () => {
        do {
          queued = false;
          try {
            const result = await backend.attention.list();
            if (!current()) return;
            setSignals(result.filter((signal) => signal.coupleId === coupleId && !signal.resolvedAt));
            setError(false);
          } catch {
            if (current()) setError(true);
          } finally {
            if (current()) setLoading(false);
          }
        } while (queued && current());
      })().finally(() => { inFlight = null; });
      return inFlight;
    };
    reloadRef.current = reload;
    const onChange = () => { void reload(); };
    const onVisible = () => { if (document.visibilityState === "visible") void reload(); };
    const unsubscribe = backend.attention.subscribe(onChange);
    void reload();
    window.addEventListener("focus", onChange);
    window.addEventListener(ATTENTION_REFRESH_EVENT, onChange);
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(onVisible, ATTENTION_REFRESH_MS);
    return () => {
      active = false;
      unsubscribe();
      window.clearInterval(timer);
      window.removeEventListener("focus", onChange);
      window.removeEventListener(ATTENTION_REFRESH_EVENT, onChange);
      document.removeEventListener("visibilitychange", onVisible);
      reloadRef.current = async () => {};
    };
  }, [backend, viewerId, coupleId, viewerIsCurrent]);

  const reload = useCallback(() => reloadRef.current(), []);
  return { signals: valid ? signals : [], loading: valid && loading, error: valid && error, reload, valid, viewerIsCurrent };
}
