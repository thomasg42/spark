"use client";
import Link from "next/link";
import { useState } from "react";
import { useApp } from "@/components/app-provider";
import { Button, Card, Notice, PageHeader, SelectField, TextAreaField, TextField } from "@/components/ui";
import { useLoad } from "@/lib/ui/hooks";
import {
  BOUNDARY_CATEGORIES,
  BOUNDARY_CATEGORY_LABELS,
  BOUNDARY_PRINCIPLE,
  BOUNDARY_RESOURCES,
  STARTER_TEMPLATES,
  type BoundaryCategory,
  type BoundaryRecord,
  type BoundaryReview,
} from "@shared/boundaries.ts";

function Dot() {
  return <span className="ml-1 inline-block h-2 w-2 rounded-full bg-accent align-middle" aria-label="New" />;
}

export function AgreementsTabs({ current, unseen = 0 }: { current: "rhythm" | "boundaries"; unseen?: number }) {
  const tab = (href: string, id: "rhythm" | "boundaries", label: string) => (
    <Link href={href} aria-current={current === id ? "page" : undefined} className={`rounded-full border px-4 py-3 text-sm font-semibold ${current === id ? "bg-accent text-accent-ink" : "border-line bg-surface"}`}>
      {label}
      {id === "boundaries" && unseen > 0 ? <Dot /> : null}
    </Link>
  );
  return (
    <nav aria-label="Agreements sections" className="mb-5 flex flex-wrap gap-2">
      {tab("/us/agreements/", "rhythm", "Rhythm and social")}
      {tab("/us/agreements/boundaries/", "boundaries", "Boundaries")}
    </nav>
  );
}

function BoundaryCard({ row, mine, partnerName, ack, onAck }: { row: BoundaryRecord; mine: boolean; partnerName: string; ack?: string; onAck?: (response: "understood" | "discuss") => void }) {
  return (
    <Card className="mb-3">
      <p className="text-xs font-semibold text-muted">{BOUNDARY_CATEGORY_LABELS[row.category]} · {row.status === "draft" ? "Draft, only you" : row.status === "shared" ? "Shared" : "Archived"}</p>
      <h3 className="mt-1 font-bold">What matters to me</h3>
      <p>{row.text}</p>
      <h3 className="mt-3 font-bold">What I'll do if it's crossed</h3>
      <p>{row.myAction}</p>
      {!mine && row.status === "shared" ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant={ack === "understood" ? "primary" : "secondary"} onClick={() => onAck?.("understood")}>Understood</Button>
          <Button variant="secondary" onClick={() => onAck?.("discuss")}>Let's talk about it</Button>
          {ack ? <p className="w-full text-sm text-muted">Your response: {ack === "understood" ? "Understood. This is not a vote." : `A calm conversation with ${partnerName}.`}</p> : <p className="w-full text-sm text-muted">Understanding is the goal. There is no reject.</p>}
        </div>
      ) : null}
    </Card>
  );
}

