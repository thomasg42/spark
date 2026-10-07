"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useApp } from "@/components/app-provider";
import { Avatar, Button, Card, ChoiceGroup, Notice, useToast } from "@/components/ui";
import type { PickableCadence } from "@/lib/backend/types";
import { CADENCE_LABELS, PICKABLE_CADENCES } from "@/lib/domain/cadence";
import { useAction } from "@/lib/ui/hooks";
import { CadenceLadder } from "./cadence-ladder";
import { useRhythm } from "@/lib/ui/rhythm";
import { cadenceSavedMessage, personName, previewAgreed, revisitInfo, rhythmView } from "./view-model";

/** Check-in rhythm: both picks side by side, the split, the ladder, and the quarterly revisit. */
export function RhythmCard() {
  const { backend, profile, partner, couple, setProfile, setCouple } = useApp();
  const toast = useToast();
  const headingId = useId();
  const pickerId = useId();
  const pickerRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [focusPicker, setFocusPicker] = useState(false);
  const [draft, setDraft] = useState<PickableCadence | null>(null);
  const today = useMemo(() => new Date(), []);

  const partnerName = personName(partner);
  const myName = personName(profile, "You");
  const mine = profile?.preferredCadence ?? null;
  const partnerPick = partner?.preferredCadence ?? null;
  const view = rhythmView(mine, partnerPick, partnerName);
  const { rhythm } = useRhythm();
  const votesNote =
    rhythm.current && rhythm.steps !== 0
      ? `Your picks split to ${view.agreedLabel?.toLowerCase() ?? "a starting rhythm"}. Your monthly check-in votes since then moved it ${Math.abs(rhythm.steps)} step${Math.abs(rhythm.steps) === 1 ? "" : "s"} ${rhythm.steps < 0 ? "sooner" : "later"}.`
      : null;
  const revisit = revisitInfo(couple?.cadenceReviewedAt, today);

  const save = useAction(async (next: PickableCadence) => {
    const saved = await backend.profiles.update({ preferredCadence: next });
    setProfile(saved);
    if (revisit.due) {
      // Changing a pick during the quarterly revisit counts as revisiting it.
      try {
        setCouple(await backend.couple.markCadenceReviewed());
      } catch {
        // The prompt simply stays; the pick itself is saved.
      }
    }
    return saved;
  });

  const keep = useAction(async () => {
    const updated = await backend.couple.markCadenceReviewed();
    setCouple(updated);
    return updated;
  });

  useEffect(() => {
    if (!open || !focusPicker) return;
    const target = pickerRef.current?.querySelector<HTMLInputElement>("input:checked") ?? pickerRef.current?.querySelector<HTMLInputElement>("input");
    target?.focus();
    setFocusPicker(false);
  }, [open, focusPicker]);

  if (!profile) return null;

  const onPick = async (next: PickableCadence) => {
    if (save.pending) return;
    if (next === profile.preferredCadence) {
      setDraft(null);
      return;
    }
    setDraft(next);
    const saved = await save.run(next);
    setDraft(null);
    if (saved) toast.show(cadenceSavedMessage(saved.preferredCadence, partnerPick));
  };

  const onKeep = async () => {
    const updated = await keep.run();
    if (updated) {
      toast.show("Great. Spark will check in again in a few months.");
      requestAnimationFrame(() => nextRef.current?.focus());
    }
  };

  const openPicker = () => {
    setOpen(true);
    setFocusPicker(true);
  };

  return (
    <Card as="section" aria-labelledby={headingId} className="fade-up">
      <h2 id={headingId} className="text-xl font-bold text-ink">
        Check-in rhythm
      </h2>
      <p className="mt-1 text-sm text-muted">How often you two sit down for a relationship check-in.</p>

      <dl className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-line bg-surface-2 p-3">
          <dt className="flex items-center gap-2 text-sm text-muted">
            <Avatar name={myName} size="sm" />
            You picked
          </dt>
          <dd className="mt-1.5 text-lg font-bold leading-snug text-ink">{view.mineLabel}</dd>
        </div>
        <div className="rounded-2xl border border-line bg-surface-2 p-3">
          <dt className="flex min-w-0 items-center gap-2 text-sm text-muted">
            <Avatar name={partnerName} size="sm" />
            <span className="min-w-0 truncate">{partnerName} picked</span>
          </dt>
          <dd className="mt-1.5 text-lg font-bold leading-snug text-ink">{view.partnerLabel ?? <span className="font-semibold text-muted">Not yet</span>}</dd>
        </div>
      </dl>

      <div className="reveal mt-3 rounded-2xl bg-accent-soft p-4 text-center">
        <p className="text-sm font-semibold text-accent-text">Your shared rhythm</p>
        {view.agreedLabel ? (
          <p key={view.agreed} className="pop mt-1 font-display text-3xl font-bold text-ink">
            {rhythm.current && rhythm.steps !== 0 ? CADENCE_LABELS[rhythm.current] : view.agreedLabel}
          </p>
        ) : (
          <p className="mt-1 font-display text-2xl font-bold text-ink">Waiting for {partnerName}</p>
        )}
        <p className="mx-auto mt-1 max-w-md text-sm text-ink">{view.explanation}</p>
        {votesNote ? <p className="mx-auto mt-2 max-w-md text-sm font-semibold text-accent-text">{votesNote}</p> : null}
      </div>

      <CadenceLadder steps={view.steps} partnerName={partnerName} />

      <div className="mt-5 border-t border-line pt-4">
        {revisit.due ? (
          <div className="fade-up rounded-2xl bg-surface-2 p-4">
            <p className="font-semibold text-ink">It&apos;s been a few months. Still feel right?</p>
            <p className="mt-1 text-sm text-muted">Spark asks about your rhythm every few months. Life changes, and so can this.</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Button loading={keep.pending} onClick={onKeep}>
                Yes, keep it
              </Button>
              <Button variant="secondary" aria-expanded={open} aria-controls={pickerId} onClick={openPicker}>
                Change my pick
              </Button>
            </div>
            {keep.error ? <Notice tone="danger" className="mt-3" title={keep.error} /> : null}
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            {revisit.nextLabel ? (
              <p ref={nextRef} tabIndex={-1} className="text-sm text-muted">
                <span aria-hidden>🗓️ </span>Next revisit around {revisit.nextLabel}
              </p>
            ) : (
              <span />
            )}
            <Button variant="ghost" aria-expanded={open} aria-controls={pickerId} onClick={() => setOpen((o) => !o)}>
              {open ? "Done" : "Change my pick"}
            </Button>
          </div>
        )}

        <div id={pickerId} ref={pickerRef} hidden={!open} className="mt-3">
          <ChoiceGroup
            legend="How often would you like check-ins?"
            hint={`Saves right away. ${partnerName} sees your pick, and Spark splits the difference.`}
            options={PICKABLE_CADENCES.map((c) => {
              const together = previewAgreed(c, partnerPick);
              return { value: c, label: CADENCE_LABELS[c], description: together ? `Together: ${CADENCE_LABELS[together]}` : undefined };
            })}
            value={draft ?? mine}
            onChange={(v: PickableCadence) => void onPick(v)}
          />
          <p role="status" className="min-h-5 text-sm text-muted">
            {save.pending ? "Saving…" : ""}
          </p>
          {save.error ? <Notice tone="danger" className="mt-2" title="That didn't save.">{save.error}</Notice> : null}
        </div>
      </div>
    </Card>
  );
}
