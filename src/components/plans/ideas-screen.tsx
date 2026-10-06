"use client";

import Link from "next/link";
import { useState } from "react";
import { useApp } from "@/components/app-provider";
import { Badge, Button, Card, EmptyState, Notice, PageHeader, TextField, useToast } from "@/components/ui";
import { CATEGORY_COPY } from "@/lib/domain/categories";
import { useAction, useLoad } from "@/lib/ui/hooks";

export function IdeasScreen() {
  const { backend, user, couple, setCouple } = useApp();
  const toast = useToast();
  const list = useLoad(() => backend.ideas.list(), [backend, user?.id]);
  const [city, setCity] = useState(couple?.city ?? "");
  const [notice, setNotice] = useState<string | null>(null);
  const saveCity = useAction(async () => { const updated = await backend.couple.update({ city: city.trim() || null }); setCouple(updated); return updated; });
  const generate = useAction(async () => { const batch = await backend.ideas.generate(); setNotice(batch.notice); await list.reload(); return batch; });
  const change = useAction(async (id: string, status: "saved" | "dismissed") => { await backend.ideas.setStatus(id, status); await list.reload(); return true; });
  const currentCity = couple?.city?.trim();
  return (
    <>
      <PageHeader title="Date ideas" subtitle="Fresh possibilities shaped by your city and what you have enjoyed." back={{ href: "/plans/", label: "Plans" }} />
      {!currentCity ? <Card className="mb-5"><h2 className="text-lg font-bold text-ink">Where are you two?</h2><p className="mt-1 text-sm text-muted">A city helps Spark make ideas that can actually happen. You can change it any time.</p><div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end"><div className="flex-1"><TextField label="City" value={city} onChange={setCity} placeholder="Bozeman, MT" autoComplete="address-level2" /></div><Button loading={saveCity.pending} disabled={!city.trim()} onClick={async () => { const result = await saveCity.run(); if (result) toast.show("City saved."); }}>Save city</Button></div>{saveCity.error ? <Notice tone="danger" className="mt-3" title={saveCity.error} /> : null}</Card> : null}
      <Button className="w-full" loading={generate.pending} disabled={!currentCity} onClick={async () => { const result = await generate.run(); if (result) toast.show("Five ideas are ready."); }}>Get 5 new ideas</Button>
      {notice ? <Notice tone="info" className="mt-3" title="How these ideas were made">{notice}</Notice> : null}
      {generate.error ? <Notice tone="danger" className="mt-3" title={generate.error} /> : null}
      {change.error ? <Notice tone="danger" className="mt-3" title={change.error} /> : null}
      {list.data?.length ? <div className="mt-5 space-y-3">{list.data.filter((idea) => idea.status !== "dismissed").map((idea) => <Card key={idea.id} as="article"><div className="flex flex-wrap gap-2"><Badge>{CATEGORY_COPY[idea.category].emoji} {CATEGORY_COPY[idea.category].label}</Badge><Badge tone="muted">{idea.budget}</Badge><Badge tone="muted">{idea.duration.replace("_", " ")}</Badge><Badge tone="muted">{idea.timeOfDay}</Badge><Badge tone="muted">{idea.weather}</Badge></div><h2 className="mt-3 text-xl font-bold text-ink">{idea.title}</h2><p className="mt-1 text-sm leading-relaxed text-muted">{idea.description}</p>{idea.why ? <p className="mt-3 rounded-2xl bg-accent-soft p-3 text-sm text-ink"><span className="font-semibold">Why this fits: </span>{idea.why}</p> : null}<div className="mt-4 flex flex-wrap gap-2">{idea.status !== "saved" ? <Button variant="secondary" onClick={async () => { const result = await change.run(idea.id, "saved"); if (result) toast.show("Saved to your ideas."); }}>Save</Button> : <Badge>Saved</Badge>}<Link href={`/plans/new/?idea=${encodeURIComponent(idea.id)}`} className="inline-flex min-h-12 items-center justify-center rounded-full bg-accent px-5 font-semibold text-accent-ink">Log it</Link><Button variant="ghost" onClick={async () => { const result = await change.run(idea.id, "dismissed"); if (result) toast.show("Set aside."); }}>Not for us</Button></div></Card>)}</div> : <div className="mt-5"><EmptyState emoji="💡" title="No ideas yet" body={currentCity ? "Ask for five when you are ready." : "Add your city, then ask for five ideas."} /></div>}
    </>
  );
}
