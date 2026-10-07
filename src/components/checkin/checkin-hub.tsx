"use client";

import { useApp } from "@/components/app-provider";
import { DrillList, DrillRow } from "@/components/drill-row";
import { Card, LoadingBlock, Notice, PageHeader } from "@/components/ui";
import { CADENCE_LABELS } from "@/lib/domain/cadence";
import { periodOf, weekStartOf } from "@/lib/domain/dates";
import { useLoad } from "@/lib/ui/hooks";
import { useRhythm } from "@/lib/ui/rhythm";

export function CheckinHub() {
  const { backend, profile, partner } = useApp();
  const week = weekStartOf(new Date());
  const period = periodOf(new Date());
  const pulse = useLoad(() => backend.pulse.status(week), [backend, week]);
  const monthly = useLoad(() => backend.checkins.get(period), [backend, period]);
  const notes = useLoad(() => backend.notes.list(), [backend]);
  const partnerName = partner?.nickname || partner?.displayName || "your partner";
  const { rhythm } = useRhythm();
  const cadenceText = rhythm.current ? CADENCE_LABELS[rhythm.current] : `Waiting for ${partnerName}`;
  const moved = rhythm.steps === 0 ? null : rhythm.steps < 0 ? `Your check-in votes moved it ${-rhythm.steps} step${rhythm.steps === -1 ? "" : "s"} sooner.` : `Your check-in votes moved it ${rhythm.steps} step${rhythm.steps === 1 ? "" : "s"} later.`;

  return (
    <>
      <PageHeader title="Check-in" subtitle="Small moments to notice how you are doing together." />
      <Card className="mb-5 bg-accent-soft">
        <p className="text-sm font-semibold text-accent-text">Your shared rhythm</p>
        <p className="mt-1 text-2xl font-bold text-ink">{cadenceText}</p>
        <p className="mt-1 text-sm text-ink">How often quick check-ins pop up. You picked {profile ? CADENCE_LABELS[profile.preferredCadence].toLowerCase() : "a cadence"}, {partnerName} picked {partner ? CADENCE_LABELS[partner.preferredCadence].toLowerCase() : "their own pace"}.{moved ? ` ${moved}` : ""} Each monthly check-in asks if it should come sooner or later.</p>
      </Card>
      {pulse.loading || monthly.loading || notes.loading ? <LoadingBlock label="Checking your shared moments…" /> : null}
      {pulse.error || monthly.error || notes.error ? <Notice tone="danger" title="Some check-in details could not load.">Try opening the card again in a moment.</Notice> : null}
      <DrillList label="Check-ins">
        <li><DrillRow href="/checkin/pulse/" icon="💓" title="Quick check-in" status={pulse.data?.iSubmitted ? pulse.data.partnerSubmitted ? "You are both in. See the shared trend." : `Your answer is in. Waiting for ${partnerName}.` : "Two quick scores for excitement and connection."} badge={pulse.data?.iSubmitted ? (pulse.data.partnerSubmitted ? "Both in" : "Waiting") : pulse.data?.partnerSubmitted ? `${partnerName} is in` : "Open"} /></li>
        <li><DrillRow href="/checkin/monthly/" icon="🗓️" title="Monthly check-in" status={monthly.data?.revealed ? "Your answers are open side by side." : monthly.data?.iSubmitted ? `Your answers stay hidden until ${partnerName} answers.` : "Five private questions, then a shared reflection."} badge={monthly.data?.revealed ? "Revealed" : monthly.data?.iSubmitted ? "Waiting" : "Open"} /></li>
        <li><DrillRow href="/checkin/notes/" icon="💌" title="Appreciation notes" status={notes.data?.length ? `${notes.data.length} shared note${notes.data.length === 1 ? "" : "s"}. Write one when you feel it.` : "A one-line thank-you or something you noticed."} badge={notes.data?.length ? "Shared" : "Start one"} /></li>
      </DrillList>
    </>
  );
}
