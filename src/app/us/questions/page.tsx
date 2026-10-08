"use client";
import Link from "next/link";
import { useApp } from "@/components/app-provider";
import { toSavedMap, type SavedMap } from "@/components/questions/flow";
import { PrivacyExplainer } from "@/components/questions/privacy-explainer";
import { RequireStage } from "@/components/require-stage";
import { Badge, Button, LoadingBlock, Notice, PageHeader, ProgressBar, SectionTitle } from "@/components/ui";
import { useLoad } from "@/lib/ui/hooks";
import { NOT_THERAPY_NOTE } from "@shared/crisis.ts";
import { LATER_SECTIONS, SECTIONS, sectionProgress, type Section } from "@shared/questionnaires.ts";

function SectionCard({ section, saved }: { section: Section; saved: SavedMap }) {
  const p = sectionProgress(section, saved);
  const touched = p.answered + p.skipped;
  const status = touched === 0 ? "Not started" : p.done ? "All done" : `${touched} of ${p.total} done`;
  const cta = touched === 0 ? "Start" : p.done ? "Review" : "Continue";
  const nextSitting = !p.done && touched > 0 ? section.sittings[p.nextSittingIndex] : undefined;
  const sittings = `${section.sittings.length} short ${section.sittings.length === 1 ? "sitting" : "sittings"}`;
  return (
    <li>
      <Link
        href={`/us/questions/${section.key}/`}
        aria-label={`${section.title}. ${status}. ${cta}.`}
        className="block rounded-[var(--radius-card)] border border-line bg-surface p-4 transition hover:bg-surface-2"
      >
        <div className="flex items-start gap-3">
          <span className="text-2xl" aria-hidden>
            {section.emoji}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-ink">{section.title}</span>
              {p.done ? <Badge>Done</Badge> : <span className="text-xs text-muted">{sittings}</span>}
            </div>
            <p className="text-sm text-muted">{section.blurb}</p>
          </div>
        </div>
        <div className="mt-3">
          <ProgressBar value={touched} max={p.total} label={`${section.title} progress`} />
        </div>
        <div className="mt-2 flex items-center justify-between gap-3 text-sm">
          <span className="min-w-0 text-muted">
            {status}
            {nextSitting ? `. Next up: ${nextSitting.title}` : ""}
          </span>
          <span className="shrink-0 font-semibold text-accent-text">
            {cta} <span aria-hidden>›</span>
          </span>
        </div>
      </Link>
    </li>
  );
}

function QuestionsHub() {
  const { backend, user } = useApp();
  const owner = user?.id ?? null;
  // Tag the result with whose answers it is, so a demo partner switch never flashes the other person's progress.
  const { data, error, loading, reload } = useLoad(async () => ({ owner, list: await backend.answers.list() }), [owner]);
  const ready = !loading && data !== null && data.owner === owner;
  const saved = ready ? toSavedMap(data.list) : {};

  return (
    <>
      <PageHeader title="Questions" subtitle="Short, private sets about you. Go at your own pace." back={{ href: "/us/", label: "Us" }} />

      <PrivacyExplainer className="fade-up" />
      <p className="my-5 text-muted">Getting started with Buddy? <Link href="/plans/dreams/anchors/" className="font-semibold text-accent-text underline">Choose Driven, Warm, or Balanced coaching</Link> and optionally add your Life Anchors. You can change them anytime.</p>

      <SectionTitle id="question-sets">Your question sets</SectionTitle>
      <p className="-mt-1 mb-3 text-sm text-muted">A handful of questions per sitting. Progress saves after every answer, and you can stop any time.</p>

      {error ? (
        <>
          <Notice tone="danger" title="Your progress didn't load.">
            {error}
          </Notice>
          <Button variant="secondary" className="mt-3" onClick={() => void reload()}>
            Try again
          </Button>
        </>
      ) : !ready ? (
        <LoadingBlock label="Loading your progress…" />
      ) : (
        <ul aria-labelledby="question-sets" className="space-y-3">
          {SECTIONS.map((section) => (
            <SectionCard key={section.key} section={section} saved={saved} />
          ))}
        </ul>
      )}

      <SectionTitle id="coming-later">Coming later</SectionTitle>
      <ul aria-labelledby="coming-later" className="grid gap-3 sm:grid-cols-2">
        {LATER_SECTIONS.map((later) => (
          <li key={later.key} className="rounded-[var(--radius-card)] border border-dashed border-line bg-surface-2 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 font-bold text-ink">
                <span aria-hidden>{later.emoji}</span>
                {later.title}
              </span>
              <Badge tone="muted">Coming later</Badge>
            </div>
            <p className="mt-1 text-sm text-muted">{later.note}</p>
          </li>
        ))}
      </ul>

      <p className="mt-8 text-center text-xs text-muted">
        {NOT_THERAPY_NOTE}{" "}
        <Link href="/support/" className="inline-flex min-h-11 items-center font-semibold text-accent-text underline underline-offset-2">
          Find support
        </Link>
      </p>
    </>
  );
}

export default function QuestionsPage() {
  return (
    <RequireStage allow="ready">
      <QuestionsHub />
    </RequireStage>
  );
}
