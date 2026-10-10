"use client";
import Link from "next/link";
import { useState } from "react";
import { useApp } from "@/components/app-provider";
import { Button, Card, Notice, PageHeader, ProgressBar, SelectField, TextAreaField, TextField } from "@/components/ui";
import { useLoad } from "@/lib/ui/hooks";
import { GOAL_TYPE_LABELS, GOAL_TYPES, GOALS_UI_COPY, type GoalType } from "@shared/our-goals.ts";

export function GoalsScreen() {
  const { backend, partner, user } = useApp();
  const partnerName = partner?.nickname || partner?.displayName || "Your partner";
  const data = useLoad(() => backend.ourGoals.list(), [backend, user?.id]);
  const [type, setType] = useState<GoalType>("home");
  const [version, setVersion] = useState("");
  const [why, setWhy] = useState("");
  const [title, setTitle] = useState("");
  const [milestone, setMilestone] = useState("");
  const [myPart, setMyPart] = useState("");
  const [partnerPart, setPartnerPart] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [win, setWin] = useState("");
  const [weekPart, setWeekPart] = useState("");
  const [need, setNeed] = useState("");
  const [blocker, setBlocker] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await fn();
      await data.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Our Goals" subtitle={GOALS_UI_COPY[0]} back={{ href: "/plans/", label: "Plans" }} />
      <Notice className="mb-4" title="Where the rest of this lives">
        {GOALS_UI_COPY[5]} <Link className="font-semibold underline" href="/plans/dreams/">Open Shared Dreams</Link>. {GOALS_UI_COPY[6]}
      </Notice>
      {message ? <Notice className="mb-4" title={message} /> : null}
      <Card className="mb-4">
        <h2 className="font-bold">Start a goal together</h2>
        <SelectField label="Goal type" value={type} onChange={setType} options={GOAL_TYPES.map((value) => ({ value, label: GOAL_TYPE_LABELS[value] }))} />
        <Button className="mt-3" disabled={busy} onClick={() => void run(async () => { const card = await backend.ourGoals.start(type); setActiveId(card.id); })}>Create</Button>
      </Card>
      {(data.data ?? []).map((goal) => (
        <Card key={goal.id} className="mb-4">
          <p className="text-xs font-semibold text-muted">{GOAL_TYPE_LABELS[goal.type]} · {goal.status}</p>
          <h2 className="text-lg font-bold">{goal.title || "Waiting for both private versions"}</h2>
          {goal.status !== "drafting" ? <div className="my-3"><ProgressBar value={goal.progress} max={100} label="Milestone progress" /></div> : null}
          <h3 className="mt-3 font-bold">My version</h3>
          {goal.mine ? <p>{goal.mine.version} — {goal.mine.why}</p> : <p className="text-sm text-muted">You have not submitted a version yet.</p>}
          <h3 className="mt-3 font-bold">{partnerName}'s version</h3>
          {goal.partner ? <p>{goal.partner.version} — {goal.partner.why}</p> : <p className="text-sm text-muted">{GOALS_UI_COPY[1]}</p>}
          {goal.status === "drafting" && activeId === goal.id ? (
            <div className="mt-3">
              <TextAreaField label="My version of this goal" hint="You are typing only your private version. Your partner cannot read it until you have both submitted." value={version} onChange={setVersion} maxLength={200} />
              <TextAreaField label="Why it matters to me" hint="This stays private until both versions are in." value={why} onChange={setWhy} maxLength={400} />
              <Button className="mt-2" disabled={busy} onClick={() => void run(() => backend.ourGoals.submitDraft(goal.id, { version, why }).then(() => undefined))}>Submit my version</Button>
            </div>
          ) : null}
          {goal.status === "drafting" && activeId !== goal.id && !goal.mine ? <Button className="mt-3" variant="secondary" onClick={() => setActiveId(goal.id)}>Write my version</Button> : null}
          {goal.bothSubmitted && goal.status === "drafting" ? (
            <div className="mt-3">
              <p className="text-sm">Side by side is above. Write the one shared sentence you both mean.</p>
              <TextField label="Our goal, in plain words" hint="You are typing the merged goal both of you will see." value={title} onChange={setTitle} maxLength={160} />
              <TextField label="Milestone" value={milestone} onChange={setMilestone} maxLength={160} />
              <TextField label="My part" hint="What you will do toward this milestone." value={myPart} onChange={setMyPart} maxLength={200} />
              <TextField label={`${partnerName}'s part`} hint="What they will do. Both parts stay visible." value={partnerPart} onChange={setPartnerPart} maxLength={200} />
              <Button className="mt-2" disabled={busy} onClick={() => void run(() => backend.ourGoals.merge(goal.id, { title, milestones: [{ title: milestone, myPart, partnerPart }] }).then(() => undefined))}>Merge into one goal</Button>
            </div>
          ) : null}
          {goal.milestones.map((item) => (
            <div key={item.id} className="mt-3 border-t border-line pt-3">
              <p className="font-semibold">{item.title}</p>
              <p className="text-sm">My part: {item.myPart}</p>
              <p className="text-sm">{partnerName}'s part: {item.partnerPart}</p>
              {!item.done && goal.status === "active" ? <Button className="mt-2" variant="secondary" disabled={busy} onClick={() => void run(() => backend.ourGoals.setMilestone(goal.id, item.id, true).then(() => undefined))}>Mark complete</Button> : null}
              {item.done ? <p className="text-sm font-semibold text-ok">{GOALS_UI_COPY[3]}</p> : null}
            </div>
          ))}
          {goal.status === "active" ? (
            <div className="mt-4">
              <h3 className="font-bold">Weekly 10-minute check-in</h3>
              <p className="mb-2 text-sm text-muted">{GOALS_UI_COPY[2]}</p>
              <TextField label="One win" value={win} onChange={setWin} />
              <TextField label="My part this week" value={weekPart} onChange={setWeekPart} />
              <TextField label={`What I need from ${partnerName} this week`} hint="A specific ask, not a vague one." value={need} onChange={setNeed} />
              <TextField label="One blocker" value={blocker} onChange={setBlocker} />
              <Button className="mt-2" disabled={busy} onClick={() => void run(() => backend.ourGoals.checkin(goal.id, { week: new Date().toISOString().slice(0, 10), win, myPart: weekPart, need, blocker }).then(() => undefined))}>Save this week</Button>
            </div>
          ) : null}
          {goal.status === "active" || goal.status === "paused" ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {goal.status === "active" ? <Button variant="ghost" disabled={busy} onClick={() => void run(() => backend.ourGoals.setStatus(goal.id, "paused").then(() => undefined))}>Pause this goal</Button> : <Button variant="secondary" disabled={busy} onClick={() => void run(() => backend.ourGoals.setStatus(goal.id, "active").then(() => undefined))}>Resume</Button>}
              <Button variant="ghost" disabled={busy} onClick={() => void run(() => backend.ourGoals.setStatus(goal.id, "archived").then(() => undefined))}>Archive</Button>
            </div>
          ) : null}
          {goal.history.length ? <ol className="mt-3 list-decimal pl-5 text-sm text-muted">{goal.history.map((event) => <li key={event.id}>{event.note}</li>)}</ol> : null}
          <p className="mt-2 text-xs text-muted">{GOALS_UI_COPY[4]}</p>
        </Card>
      ))}
    </>
  );
}
