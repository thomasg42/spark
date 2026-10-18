"use client";

import { useRef, useState, type FormEvent } from "react";
import { useApp } from "@/components/app-provider";
import { Button, Card, ChoiceGroup, Notice } from "@/components/ui";
import { ATTENTION_REFRESH_EVENT } from "./attention-signals";
import { useAttentionViewer } from "./attention-viewer";

type Answer = "yes" | "no" | "skip";
type Subject = "self" | "partner";
const choices = [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }, { value: "skip", label: "Skip" }] as const;

/** Keep a draft tied to the person answering, including during a demo-persona switch. */
export function AttentionForm() {
  const { backend, stage, user, profile, partner, couple } = useApp();
  if (stage !== "ready" || !user || !couple || profile?.userId !== user.id || !partner || partner.userId === user.id) return null;
  if (backend.demo && backend.demo.actingAs() !== user.id) return null;
  return <AttentionDraft key={`${couple.id}:${user.id}`} viewerId={user.id} />;
}

function AttentionDraft({ viewerId }: { viewerId: string }) {
  const { backend, partner } = useApp();
  const partnerName = partner?.nickname || partner?.displayName || "your partner";
  const [answers, setAnswers] = useState<Record<Subject, Answer | null>>({ self: null, partner: null });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shared, setShared] = useState(false);
  const { valid, current } = useAttentionViewer(backend, viewerId);
  const pending = useRef(false);
  const selected = (Object.keys(answers) as Subject[]).filter((subject) => answers[subject] === "yes");

  function answer(subject: Subject, value: Answer) {
    setAnswers((previous) => ({ ...previous, [subject]: value }));
    setError(null);
    setShared(false);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!current() || pending.current || !selected.length) return;
    pending.current = true;
    setSaving(true);
    setError(null);
    setShared(false);
    let completed = 0;
    try {
      for (const subject of selected) {
        if (!current()) return;
        await backend.attention.raise(subject, viewerId);
        if (!current()) return;
        completed += 1;
        setAnswers((previous) => ({ ...previous, [subject]: null }));
      }
      if (current()) setShared(true);
    } catch {
      if (current()) {
        setError(completed ? "One concern was shared. We could not confirm the other; it may already be visible. Your remaining Yes is still selected; retrying is safe." : "Could not confirm sharing. Your concern may already be visible to your partner. Your Yes is still selected; retrying is safe.");
        window.dispatchEvent(new Event(ATTENTION_REFRESH_EVENT));
      }
    } finally {
      pending.current = false;
      if (current()) setSaving(false);
    }
  }

  if (!valid) return null;
  return (
    <Card className="mb-5" aria-labelledby="attention-checkin-title">
      <h2 id="attention-checkin-title" className="text-xl font-bold text-ink">Are we still making an effort?</h2>
      <p className="mt-2 text-sm text-muted">Feeling safe, secure, and comfortable together is good. This is about effort, curiosity, or growth slipping—not about needing more tension.</p>
      <form onSubmit={submit} className="mt-4">
        <fieldset disabled={saving}>
          <legend className="sr-only">Your perspective on effort</legend>
          <ChoiceGroup<Answer> legend="Have I become too comfortable and stopped making an effort?" value={answers.self} onChange={(value: Answer) => answer("self", value)} options={[...choices]} />
          <ChoiceGroup<Answer> legend="Do I feel my partner has become too comfortable and stopped making an effort?" value={answers.partner} onChange={(value: Answer) => answer("partner", value)} options={[...choices]} />
        </fieldset>
        <p className="mb-3 text-sm text-muted">Only Yes answers are shared when you press the button. No and skipped answers create no alert. Nothing is shared just by selecting an answer.</p>
        <p className="mb-4 text-sm font-medium text-ink">Submitted Yes answers appear for both of you immediately, independently of your monthly check-in answers.</p>
        {error ? <Notice tone="danger" title="Sharing could not be confirmed">{error}</Notice> : null}
        {shared ? <p role="status" className="mb-3 text-sm font-semibold text-ink">Shared with {partnerName}. Your concern is now visible to both of you.</p> : null}
        <Button type="submit" loading={saving} disabled={!selected.length}>Share with {partnerName} now</Button>
      </form>
    </Card>
  );
}
