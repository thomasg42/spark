"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useApp } from "@/components/app-provider";
import { CrisisResources } from "@/components/crisis-resources";
import { Button, Card, ChoiceGroup, Notice, PageHeader, TextAreaField, useToast } from "@/components/ui";
import { useAction, useLoad } from "@/lib/ui/hooks";
import { periodOf, formatPeriod } from "@/lib/domain/dates";
import { CHECKIN_QUESTIONS, PACE_QUESTION, type CheckinAnswers, type PaceVote } from "@shared/checkin-questions.ts";
import { CADENCE_LABELS } from "@/lib/domain/cadence";
import { paceOutcome } from "@/lib/domain/rhythm";
import { useRhythm } from "@/lib/ui/rhythm";

const paceLabel = (vote: PaceVote | undefined | null) => PACE_QUESTION.options.find((o) => o.value === vote)?.label ?? "No vote";
import { answersMentionCrisis } from "@shared/checkin-summary.ts";

const blank = (): CheckinAnswers => ({ best: "", closest: "", distant: "", more_of: "", talk_about: "" });

export function MonthlyScreen() {
  const params = useSearchParams();
  const { backend, user, partner } = useApp();
  const toast = useToast();
  const periodParam = params.get("period");
  const period = periodParam && /^\d{4}-(0[1-9]|1[0-2])$/.test(periodParam) ? periodParam : periodOf(new Date());
  const view = useLoad(() => backend.checkins.get(period), [backend, user?.id, period]);
  const [answers, setAnswers] = useState<CheckinAnswers>(blank);
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (view.data?.mine) { setAnswers(view.data.mine); setSaved(view.data.iSubmitted); } }, [view.data]);
  const submit = useAction(async () => {
    const result = await backend.checkins.submit(period, answers);
    setSaved(true);
    await view.reload();
    void reloadRhythm();
    return result;
  });
  const { rhythm, reload: reloadRhythm } = useRhythm();
  const partnerName = partner?.nickname || partner?.displayName || "your partner";
  const crisis = answersMentionCrisis(answers) || Boolean(view.data?.summary?.safetyFlag);

  return (
    <>
      <PageHeader title={formatPeriod(period)} subtitle="Monthly check-in" back={{ href: "/checkin/", label: "Check-in" }} />
      <Card>
        <h2 className="text-xl font-bold text-ink">Five private questions</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">Your answers stay hidden from {partnerName} until you have both submitted. Answer what feels useful and leave anything blank.</p>
        <div className="mt-5 space-y-1">
          {CHECKIN_QUESTIONS.map((q) => <TextAreaField key={q.id} label={q.prompt} hint={q.placeholder} value={answers[q.id]} onChange={(value) => setAnswers((old) => ({ ...old, [q.id]: value }))} maxLength={1000} rows={3} disabled={saved} />)}
        </div>
        {!saved ? (
          <div className="mt-2">
            <ChoiceGroup
              legend={PACE_QUESTION.prompt}
              hint={`This sets how often quick check-ins pop up between monthly ones${rhythm.current ? ` (now ${CADENCE_LABELS[rhythm.current].toLowerCase()})` : ""}. It only changes when you both vote the same way.`}
              options={PACE_QUESTION.options.map((o) => ({ value: o.value, label: o.label, description: o.description }))}
              value={answers.pace ?? null}
              onChange={(vote: PaceVote) => setAnswers((old) => ({ ...old, pace: vote }))}
            />
          </div>
        ) : (
          <p className="mb-3 text-sm text-ink">
            <span className="font-semibold">Your pace vote:</span> {paceLabel(answers.pace)}
          </p>
        )}
        {!saved ? <Button loading={submit.pending} onClick={async () => { const result = await submit.run(); if (result) toast.show(`Saved privately. ${partnerName} cannot see it yet.`); }}>Submit privately</Button> : <Notice tone="success" title={view.data?.revealed ? "You are both in." : `Hidden until ${partnerName} answers.`}>Your answers are saved privately.</Notice>}
        {submit.error ? <Notice tone="danger" className="mt-3" title={submit.error} /> : null}
      </Card>
      {view.data?.revealed && view.data.partner && view.data.mine ? <>
        <section aria-labelledby="answers-title" className="mt-6">
          <h2 id="answers-title" className="text-xl font-bold text-ink">Read together</h2>
          <div className="mt-3 space-y-3">{CHECKIN_QUESTIONS.map((q) => <Card key={q.id}><h3 className="font-semibold text-ink">{q.prompt}</h3><div className="mt-3 grid gap-3 sm:grid-cols-2"><div className="rounded-2xl bg-surface-2 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted">You</p><p className="mt-1 whitespace-pre-wrap text-ink">{view.data!.mine![q.id] || "No answer"}</p></div><div className="rounded-2xl bg-accent-soft p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted">{partnerName}</p><p className="mt-1 whitespace-pre-wrap text-ink">{view.data!.partner![q.id] || "No answer"}</p></div></div></Card>)}</div>
        </section>
        <Card className="mt-6" aria-labelledby="pace-title">
          <h2 id="pace-title" className="text-xl font-bold text-ink">Your check-in pace</h2>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-surface-2 p-4"><dt className="text-xs font-semibold uppercase tracking-wide text-muted">You</dt><dd className="mt-1 font-semibold text-ink">{paceLabel(view.data.mine.pace)}</dd></div>
            <div className="rounded-2xl bg-accent-soft p-4"><dt className="text-xs font-semibold uppercase tracking-wide text-muted">{partnerName}</dt><dd className="mt-1 font-semibold text-ink">{paceLabel(view.data.partner.pace)}</dd></div>
          </dl>
          <p className="mt-3 text-ink">{paceOutcome(view.data.mine.pace, view.data.partner.pace, partnerName, rhythm.rounds.find((r) => r.period === period))}</p>
          {rhythm.current ? <p className="mt-1 text-sm text-muted">Quick check-ins now: {CADENCE_LABELS[rhythm.current].toLowerCase()}.</p> : null}
        </Card>
        {view.data.summary ? <Card className="mt-6" aria-labelledby="summary-title"><h2 id="summary-title" className="text-xl font-bold text-ink">A shared reflection</h2><p className="mt-1 text-sm text-muted">{view.data.summary.source === "fallback" ? "A simple reflection from Spark's built-in summary." : "A reflection generated by Claude from the answers you both submitted."}</p><h3 className="mt-4 font-semibold text-ink">What overlaps</h3><ul className="mt-2 list-disc space-y-1 pl-5 text-ink">{view.data.summary.overlaps.map((item) => <li key={item}>{item}</li>)}</ul>{view.data.summary.gaps.length ? <><h3 className="mt-4 font-semibold text-ink">What is worth noticing</h3><ul className="mt-2 list-disc space-y-1 pl-5 text-ink">{view.data.summary.gaps.map((item) => <li key={item}>{item}</li>)}</ul></> : null}<h3 className="mt-4 font-semibold text-ink">A question to carry forward</h3><p className="mt-1 text-ink">{view.data.summary.conversationStarter}</p></Card> : null}
      </> : null}
      {crisis ? <CrisisResources urgent className="mt-6" /> : null}
    </>
  );
}
