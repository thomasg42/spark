"use client";
import Link from "next/link";
import { useApp } from "@/components/app-provider";
import { RequireStage } from "@/components/require-stage";
import { Badge, Card, ProgressBar } from "@/components/ui";
import { CADENCE_LABELS, cadenceReviewDue, coupleCadence } from "@/lib/domain/cadence";
import { periodOf, upcomingAnniversaries, weekStartOf } from "@/lib/domain/dates";
import { SOCIAL_COPY, socialAgreement } from "@/lib/domain/social";
import { useLoad } from "@/lib/ui/hooks";
import { SECTIONS, sectionProgress } from "@shared/questionnaires.ts";

/** Loads a dashboard card's data; any failure just hides that card. */
function useCard<T>(load: () => Promise<T>) {
  const state = useLoad(async () => {
    try {
      return await load();
    } catch {
      return null;
    }
  });
  return state.data;
}

function Tile({ href, emoji, title, body, badge }: { href: string; emoji: string; title: string; body: string; badge?: string | null }) {
  return (
    <Link href={href} className="block rounded-[var(--radius-card)] border border-line bg-surface p-4 transition hover:bg-surface-2">
      <span className="flex items-center justify-between">
        <span className="text-2xl" aria-hidden>
          {emoji}
        </span>
        {badge ? <Badge>{badge}</Badge> : null}
      </span>
      <span className="mt-2 block font-bold text-ink">{title}</span>
      <span className="block text-sm text-muted">{body}</span>
    </Link>
  );
}

function Dashboard() {
  const { backend, profile, partner, couple } = useApp();
  const today = new Date();
  const week = weekStartOf(today);
  const period = periodOf(today);

  const pulse = useCard(() => backend.pulse.status(week));
  const checkin = useCard(() => backend.checkins.get(period));
  const answers = useCard(() => backend.answers.list());
  const story = useCard(() => backend.story.list());
  const moments = useCard(() => backend.moments.list());
  const notes = useCard(() => backend.notes.list());

  const cadence = coupleCadence(profile?.preferredCadence ?? null, partner?.preferredCadence ?? null, [], today);
  const social = socialAgreement(profile?.socialSharing ?? null, partner?.socialSharing ?? null);
  const reviewDue = couple ? cadenceReviewDue(couple.cadenceReviewedAt, today) : false;
  const saved = Object.fromEntries((answers ?? []).map((a) => [a.questionId, a]));
  const progress = SECTIONS.map((s) => sectionProgress(s, saved));
  const totalQ = progress.reduce((n, p) => n + p.total, 0);
  const doneQ = progress.reduce((n, p) => n + p.answered + p.skipped, 0);
  const anniversaries = story ? upcomingAnniversaries(story, today, 30) : [];
  const partnerName = partner?.nickname || partner?.displayName || "your partner";
  const latestNote = (notes ?? []).find((n) => n.authorId === partner?.userId);
  const unseenMoments = (moments ?? []).filter((m) => m.authorId === partner?.userId && !m.reactions[profile?.userId ?? ""]).length;

  return (
    <div className="fade-up">
      <h1 className="text-3xl font-bold text-ink">Hi, {profile?.nickname || profile?.displayName}</h1>
      <p className="mt-1 text-muted">Here's what's up with you and {partnerName}.</p>

      {anniversaries[0] ? (
        <Card className="mt-5 bg-accent-soft">
          <p className="text-sm font-semibold text-accent-text">Coming up</p>
          <p className="mt-1 text-lg font-bold text-ink">
            {anniversaries[0].entry.title}: {anniversaries[0].years} {anniversaries[0].years === 1 ? "year" : "years"}
          </p>
          <p className="text-sm text-ink">{anniversaries[0].inDays === 0 ? "Today!" : `In ${anniversaries[0].inDays} ${anniversaries[0].inDays === 1 ? "day" : "days"}`}</p>
        </Card>
      ) : null}

      <div className="mt-5 grid grid-cols-2 gap-3">
        <Tile href="/checkin/pulse/" emoji="💓" title="Weekly pulse" body={pulse?.iSubmitted ? (pulse.partnerSubmitted ? "Both in. See your trend." : `Waiting for ${partnerName}`) : "Two quick taps"} badge={pulse && !pulse.iSubmitted ? "This week" : null} />
        <Tile href="/checkin/monthly/" emoji="🗓️" title="Monthly check-in" body={checkin?.revealed ? "Revealed. Read together." : checkin?.iSubmitted ? `Hidden until ${partnerName} answers` : "Five private questions"} badge={checkin && !checkin.iSubmitted ? "Open" : checkin?.revealed ? "New" : null} />
        <Tile href="/moments/" emoji="✦" title="Moments" body={unseenMoments ? `${unseenMoments} from ${partnerName}` : "Share a clip or photo"} badge={unseenMoments ? "New" : null} />
        <Tile href="/plans/ideas/" emoji="💡" title="Date ideas" body="Five fresh ideas, no repeats" />
      </div>

      {latestNote ? (
        <Card className="mt-4">
          <p className="text-sm font-semibold text-muted">A note from {partnerName}</p>
          <p className="mt-1 text-lg text-ink">“{latestNote.body}”</p>
          <Link href="/checkin/notes/" className="mt-2 inline-flex min-h-11 items-center font-semibold text-accent-text">
            Send one back
          </Link>
        </Card>
      ) : null}

      {answers ? (
        <Card className="mt-4">
          <div className="flex items-center justify-between">
            <p className="font-bold text-ink">Getting to know you</p>
            <span className="text-sm text-muted">
              {doneQ}/{totalQ}
            </span>
          </div>
          <p className="mb-3 mt-1 text-sm text-muted">Short, private question sets. Only you ever see your answers.</p>
          <ProgressBar value={doneQ} max={totalQ} label="Onboarding questions answered" />
          <Link href="/us/questions/" className="mt-3 inline-flex min-h-11 items-center font-semibold text-accent-text">
            {doneQ === 0 ? "Start the first set" : doneQ === totalQ ? "Review your answers" : "Continue"}
          </Link>
        </Card>
      ) : null}

      <Card className="mt-4">
        <p className="font-bold text-ink">Your agreements</p>
        <dl className="mt-2 space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Check-in rhythm</dt>
            <dd className="text-right font-semibold text-ink">{cadence.agreed ? CADENCE_LABELS[cadence.agreed] : "Pending"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Social media</dt>
            <dd className="text-right font-semibold text-ink">{social.agreed ? SOCIAL_COPY[social.agreed].label : "Pending"}</dd>
          </div>
        </dl>
        <Link href="/us/agreements/" className="mt-2 inline-flex min-h-11 items-center font-semibold text-accent-text">
          {reviewDue ? "Time for your quarterly revisit" : "See both choices"}
        </Link>
      </Card>
    </div>
  );
}

export default function HomePage() {
  return (
    <RequireStage allow="ready">
      <Dashboard />
    </RequireStage>
  );
}
