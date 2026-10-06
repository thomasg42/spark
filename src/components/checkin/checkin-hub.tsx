"use client";

import Link from "next/link";
import { useApp } from "@/components/app-provider";
import { Badge, Card, LoadingBlock, Notice, PageHeader } from "@/components/ui";
import { CADENCE_LABELS, coupleCadence } from "@/lib/domain/cadence";
import { periodOf, weekStartOf } from "@/lib/domain/dates";
import { useLoad } from "@/lib/ui/hooks";

function Tile({ href, title, body, status }: { href: string; title: string; body: string; status: string }) {
  return (
    <Link href={href} className="block rounded-[var(--radius-card)] border border-line bg-surface p-5 transition hover:bg-surface-2 focus-visible:outline focus-visible:outline-3 focus-visible:outline-accent">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-xl font-bold text-ink">{title}</h2>
        <Badge>{status}</Badge>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
      <span className="mt-4 inline-flex min-h-11 items-center font-semibold text-accent-text">Open <span aria-hidden className="ml-1">→</span></span>
    </Link>
  );
}

export function CheckinHub() {
  const { backend, profile, partner } = useApp();
  const week = weekStartOf(new Date());
  const period = periodOf(new Date());
  const pulse = useLoad(() => backend.pulse.status(week), [backend, week]);
  const monthly = useLoad(() => backend.checkins.get(period), [backend, period]);
  const notes = useLoad(() => backend.notes.list(), [backend]);
  const partnerName = partner?.nickname || partner?.displayName || "your partner";
  const cadence = coupleCadence(profile?.preferredCadence ?? null, partner?.preferredCadence ?? null);
  const cadenceText = cadence.agreed ? CADENCE_LABELS[cadence.agreed] : `Waiting for ${partnerName}`;

  return (
    <>
      <PageHeader title="Check-in" subtitle="Small moments to notice how you are doing together." back={{ href: "/home/", label: "Home" }} />
      <Card className="mb-5 bg-accent-soft">
        <p className="text-sm font-semibold text-accent-text">Your shared rhythm</p>
        <p className="mt-1 text-2xl font-bold text-ink">{cadenceText}</p>
        <p className="mt-1 text-sm text-ink">You picked {profile ? CADENCE_LABELS[profile.preferredCadence] : "a cadence"}. {partnerName} picked {partner ? CADENCE_LABELS[partner.preferredCadence] : "their own pace"}.</p>
      </Card>
      {pulse.loading || monthly.loading || notes.loading ? <LoadingBlock label="Checking your shared moments…" /> : null}
      {pulse.error || monthly.error || notes.error ? <Notice tone="danger" title="Some check-in details could not load.">Try opening the card again in a moment.</Notice> : null}
      <div className="space-y-3">
        <Tile href="/checkin/pulse/" title="Weekly pulse" body={pulse.data?.iSubmitted ? pulse.data.partnerSubmitted ? "You are both in. See the shared trend." : `Your answer is in. Waiting for ${partnerName}.` : "Two quick scores for excitement and connection."} status={pulse.data?.partnerSubmitted ? "Both in" : pulse.data?.iSubmitted ? "Waiting" : "Open"} />
        <Tile href="/checkin/monthly/" title="Monthly check-in" body={monthly.data?.revealed ? "Your answers are open side by side." : monthly.data?.iSubmitted ? `Your answers stay hidden until ${partnerName} answers.` : "Five private questions, then a shared reflection."} status={monthly.data?.revealed ? "Revealed" : monthly.data?.iSubmitted ? "Waiting" : "Open"} />
        <Tile href="/checkin/notes/" title="Appreciation notes" body={notes.data?.length ? `${notes.data.length} shared note${notes.data.length === 1 ? "" : "s"}. Write one when you feel it.` : "A one-line thank-you or something you noticed."} status={notes.data?.length ? "Shared" : "Start one"} />
      </div>
    </>
  );
}
