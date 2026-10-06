"use client";
import Link from "next/link";
import { useId, useState } from "react";
import { useApp } from "@/components/app-provider";
import { Avatar, Button, Card, ChoiceGroup, Notice, useToast } from "@/components/ui";
import type { SocialLevel } from "@/lib/backend/types";
import { SOCIAL_COPY, SOCIAL_LEVELS } from "@/lib/domain/social";
import { cx } from "@/lib/ui/cx";
import { useAction } from "@/lib/ui/hooks";
import { personName, SOCIAL_RULE, socialSavedMessage, socialView, type SocialSide } from "./view-model";

/** Social media agreement: both choices side by side; the agreement is always the more private one. */
export function SocialCard() {
  const { backend, profile, partner, setProfile } = useApp();
  const toast = useToast();
  const headingId = useId();
  const pickerId = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<SocialLevel | null>(null);

  const partnerName = personName(partner);
  const myName = personName(profile, "You");
  const mine = profile?.socialSharing ?? null;
  const partnerPick = partner?.socialSharing ?? null;
  const view = socialView(mine, partnerPick, partnerName);

  const save = useAction(async (next: SocialLevel) => {
    const saved = await backend.profiles.update({ socialSharing: next });
    setProfile(saved);
    return saved;
  });

  if (!profile) return null;

  // Nothing picked yet: the picker is simply shown, no extra tap needed.
  const pickerVisible = open || !mine;

  const onPick = async (next: SocialLevel) => {
    if (save.pending) return;
    if (next === mine) {
      setDraft(null);
      return;
    }
    // A first pick keeps the choices on screen (with a "Done" button) so focus is not lost.
    if (!mine) setOpen(true);
    setDraft(next);
    const saved = await save.run(next);
    setDraft(null);
    if (saved?.socialSharing) toast.show(socialSavedMessage(saved.socialSharing, partnerPick));
  };

  return (
    <Card as="section" aria-labelledby={headingId} className="fade-up mt-4">
      <h2 id={headingId} className="text-xl font-bold text-ink">
        Social media
      </h2>
      <p className="mt-1 text-sm text-muted">How public you each want your relationship to be online. You can both see both choices.</p>

      <ul className="mt-4 grid grid-cols-2 gap-3" aria-label="Both choices">
        {view.sides.map((side) => (
          <SocialTile key={side.who} side={side} name={side.who === "mine" ? myName : partnerName} usedMorePrivate={view.usedMorePrivate} />
        ))}
      </ul>

      {view.state === "agreed" ? (
        <div className="reveal mt-3 rounded-2xl bg-accent-soft p-4 text-center">
          <p className="text-sm font-semibold text-accent-text">Your agreement</p>
          <p key={view.agreed} className="pop mt-1 font-display text-2xl font-bold text-ink">
            {view.agreedLabel}
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm text-ink">{view.agreedDetail}</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted">{view.statusBody}</p>
        </div>
      ) : (
        <div className="mt-3 rounded-2xl border border-dashed border-line p-4 text-center">
          <p className="font-display text-lg font-bold text-ink">{view.statusTitle}</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">{view.statusBody}</p>
        </div>
      )}

      <p className="mt-3 text-sm text-ink">{SOCIAL_RULE}</p>

      <div className="mt-4 border-t border-line pt-4">
        {mine ? (
          <div className="flex justify-end">
            <Button variant="ghost" aria-expanded={open} aria-controls={pickerId} onClick={() => setOpen((o) => !o)}>
              {open ? "Done" : "Change my choice"}
            </Button>
          </div>
        ) : null}
        <div id={pickerId} hidden={!pickerVisible} className={cx(mine ? "mt-3" : null)}>
          <ChoiceGroup
            legend={mine ? "How public do you want your relationship online?" : "Pick yours: how public do you want your relationship online?"}
            hint={`Saves right away. ${partnerName} sees your choice. Pick what feels right for you.`}
            options={SOCIAL_LEVELS.map((level) => ({ value: level, label: SOCIAL_COPY[level].label, description: SOCIAL_COPY[level].detail }))}
            value={draft ?? mine}
            onChange={(v: SocialLevel) => void onPick(v)}
          />
          <p role="status" className="min-h-5 text-sm text-muted">
            {save.pending ? "Saving…" : ""}
          </p>
          {save.error ? <Notice tone="danger" className="mt-2" title="That didn't save.">{save.error}</Notice> : null}
        </div>
      </div>

      <p className="mt-4 rounded-2xl bg-surface-2 px-4 py-3 text-sm text-ink">
        <span aria-hidden>✦ </span>
        Moments is a private place for the stuff you&apos;d otherwise post.{" "}
        <Link href="/moments/" className="inline-flex min-h-11 items-center font-semibold text-accent-text underline">
          Open Moments
        </Link>
      </p>
    </Card>
  );
}

function SocialTile({ side, name, usedMorePrivate }: { side: SocialSide; name: string; usedMorePrivate: boolean }) {
  return (
    <li className={cx("rounded-2xl border p-3", side.isAgreement ? "border-accent bg-accent-soft" : "border-line bg-surface-2")}>
      <p className="flex min-w-0 items-center gap-2 text-sm text-muted">
        <Avatar name={name} size="sm" />
        <span className="min-w-0 truncate">{side.heading}</span>
      </p>
      {side.label ? (
        <>
          <p className="mt-1.5 font-bold leading-snug text-ink">{side.label}</p>
          <p className="mt-0.5 text-xs text-muted sm:text-sm">{side.detail}</p>
        </>
      ) : (
        <p className="mt-1.5 font-semibold text-muted">Not chosen yet</p>
      )}
      {side.isAgreement ? (
        <p className="mt-2">
          <span className="inline-flex items-center rounded-full bg-surface px-2.5 py-0.5 text-xs font-semibold text-accent-text">
            {usedMorePrivate ? "More private, so we use this" : "Same choice"}
          </span>
        </p>
      ) : null}
    </li>
  );
}
