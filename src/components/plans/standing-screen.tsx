"use client";
/**
 * /plans/standing/: standing date nights (Module E). "Every Wednesday 6 to 9 PM:
 * date night, then we each go home." Both partners see them; the person who set
 * one can pause or remove it. "Add to my calendar" hands each person a calendar
 * file with a weekly repeat and a reminder, so the night shows up in their own
 * phone calendar (Spark sends no notifications of its own yet).
 */
import { useState } from "react";
import { useApp } from "@/components/app-provider";
import { Button, Card, EmptyState, Notice, PageHeader, SelectField, TextAreaField, TextField, useToast } from "@/components/ui";
import type { DateRule } from "@/lib/backend/types";
import { describeRule, MAX_RULES, RULE_NOTE_MAX, rulesToIcs, upcomingRules, WEEKDAYS } from "@/lib/domain/date-rules";
import { formatDate } from "@/lib/domain/dates";
import { useAction, useLoad } from "@/lib/ui/hooks";

const WEEKDAY_OPTIONS = WEEKDAYS.map((label, i) => ({ value: String(i), label }));

function downloadIcs(rules: DateRule[], partnerName: string) {
  const blob = new Blob([rulesToIcs(rules, new Date(), { partnerName })], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "spark-standing-dates.ics";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function StandingScreen() {
  const { backend, user, partner, nameOf } = useApp();
  const toast = useToast();
  const partnerName = partner?.nickname || partner?.displayName || "your partner";
  const list = useLoad(() => backend.dateRules.list(), [backend, user?.id]);
  const [title, setTitle] = useState("Date night");
  const [weekday, setWeekday] = useState("3");
  const [start, setStart] = useState("18:00");
  const [end, setEnd] = useState("21:00");
  const [note, setNote] = useState("");

  const add = useAction(async () => {
    await backend.dateRules.add({ title, weekday: Number(weekday), startTime: start, endTime: end, note });
    await list.reload();
    setNote("");
    toast.show(`Set: every ${WEEKDAYS[Number(weekday)]}. ${partnerName} sees it too.`);
    return true;
  });
  const change = useAction(async (rule: DateRule, patch: { active?: boolean } | "remove") => {
    if (patch === "remove") await backend.dateRules.remove(rule.id);
    else await backend.dateRules.update(rule.id, patch);
    await list.reload();
    return true;
  });

  const rules = list.data ?? [];
  const now = new Date();
  const next = new Map(upcomingRules(rules, now).map((u) => [u.rule.id, u]));
  const active = rules.filter((r) => r.active);

  return (
    <>
      <PageHeader title="Standing date night" subtitle="The same night every week, so time together happens without planning it from scratch." back={{ href: "/plans/", label: "Plans" }} />
      {list.error ? <Notice tone="danger" className="mb-3" title={list.error} /> : null}
      {change.error ? <Notice tone="danger" className="mb-3" title={change.error} /> : null}

      {list.data && rules.length === 0 ? (
        <EmptyState emoji="◷" title="No standing date yet" body="For example: every Wednesday, 6 to 9 PM. Date night, then you each wind down your own way." />
      ) : null}

      {rules.length ? (
        <ul className="space-y-3">
          {rules.map((rule) => {
            const upcoming = next.get(rule.id);
            const mine = rule.createdBy === user?.id;
            return (
              <li key={rule.id}>
                <Card as="article" className={rule.active ? undefined : "opacity-70"}>
                  <p className="text-sm font-semibold text-accent-text">{rule.active ? (upcoming?.tonight ? "Tonight" : upcoming ? `Next: ${formatDate(upcoming.on)}` : "") : "Paused"}</p>
                  <h2 className="mt-1 text-lg font-bold text-ink">{rule.title}</h2>
                  <p className="text-ink">{describeRule(rule)}</p>
                  {rule.note ? <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{rule.note}</p> : null}
                  <p className="mt-1 text-sm text-muted">Set by {nameOf(rule.createdBy)}</p>
                  {mine ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button variant="secondary" className="min-h-11" disabled={change.pending} onClick={() => void change.run(rule, { active: !rule.active })}>
                        {rule.active ? "Pause" : "Resume"}
                      </Button>
                      <Button variant="ghost" className="min-h-11" disabled={change.pending} onClick={() => void change.run(rule, "remove")}>
                        Remove
                      </Button>
                    </div>
                  ) : null}
                </Card>
              </li>
            );
          })}
        </ul>
      ) : null}

      {active.length ? (
        <Card className="mt-4 bg-accent-soft">
          <p className="font-semibold text-ink">Put it in your phone calendar</p>
          <p className="mt-1 text-sm text-ink">It repeats every week with a reminder an hour before. Each of you adds it to your own calendar.</p>
          <Button variant="secondary" className="mt-3" onClick={() => downloadIcs(active, partnerName)}>
            Add to my calendar
          </Button>
        </Card>
      ) : null}

      {rules.length < MAX_RULES ? (
        <Card className="mt-6" aria-labelledby="new-standing-title">
          <h2 id="new-standing-title" className="mb-3 text-xl font-bold text-ink">
            {rules.length ? "Add another" : "Set one up"}
          </h2>
          <TextField label="Name" value={title} onChange={setTitle} maxLength={120} />
          <SelectField label="Every" value={weekday} onChange={setWeekday} options={WEEKDAY_OPTIONS} />
          <div className="grid grid-cols-2 gap-3">
            <TextField label="From" type="time" value={start} onChange={setStart} />
            <TextField label="Until" type="time" value={end} onChange={setEnd} />
          </div>
          <TextAreaField label="The deal" optional value={note} onChange={setNote} rows={2} maxLength={RULE_NOTE_MAX} placeholder="Date night, then we each go home." />
          {add.error ? <Notice tone="danger" className="mb-3" title={add.error} /> : null}
          <Button loading={add.pending} onClick={() => void add.run()}>
            Save standing date
          </Button>
        </Card>
      ) : (
        <p className="mt-6 text-sm text-muted">You have {MAX_RULES} standing dates, the most Spark keeps. Remove one to add another.</p>
      )}
    </>
  );
}
