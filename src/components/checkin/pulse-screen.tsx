"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/components/app-provider";
import { useRhythm } from "@/lib/ui/rhythm";
import { Button, Card, Notice, PageHeader, ScaleInput, useToast } from "@/components/ui";
import { useLoad, useAction } from "@/lib/ui/hooks";
import { periodOf, weekStartOf } from "@/lib/domain/dates";
import { trendNote, trendWeeks } from "./pulse-trend";
import { PulseChart, PulseLegend, PulseTable } from "./pulse-chart";

export function PulseScreen() {
  const { rhythm } = useRhythm();
  const { backend, user, partner } = useApp();
  const toast = useToast();
  const today = useMemo(() => new Date(), []);
  const week = weekStartOf(today);
  const history = useLoad(() => backend.pulse.history(8), [backend, user?.id]);
  const status = useLoad(() => backend.pulse.status(week), [backend, user?.id, week]);
  const current = history.data?.find((p) => p.userId === user?.id && p.weekStart === week);
  const [excitement, setExcitement] = useState<number | null>(null);
  const [connection, setConnection] = useState<number | null>(null);
  const [touched, setTouched] = useState(false);
  const save = useAction(async () => {
    if (excitement == null || connection == null) throw new Error("Choose both scores first.");
    const result = await backend.pulse.submit(week, excitement, connection);
    setTouched(true);
    await history.reload();
    await status.reload();
    return result;
  });
  const partnerName = partner?.nickname || partner?.displayName || "your partner";
  const mine = current ?? (touched ? { userId: user?.id ?? "", weekStart: week, excitement: excitement ?? 0, connection: connection ?? 0 } : null);
  const weeks = trendWeeks(history.data ?? [], user?.id ?? "", week, 8);

  return (
    <>
      <PageHeader title="Quick check-in" subtitle="Two quick scores at the pace you both agreed. No grades, no blame." back={{ href: "/checkin/", label: "Check-in" }} />
      {rhythm.current === "daily" || rhythm.current === "twice_weekly" ? (
        <p className="-mt-2 mb-4 text-sm text-muted">Spark keeps one score per week, so checking in again this week updates it.</p>
      ) : null}
      <Card>
        <p className="text-sm text-muted">Week of {new Date(`${week}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric" })}</p>
        <h2 className="mt-1 text-xl font-bold text-ink">How does it feel lately?</h2>
        <p className="mt-1 text-sm text-muted">Your scores stay yours until both of you answer this week.</p>
        <div className="mt-5">
          <ScaleInput legend="Excitement" hint="How much energy or anticipation is there?" value={excitement ?? mine?.excitement ?? null} onChange={setExcitement} minLabel="Low" maxLabel="High" name="pulse-excitement" />
          <ScaleInput legend="Connection" hint="How connected have you felt?" value={connection ?? mine?.connection ?? null} onChange={setConnection} minLabel="Distant" maxLabel="Close" name="pulse-connection" />
          <Button loading={save.pending} onClick={async () => { const result = await save.run(); if (result) toast.show("Your pulse is in."); }}>
            {status.data?.iSubmitted ? "Update my pulse" : "Save my pulse"}
          </Button>
          {save.error ? <Notice tone="danger" className="mt-3" title={save.error} /> : null}
          {status.data?.iSubmitted ? <p className="mt-3 text-sm text-muted" role="status">{status.data.partnerSubmitted ? "You are both in." : `Waiting for ${partnerName}.`}</p> : null}
        </div>
      </Card>
      <section aria-labelledby="pulse-trend-title" className="mt-6">
        <h2 id="pulse-trend-title" className="text-xl font-bold text-ink">Your eight-week trend</h2>
        <p className="mt-1 text-sm text-muted">Your partner's scores appear only for weeks you both answered.</p>
        <Card className="mt-3">
          <PulseLegend myLabel="You" partnerLabel={partnerName} />
          <div className="mt-5 space-y-6">
            <PulseChart weeks={weeks} metric="excitement" title="Excitement" myLabel="You" partnerLabel={partnerName} />
            <PulseChart weeks={weeks} metric="connection" title="Connection" myLabel="You" partnerLabel={partnerName} />
          </div>
          <details className="mt-5 rounded-2xl border border-line bg-surface-2 p-4">
            <summary className="min-h-11 cursor-pointer pt-2 font-semibold text-ink">View the data table</summary>
            <div className="mt-3"><PulseTable weeks={weeks} myLabel="You" partnerLabel={partnerName} /></div>
          </details>
          {trendNote(weeks) ? <Notice tone="info" className="mt-5" title="A gentle read">{trendNote(weeks)}</Notice> : null}
        </Card>
      </section>
    </>
  );
}
