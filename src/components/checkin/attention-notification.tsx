"use client";

import { useEffect, useRef, useState } from "react";
import type { AttentionSignal } from "@/lib/backend";

/** A viewer-scoped notice stays visible even when the detailed banner is above the viewport. */
export function AttentionNotification({ signals, viewerId, targetId }: { signals: AttentionSignal[]; viewerId: string; targetId: string }) {
  const seen = useRef(new Set<string>());
  const sequence = useRef(0);
  const [notice, setNotice] = useState<number | null>(null);
  useEffect(() => {
    const unseen = signals.filter((signal) => signal.authorId !== viewerId && !signal.acknowledgedAt && !seen.current.has(signal.id));
    if (!unseen.length) return;
    unseen.forEach((signal) => seen.current.add(signal.id));
    setNotice(++sequence.current);
  }, [signals, viewerId]);
  useEffect(() => {
    if (notice === null) return;
    const timer = window.setTimeout(() => setNotice(null), 6_000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  if (notice === null || !signals.some((signal) => signal.authorId !== viewerId && !signal.acknowledgedAt)) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4">
      <div className="pointer-events-auto flex max-w-md items-center gap-2 rounded-2xl border-2 border-red-600 bg-red-50 p-3 text-red-950 shadow-lg">
        <div>
          <p role="status" className="text-sm font-bold">Needs attention: your partner shared a concern.</p>
          <button type="button" className="min-h-11 text-sm font-semibold underline" onClick={() => {
            const heading = document.getElementById(targetId);
            heading?.scrollIntoView?.({ behavior: "smooth", block: "start" });
            heading?.focus({ preventScroll: true });
            setNotice(null);
          }}>Review shared concern</button>
        </div>
        <button type="button" className="min-h-11 min-w-11 rounded-full text-xl" aria-label="Dismiss concern notice" onClick={() => setNotice(null)}>×</button>
      </div>
    </div>
  );
}