export function BoundariesScreen() {
  const { backend, partner, user } = useApp();
  const partnerName = partner?.nickname || partner?.displayName || "Your partner";
  const data = useLoad(() => backend.boundaries.list().then(async (rows) => { await backend.boundaries.markSeen(); return rows; }), [backend, user?.id]);
  const [category, setCategory] = useState<BoundaryCategory>("honesty");
  const [text, setText] = useState("");
  const [myAction, setMyAction] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [review, setReview] = useState<BoundaryReview | null>(null);
  const [agreement, setAgreement] = useState("");
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

  function coach() {
    const result = backend.boundaries.review(text, myAction);
    setReview(result);
    if (result.kind === "reword") {
      setText(result.text);
      setMyAction(result.myAction);
      setMessage("Suggested wording is in the boxes. Nothing is saved until you tap Save draft.");
    }
  }

  const rows = data.data;
  return (
    <>
      <PageHeader title="Boundaries" subtitle={BOUNDARY_PRINCIPLE} back={{ href: "/us/agreements/", label: "Agreements" }} />
      <AgreementsTabs current="boundaries" />
      <Notice className="mb-4" title="What this is">{BOUNDARY_PRINCIPLE} Sharing is a separate tap. Spark does not send a push, email, or text.</Notice>
      {review?.kind === "crisis" ? (
        <Notice tone="danger" className="mb-4" title="Support comes first">
          <ul className="space-y-1">{BOUNDARY_RESOURCES.map((item) => <li key={item.id}><span className="font-semibold">{item.name}.</span> {item.detail}</li>)}</ul>
          Coaching on this item stops here. Nothing was saved.
        </Notice>
      ) : null}
      {message ? <Notice className="mb-4" title={message} /> : null}
      <Card className="mb-4">
        <h2 className="text-lg font-bold">Write one of mine</h2>
        <p className="mb-3 text-sm text-muted">You are typing your own boundary. The first box is what matters to you. The second box is what you will do. It stays a draft until you tap Share.</p>
        <SelectField label="Category" value={category} onChange={setCategory} options={BOUNDARY_CATEGORIES.map((value) => ({ value, label: BOUNDARY_CATEGORY_LABELS[value] }))} />
        <TextAreaField label="What matters to me" hint="One line about you, not a rule for them." value={text} onChange={setText} maxLength={280} />
        <TextAreaField label="What I'll do if it's crossed" hint="Your own action. Example: I'll step away and we'll talk when we're calm." value={myAction} onChange={setMyAction} maxLength={280} />
        <div className="mt-3 flex flex-wrap gap-2">
          <Button disabled={busy || review?.kind === "crisis"} onClick={() => void run(async () => { await backend.boundaries.save({ id: editing ?? undefined, category, text, myAction }); setEditing(null); setText(""); setMyAction(""); setReview(null); })}>Save draft</Button>
          <Button variant="secondary" type="button" onClick={coach}>Help me word this</Button>
        </div>
        <div className="mt-4">
          <p className="text-sm font-semibold">Starter templates, off until you choose one</p>
          <div className="mt-2 flex flex-col gap-2">
            {STARTER_TEMPLATES.map((item) => (
              <button key={item.text} type="button" className="rounded-2xl border border-line px-3 py-2 text-left text-sm" onClick={() => { setCategory(item.category); setText(item.text); setMyAction(item.myAction); setReview(null); }}>
                {item.text}
              </button>
            ))}
          </div>
        </div>
      </Card>
      <h2 className="mb-2 text-lg font-bold">My boundaries</h2>
      {(rows?.mine ?? []).map((row) => (
        <div key={row.id}>
          <BoundaryCard row={row} mine partnerName={partnerName} />
          <div className="mb-4 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => { setEditing(row.id); setCategory(row.category); setText(row.text); setMyAction(row.myAction); }}>Edit</Button>
            {row.status === "draft" ? <Button disabled={busy} onClick={() => void run(() => backend.boundaries.setStatus(row.id, "shared").then(() => undefined))}>Share with {partnerName}</Button> : null}
            {row.status === "draft" ? <Button variant="ghost" disabled={busy} onClick={() => void run(() => backend.boundaries.removeDraft(row.id))}>Delete draft</Button> : null}
            {row.status === "shared" ? <Button variant="ghost" disabled={busy} onClick={() => void run(() => backend.boundaries.setStatus(row.id, "archived").then(() => undefined))}>Archive</Button> : null}
          </div>
        </div>
      ))}
      {!rows?.mine.length ? <p className="mb-4 text-sm text-muted">None yet. A template never turns itself on.</p> : null}
      <h2 className="mb-2 text-lg font-bold">{partnerName}'s boundaries</h2>
      {(rows?.partner ?? []).map((row) => (
        <BoundaryCard key={row.id} row={row} mine={false} partnerName={partnerName} ack={rows?.acks.find((ack) => ack.boundaryId === row.id && ack.userId === user?.id)?.response} onAck={(response) => void run(() => backend.boundaries.ack(row.id, response))} />
      ))}
      {!rows?.partner.length ? <p className="mb-4 text-sm text-muted">When {partnerName} shares one, it shows up here. Drafts never do.</p> : null}
      <Card>
        <h2 className="text-lg font-bold">Our agreements</h2>
        <p className="mb-3 text-sm text-muted">Either person can propose one. It becomes active only after both accept. An edit starts a new version, and the older wording stays.</p>
        <TextField label="Agreement I want to propose" hint="You are typing a shared agreement, not a private boundary." value={agreement} onChange={setAgreement} maxLength={500} />
        <Button className="mt-3" disabled={busy || !agreement.trim()} onClick={() => void run(async () => { await backend.boundaries.propose(agreement); setAgreement(""); })}>Propose</Button>
        <div className="mt-4 space-y-4">
          {(rows?.agreements ?? []).map((item) => {
            const latest = item.versions[item.versions.length - 1];
            return (
              <div key={item.id} className="border-t border-line pt-3">
                <p className="text-xs font-semibold text-muted">{item.status}</p>
                <p className="font-semibold">{latest?.body}</p>
                <ol className="mt-2 list-decimal pl-5 text-sm text-muted">
                  {item.versions.map((version) => <li key={version.version}>v{version.version}: {version.body}</li>)}
                </ol>
                <div className="mt-2 flex flex-wrap gap-2">
                  {item.status === "proposed" && !item.acceptedBy.includes(user?.id ?? "") ? <Button disabled={busy} onClick={() => void run(() => backend.boundaries.accept(item.id).then(() => undefined))}>Accept</Button> : null}
                  {item.status !== "left" && item.status !== "archived" ? <Button variant="ghost" disabled={busy} onClick={() => void run(() => backend.boundaries.leave(item.id).then(() => undefined))}>Leave</Button> : null}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </>
  );
}
