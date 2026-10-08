"use client";

import Link from "next/link";
import { useState } from "react";
import { useApp } from "@/components/app-provider";
import { Button, Card, ChoiceGroup, EmptyState, Notice, PageHeader, Badge, useToast } from "@/components/ui";
import { CATEGORY_COPY, ACTIVITY_CATEGORIES, type ActivityCategory } from "@/lib/domain/categories";
import { formatDate } from "@/lib/domain/dates";
import { useAction, useLoad } from "@/lib/ui/hooks";
import type { Activity } from "@/lib/backend/types";
import { DrillList, DrillRow } from "@/components/drill-row";
import { formatMoney } from "@/lib/domain/plans-rules";
import { describeRule, upcomingRules } from "@/lib/domain/date-rules";

/** Projects, Money and the shared calendar, above the activity log. */
function PlansHub() {
  const { backend, user, nameOf } = useApp();
  const toast = useToast();
  const data = useLoad(async () => {
    const [money, plans, rules] = await Promise.all([backend.money.list(), backend.datePlans.list(), backend.dateRules.list()]);
    return { money, plans, rules };
  }, [backend, user?.id]);
  const joint = data.data?.money.filter((g) => g.scope === "joint") ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = (data.data?.plans ?? []).filter((p) => p.plannedFor >= today).slice(0, 4);
  const standing = data.data ? upcomingRules(data.data.rules, new Date())[0] : undefined;
  return (
    <div className="mb-6">
      <DrillList label="Plans">
        <li><DrillRow href="/plans/dreams/" icon="↗" title="Shared Dreams & Support" status="Our future, weekly support, and Life Anchors" /></li>
        <li>
          <DrillRow href="/plans/standing/" icon="◷" title="Standing date night" status={standing ? `${describeRule(standing.rule)}${standing.tonight ? " · tonight" : ""}` : "The same night every week, set once"} />
        </li>
        <li>
          <DrillRow href="/plans/money/" icon="💵" title="Money" status={joint.length ? `${formatMoney(joint.reduce((n, g) => n + g.savedCents, 0))} saved together` : "Savings goals, yours and joint"} />
        </li>
      </DrillList>
      {upcoming.length ? (
        <Card className="mt-4" aria-labelledby="calendar-title">
          <h2 id="calendar-title" className="text-lg font-bold text-ink">On the calendar</h2>
          <ul className="mt-2 divide-y divide-line">
            {upcoming.map((p) => (
              <li key={p.id} className="flex min-h-12 items-center justify-between gap-3 py-2">
                <span>
                  <span className="block font-semibold text-ink">{p.title}</span>
                  <span className="text-sm text-muted">{formatDate(p.plannedFor)}{p.time ? ` · ${p.time}` : ""} · added by {nameOf(p.createdBy)}</span>
                </span>
                {p.createdBy === user?.id ? (
                  <Button variant="ghost" className="min-h-11 text-sm" onClick={async () => { try { await backend.datePlans.remove(p.id); await data.reload(); toast.show("Removed from the calendar."); } catch (e) { toast.show(e instanceof Error ? e.message : "Could not remove it.", "error"); } }}>Remove</Button>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

function Rating({ activity, mine, userId, partnerName, onRate, pending }: { activity: Activity; mine: number | undefined; userId: string | undefined; partnerName: string; onRate(value: number): void; pending: boolean }) {
  return (
    <fieldset className="mt-4 border-t border-line pt-3" disabled={pending}>
      <legend className="text-sm font-semibold text-ink">How was it?</legend>
      <div className="mt-2 flex items-center gap-3">
        <div className="flex gap-1" role="radiogroup" aria-label={`Your rating for ${activity.title}`}>
          {[1, 2, 3, 4, 5].map((n) => <label key={n} className="cursor-pointer"><input type="radio" name={`rating-${activity.id}`} value={n} checked={mine === n} onChange={() => onRate(n)} className="peer sr-only" aria-label={`${n} star${n === 1 ? "" : "s"}`} /><span className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-line text-xl text-ink peer-checked:border-accent peer-checked:bg-accent-soft" aria-hidden>{n <= (mine ?? 0) ? "★" : "☆"}</span></label>)}
        </div>
        <span className="text-sm text-muted">{partnerName}: {activity.ratings ? (Object.entries(activity.ratings).find(([id]) => id !== userId)?.[1] ?? "Not rated") : "Not rated"}</span>
      </div>
    </fieldset>
  );
}

export function ActivitiesScreen() {
  const { backend, user, partner } = useApp();
  const toast = useToast();
  const list = useLoad(() => backend.activities.list(), [backend, user?.id]);
  const [category, setCategory] = useState<ActivityCategory | "all">("all");
  const rate = useAction(async (id: string, value: number) => { await backend.activities.rate(id, value); await list.reload(); return true; });
  const partnerName = partner?.nickname || partner?.displayName || "Your partner";
  const grouped = new Map<string, Activity[]>();
  for (const activity of (list.data ?? []).filter((item) => category === "all" || item.category === category)) {
    const month = activity.happenedOn.slice(0, 7);
    grouped.set(month, [...(grouped.get(month) ?? []), activity]);
  }

  return (
    <>
      <PageHeader title="Activities" subtitle="Ideas to try, memories to keep." />
      <div className="mb-5"><DrillList label="Activity ideas"><li><DrillRow href="/activities/ideas/" icon="✦" title="Find an activity idea" status="Choose something to do together"/></li></DrillList></div>
      <div className="mb-5 overflow-x-auto pb-1"><ChoiceGroup legend="Filter activities" options={[{ value: "all", label: "All" }, ...ACTIVITY_CATEGORIES.map((value) => ({ value, label: CATEGORY_COPY[value].label }))]} value={category} onChange={setCategory as (value: string) => void} columns={2} name="activity-filter" /></div>
      {list.error ? <Notice tone="danger" title={list.error} /> : null}
      {rate.error ? <Notice tone="danger" className="mb-3" title={rate.error} /> : null}
      {list.data && grouped.size === 0 ? <EmptyState emoji="◷" title="No activities yet" body="Log a plan after you do it, then add both ratings when you feel like it." /> : null}
      <div className="space-y-7">{[...grouped.entries()].map(([month, activities]) => <section key={month} aria-labelledby={`month-${month}`}><h2 id={`month-${month}`} className="mb-3 text-xl font-bold text-ink">{new Date(`${month}-01T12:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" })}</h2><div className="space-y-3">{activities.map((activity) => <Card key={activity.id} as="article"><div className="flex items-start justify-between gap-3"><div><p className="text-sm text-muted">{formatDate(activity.happenedOn)}</p><h3 className="mt-1 text-lg font-bold text-ink">{activity.title}</h3></div><Badge>{CATEGORY_COPY[activity.category].emoji} {CATEGORY_COPY[activity.category].label}</Badge></div>{activity.note ? <p className="mt-3 whitespace-pre-wrap text-sm text-muted">{activity.note}</p> : null}<Rating activity={activity} mine={user ? activity.ratings[user.id] : undefined} userId={user?.id} partnerName={partnerName} pending={rate.pending} onRate={async (value) => { const result = await rate.run(activity.id, value); if (result) toast.show("Rating saved."); }} /></Card>)}</div></section>)}</div>
      <Link href="/activities/new/" className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-accent px-5 font-semibold text-accent-ink">Log an activity</Link>
    </>
  );
}

export function PlansScreen(){return <><PageHeader title="Plans" subtitle="Your upcoming time together, standing dates and shared goals."/><PlansHub/></>;}
