"use client";
/**
 * "What Buddy may share": every answer you've given, with its share level.
 * Off the table is the default. A hint is shared only after you approve its
 * exact words. Open shares the answer as you see it here, and Spark flags it
 * when your answer changes so the shared copy never drifts without you knowing.
 */
import { useState } from "react";
import { useApp } from "@/components/app-provider";
import { Badge, Button, Card, EmptyState, LoadingBlock, Notice, PageHeader, TextAreaField, useToast } from "@/components/ui";
import { ButtonLink } from "@/components/ui";
import { messageOf, type BuddyShare, type SavedAnswer, type ShareLevel } from "@/lib/backend/types";
import { useLoad } from "@/lib/ui/hooks";
import { readAiConsent } from "@/lib/buddy/ai-consent";
import { cx } from "@/lib/ui/cx";
import { answerToText, SHARE_COPY, SHARE_LEVELS } from "@shared/buddy.ts";
import { findQuestion, SECTIONS } from "@shared/questionnaires.ts";

export function SharingScreen() {
  const { backend, user, partner } = useApp();
  const partnerName = partner?.nickname || partner?.displayName || "your partner";
  const data = useLoad(async () => {
    const [answers, shares] = await Promise.all([backend.answers.list(), backend.buddy.shares()]);
    return { answers, shares };
  }, [backend, user?.id]);

  const answered = (data.data?.answers ?? []).filter((a) => !a.skipped && a.value !== null);
  const shareOf = new Map((data.data?.shares ?? []).map((s) => [s.questionId, s]));
  const counts = { hint: 0, open: 0 };
  for (const s of data.data?.shares ?? []) counts[s.level] += 1;

  return (
    <>
      <PageHeader
        title="What Buddy may share"
        subtitle={`${partnerName}'s Buddy can only ever see what you allow here. Everything starts off the table.`}
        back={{ href: "/us/buddy/", label: "Spark Buddy" }}
      />
      <Card className="mb-5 bg-accent-soft">
        <ul className="space-y-2 text-sm text-ink">
          {SHARE_LEVELS.map((level) => (
            <li key={level}>
              <span className="font-semibold">{SHARE_COPY[level].label}:</span> {SHARE_COPY[level].body}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-ink">If {partnerName} turns on AI for their Buddy, the items you share here are sent to Claude so it can help {partnerName}. Off-the-table answers never are.</p>
        {data.data ? (
          <p className="mt-3 text-sm font-semibold text-ink">
            Right now: {counts.open} open, {counts.hint} {counts.hint === 1 ? "hint" : "hints"}, everything else off the table.
          </p>
        ) : null}
      </Card>
      {data.error ? <Notice tone="danger" title={data.error} /> : null}
      {data.loading && !data.data ? <LoadingBlock /> : null}
      {data.data && answered.length === 0 ? (
        <EmptyState emoji="🌱" title="Nothing answered yet" body="Answer a few questions with your Buddy first. Then come back to choose what it may pass on." action={<ButtonLink href="/us/buddy/">Talk to Buddy</ButtonLink>} />
      ) : null}
      {SECTIONS.map((section) => {
        const rows = answered.filter((a) => a.section === section.key);
        if (!rows.length) return null;
        return (
          <section key={section.key} className="mb-6" aria-labelledby={`share-${section.key}`}>
            <h2 id={`share-${section.key}`} className="mb-3 text-xl font-bold text-ink">
              <span aria-hidden>{section.emoji}</span> {section.title}
            </h2>
            <div className="space-y-3">
              {rows.map((answer) => (
                <ShareRow
                  key={answer.questionId}
                  answer={answer}
                  share={shareOf.get(answer.questionId) ?? null}
                  onChanged={(next) => {
                    data.setData((d) => {
                      if (!d) return d;
                      const shares = d.shares.filter((x) => x.questionId !== answer.questionId);
                      return { ...d, shares: next ? [...shares, next] : shares };
                    });
                  }}
                />
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}

function ShareRow({ answer, share, onChanged }: { answer: SavedAnswer; share: BuddyShare | null; onChanged(next: BuddyShare | null): void }) {
  const { backend, user } = useApp();
  const toast = useToast();
  const question = findQuestion(answer.questionId)?.question;
  const [hint, setHint] = useState<string | null>(share?.level === "hint" ? share.text : null);
  const [editingHint, setEditingHint] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!question) return null;
  const current = answerToText(question, answer.value!);
  const level: ShareLevel = share?.level ?? "private";
  const stale = share?.level === "open" && share.text !== current;

  async function apply(next: ShareLevel, hintText?: string | null) {
    setBusy(true);
    setError(null);
    try {
      const saved = await backend.buddy.share(question!.id, next, hintText ?? null);
      onChanged(saved);
      setEditingHint(false);
      toast.show(next === "private" ? "Off the table." : next === "hint" ? "Hint approved." : "Shared openly.");
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  async function startHint() {
    setEditingHint(true);
    if (hint) return;
    setBusy(true);
    try {
      const aiOn = backend.mode === "live" && !!user && readAiConsent(user.id) === true;
      setHint((await backend.buddy.draftHint(question!.id, aiOn)).hint);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card as="article" className="p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="font-semibold text-ink">{question.prompt}</p>
        <Badge tone={level === "private" ? "muted" : "accent"}>{SHARE_COPY[level].short}</Badge>
      </div>
      <p className="mt-1 text-sm text-muted">Your answer: {current}</p>
      {share ? (
        <p className="mt-2 rounded-2xl bg-surface-2 px-3 py-2 text-sm text-ink">
          <span className="font-semibold">Their Buddy may see:</span> “{share.text}”
        </p>
      ) : null}
      {stale ? (
        <Notice className="mt-2" title="Your answer changed since you shared it.">
          <Button variant="secondary" className="mt-2 min-h-11" loading={busy} onClick={() => void apply("open")}>
            Share the new answer
          </Button>
        </Notice>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={`Share level for: ${question.prompt}`}>
        {SHARE_LEVELS.map((l) => (
          <button
            key={l}
            type="button"
            disabled={busy}
            aria-pressed={level === l}
            onClick={() => (l === "hint" ? void startHint() : void apply(l))}
            className={cx("min-h-11 rounded-full border px-4 text-sm font-semibold", level === l ? "border-accent bg-accent text-accent-ink" : "border-line bg-surface text-ink hover:bg-surface-2")}
          >
            {SHARE_COPY[l].short}
          </button>
        ))}
      </div>
      {editingHint && hint !== null ? (
        <div className="mt-3">
          <TextAreaField label="Your hint (only these words are shared)" value={hint} onChange={setHint} rows={3} maxLength={280} />
          <div className="flex gap-2">
            <Button loading={busy} onClick={() => void apply("hint", hint)}>
              Approve hint
            </Button>
            <Button variant="ghost" onClick={() => setEditingHint(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
      {error ? <Notice tone="danger" className="mt-2" title={error} /> : null}
    </Card>
  );
}
