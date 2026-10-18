"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useApp } from "@/components/app-provider";
import { Button, Notice } from "@/components/ui";
import type { AttentionSignal } from "@/lib/backend";
import { useAttentionSignals } from "./attention-signals";
import { AttentionNotification } from "./attention-notification";

/** Mounted in the shell, so a shared concern can be seen from any ready-state page. */
export function AttentionBanner() {
  const { backend, stage, user, profile, partner, couple } = useApp();
  if (stage !== "ready" || !user || !couple || profile?.userId !== user.id || !partner || partner.userId === user.id) return null;
  if (backend.demo && backend.demo.actingAs() !== user.id) return null;
  return <AttentionList key={`${couple.id}:${user.id}`} viewerId={user.id} coupleId={couple.id} />;
}

function AttentionList({ viewerId, coupleId }: { viewerId: string; coupleId: string }) {
  const { backend } = useApp();
  const { signals, error, loading, reload, valid, viewerIsCurrent } = useAttentionSignals(backend, viewerId, coupleId);
  const titleId = useId();
  if (!valid) return null;
  return (
    <>
    <AttentionNotification signals={signals} viewerId={viewerId} targetId={titleId} />
    <div aria-live="polite" aria-atomic="false">
      {loading ? <p role="status" className="mb-3 text-sm text-muted">Checking shared concerns…</p> : null}
      {error ? <Notice tone="danger" title="Shared concerns could not refresh"><p>Your shared alerts may be out of date.</p><Button variant="secondary" className="mt-2" onClick={() => void reload()}>Retry shared concerns</Button></Notice> : null}
      {signals.length ? (
        <section aria-labelledby={titleId} className="mb-5 rounded-[var(--radius-card)] border-2 border-red-600 bg-red-50 p-4 text-red-950">
          <h2 id={titleId} tabIndex={-1} className="text-xl font-bold"><span aria-hidden="true">!</span> Needs attention</h2>
          <p className="mt-1 text-sm">A personal perspective, not a verdict about either of you. Listen to each other and choose one small change together.</p>
          <ul className="mt-4 space-y-4">
            {signals.map((signal) => <AttentionItem key={signal.id} signal={signal} viewerId={viewerId} reload={reload} viewerIsCurrent={viewerIsCurrent} />)}
          </ul>
        </section>
      ) : null}
    </div>
    </>
  );
}

function AttentionItem({ signal, viewerId, reload, viewerIsCurrent }: { signal: AttentionSignal; viewerId: string; reload: () => Promise<void>; viewerIsCurrent: () => boolean }) {
  const { backend, partner } = useApp();
  const partnerName = partner?.nickname || partner?.displayName || "Your partner";
  const own = signal.authorId === viewerId;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const current = () => mounted.current && viewerIsCurrent();
  const description = own
    ? signal.subject === "self" ? "You shared that you may have stopped making an effort." : `You feel ${partnerName} may have stopped making an effort.`
    : signal.subject === "self" ? `${partnerName} shared that they may have stopped making an effort.` : `${partnerName} feels you may have stopped making an effort.`;

  async function act() {
    if (!current() || pending.current) return;
    pending.current = true;
    setSaving(true);
    setError(false);
    try {
      if (own) await backend.attention.resolve(signal.id, viewerId);
      else await backend.attention.acknowledge(signal.id, viewerId);
      if (current()) await reload();
    } catch {
      if (current()) {
        setError(true);
        await reload();
      }
    } finally {
      pending.current = false;
      if (current()) setSaving(false);
    }
  }

  return (
    <li className="border-t border-red-200 pt-3">
      <p className="font-semibold">{description}</p>
      <p className="mt-1 text-sm">{signal.acknowledgedAt ? own ? `${partnerName} acknowledged this.` : "You acknowledged this." : own ? `Waiting for ${partnerName} to acknowledge.` : "Acknowledging means you have seen this; you do not have to agree."}</p>
      {own ? <p className="mt-1 text-sm">After you have talked, you can mark your concern resolved.</p> : <p className="mt-1 text-sm">Only {partnerName} can mark this concern resolved.</p>}
      {error ? <p role="alert" className="mt-2 font-semibold">Could not confirm that change. It may already be saved; retrying is safe.</p> : null}
      {own || !signal.acknowledgedAt ? <Button variant="secondary" loading={saving} className="mt-3" onClick={() => void act()}>{own ? "Mark resolved" : "Acknowledge"}</Button> : null}
    </li>
  );
}
