"use client";

import { useState } from "react";
import { useApp } from "@/components/app-provider";
import { Avatar, Button, Card, EmptyState, Notice, PageHeader, TextAreaField, useToast } from "@/components/ui";
import { useAction, useLoad } from "@/lib/ui/hooks";
import type { AppreciationNote } from "@/lib/backend/types";
import { noteLength, NOTE_MAX } from "@/lib/backend/live/notes";

export function NotesScreen() {
  const { backend, user, partner, nameOf } = useApp();
  const toast = useToast();
  const list = useLoad(() => backend.notes.list(), [backend, user?.id]);
  const [body, setBody] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  const send = useAction(async () => { const note = await backend.notes.send(body); setBody(""); await list.reload(); return note; });
  const remove = useAction(async (id: string) => { await backend.notes.remove(id); await list.reload(); return true; });
  const author = (note: AppreciationNote) => note.authorId === user?.id ? "You" : nameOf(note.authorId);

  return (
    <>
      <PageHeader title="Appreciation notes" subtitle="A little kindness, kept between you two." back={{ href: "/checkin/", label: "Check-in" }} />
      <Card>
        <TextAreaField label="Write a note" hint="One thing you noticed, appreciated, or want to say out loud." value={body} onChange={setBody} maxLength={NOTE_MAX} rows={3} placeholder="Thank you for…" />
        <Button loading={send.pending} disabled={!body.trim()} onClick={async () => { const result = await send.run(); if (result) toast.show("Note shared."); }}>Share note</Button>
        {send.error ? <Notice tone="danger" className="mt-3" title={send.error} /> : null}
        <p className="mt-2 text-xs text-muted" aria-live="polite">{noteLength(body)}/{NOTE_MAX} characters</p>
      </Card>
      <section aria-labelledby="notes-list-title" className="mt-6">
        <h2 id="notes-list-title" className="text-xl font-bold text-ink">Your notes</h2>
        {list.data?.length ? <div className="mt-3 space-y-3">{list.data.map((note) => <Card key={note.id} as="article"><div className="flex items-start gap-3"><Avatar name={author(note)} size="sm" /><div className="min-w-0 flex-1"><p className="text-sm text-muted"><span className="font-semibold text-ink">{author(note)}</span> · <time dateTime={note.createdAt}>{new Date(note.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</time></p><p className="mt-1 whitespace-pre-wrap text-ink">{note.body}</p></div></div>{note.authorId === user?.id ? confirming === note.id ? <div className="mt-3 rounded-2xl border border-danger p-3"><p className="text-sm font-semibold text-ink">Delete this note?</p><div className="mt-2 flex flex-wrap gap-2"><Button variant="danger" loading={remove.pending} onClick={async () => { const result = await remove.run(note.id); if (result) { setConfirming(null); toast.show("Note deleted."); } }}>Delete it</Button><Button variant="secondary" onClick={() => setConfirming(null)}>Keep it</Button></div></div> : <Button variant="ghost" className="mt-2 min-h-11 px-3 text-sm" onClick={() => setConfirming(note.id)}>Delete my note</Button> : null}</Card>)}</div> : <div className="mt-3"><EmptyState emoji="♡" title="No notes yet" body="Send a small thank-you when you feel it." /></div>}
        {list.error ? <Notice tone="danger" className="mt-3" title={list.error} /> : null}
        {remove.error ? <Notice tone="danger" className="mt-3" title={remove.error} /> : null}
      </section>
    </>
  );
}
