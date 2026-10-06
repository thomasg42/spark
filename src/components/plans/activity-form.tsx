"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useApp } from "@/components/app-provider";
import { Button, Card, Notice, PageHeader, SelectField, TextAreaField, TextField, useToast } from "@/components/ui";
import { PhotoPicker } from "@/components/story/photo-picker";
import { ACTIVITY_CATEGORIES, CATEGORY_COPY, type ActivityCategory } from "@/lib/domain/categories";
import { toISODate } from "@/lib/domain/dates";
import { useAction, useLoad } from "@/lib/ui/hooks";

export function ActivityForm() {
  const params = useSearchParams();
  const router = useRouter();
  const { backend, user } = useApp();
  const toast = useToast();
  const ideaId = params.get("idea");
  const ideas = useLoad(() => backend.ideas.list(), [backend, user?.id]);
  const idea = ideas.data?.find((item) => item.id === ideaId) ?? null;
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(toISODate(new Date()));
  const [category, setCategory] = useState<ActivityCategory>("food");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [filled, setFilled] = useState(false);
  useEffect(() => { if (idea && !filled) { setTitle(idea.title); setCategory(idea.category); setFilled(true); } }, [idea, filled]);
  const save = useAction(async () => {
    const activity = await backend.activities.add({ title, happenedOn: date, category, note, photo: file, sourceIdeaId: idea?.id ?? null });
    if (idea) await backend.ideas.setStatus(idea.id, "done");
    return activity;
  });
  const submit = async (event: FormEvent) => { event.preventDefault(); const result = await save.run(); if (result) { toast.show("Activity logged."); router.push("/plans/"); } };
  return (
    <>
      <PageHeader title="Log an activity" subtitle={idea ? `Logging “${idea.title}”` : "Keep a memory of what you did together."} back={{ href: "/plans/", label: "Plans" }} />
      <Card><form onSubmit={submit} noValidate><TextField label="Title" value={title} onChange={setTitle} maxLength={120} placeholder="Dinner at the new place" required /><TextField label="Date" type="date" value={date} onChange={setDate} required max={toISODate(new Date(Date.now() + 86_400_000))} /><SelectField<ActivityCategory> label="Category" value={category} onChange={setCategory} options={ACTIVITY_CATEGORIES.map((value) => ({ value, label: `${CATEGORY_COPY[value].emoji} ${CATEGORY_COPY[value].label}` }))} /><TextAreaField label="Note" optional value={note} onChange={setNote} maxLength={2000} rows={4} placeholder="What would you remember about it?" /><PhotoPicker existingPath={null} file={file} removed={false} title={title} error={photoError} onPick={setFile} onRemove={() => setFile(null)} onError={setPhotoError} /><Button type="submit" loading={save.pending}>Save activity</Button>{save.error ? <Notice tone="danger" className="mt-3" title={save.error} /> : null}</form></Card>
    </>
  );
}
