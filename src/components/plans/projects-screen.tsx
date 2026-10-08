"use client";
/**
 * Projects: one shared, ranked list so you both agree on what comes first
 * (paint the baby's room, finish the garage, save for the trip…). Either
 * partner can add, reorder, update or remove a project.
 */
import { useState, type FormEvent } from "react";
import { useApp } from "@/components/app-provider";
import { Badge, Button, ButtonLink, Card, EmptyState, LoadingBlock, Notice, PageHeader, SectionTitle, SelectField, TextField, useToast } from "@/components/ui";
import { messageOf, type Project, type ProjectKind, type ProjectStatus } from "@/lib/backend/types";
import { formatDate } from "@/lib/domain/dates";
import { formatMoney, parseMoney, PROJECT_KIND_COPY, PROJECT_KINDS, PROJECT_STATUS_COPY, PROJECT_STATUSES } from "@/lib/domain/plans-rules";
import { useLoad } from "@/lib/ui/hooks";

export function ProjectsScreen() {
  const { backend, user, nameOf } = useApp();
  const toast = useToast();
  const list = useLoad(() => backend.projects.list(), [backend, user?.id]);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<ProjectKind>("home");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const open = (list.data ?? []).filter((p) => p.status !== "done");
  const done = (list.data ?? []).filter((p) => p.status === "done");

  async function add(e: FormEvent) {
    e.preventDefault();
    setAdding(true);
    setError(null);
    try {
      await backend.projects.add({ title, kind });
      setTitle("");
      await list.reload();
      toast.show("Project added to the bottom. Move it up if it matters more.");
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setAdding(false);
    }
  }

  async function act(id: string, fn: () => Promise<unknown>, message?: string) {
    setBusy(id);
    setError(null);
    try {
      await fn();
      await list.reload();
      if (message) toast.show(message);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader title="Projects" subtitle="What you're working on together, in the order you agreed on." />
      {error ? <Notice tone="danger" className="mb-3" title={error} /> : null}
      {list.error ? <Notice tone="danger" title={list.error} /> : null}
      {list.loading && !list.data ? <LoadingBlock /> : null}
      {list.data && open.length === 0 ? <EmptyState emoji="🔨" title="No open projects" body="Add the first thing you two want to get done." /> : null}

      <ol className="space-y-3" aria-label="Projects in priority order">
        {open.map((p, i) => (
          <li key={p.id}>
            <ProjectCard
              project={p}
              position={i + 1}
              first={i === 0}
              last={i === open.length - 1}
              busy={busy === p.id}
              addedBy={nameOf(p.createdBy)}
              onMove={(dir) => act(p.id, () => backend.projects.move(p.id, dir))}
              onStatus={(status) => act(p.id, () => backend.projects.update(p.id, { status }), status === "done" ? "Nice work. Marked done." : undefined)}
              onBudget={(cents) => act(p.id, () => backend.projects.update(p.id, { budgetCents: cents }), "Budget saved.")}
              onRemove={() => act(p.id, () => backend.projects.remove(p.id), "Project removed.")}
            />
          </li>
        ))}
      </ol>

      {done.length ? (
        <>
          <SectionTitle>Done</SectionTitle>
          <ul className="space-y-2">
            {done.map((p) => (
              <li key={p.id} className="flex min-h-12 items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-2">
                <span className="text-ink line-through decoration-muted">{p.title}</span>
                <Button variant="ghost" className="min-h-11 text-sm" onClick={() => act(p.id, () => backend.projects.update(p.id, { status: "active" }))}>
                  Reopen
                </Button>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <div className="mt-6">
        <ButtonLink href="/us/buddy/" variant="secondary" className="w-full">
          Ask Buddy to plan a work day
        </ButtonLink>
      </div>
      <Card className="mt-6">
        <h2 className="mb-4 text-xl font-bold">Add a new project</h2>
        <form onSubmit={add}>
          <TextField label="New project" value={title} onChange={setTitle} placeholder="Paint the baby's room, finish the garage…" maxLength={120} />
          <SelectField label="Kind" value={kind} onChange={setKind} options={PROJECT_KINDS.map((k) => ({ value: k, label: `${PROJECT_KIND_COPY[k].emoji} ${PROJECT_KIND_COPY[k].label}` }))} />
          <Button type="submit" loading={adding} disabled={!title.trim()}>
            Add project
          </Button>
        </form>
      </Card>
    </>
  );
}

function ProjectCard({
  project: p, position, first, last, busy, addedBy, onMove, onStatus, onBudget, onRemove,
}: {
  project: Project; position: number; first: boolean; last: boolean; busy: boolean; addedBy: string;
  onMove(dir: "up" | "down"): void; onStatus(status: ProjectStatus): void; onBudget(cents: number | null): void; onRemove(): void;
}) {
  const [budget, setBudget] = useState(p.budgetCents ? String(p.budgetCents / 100) : "");
  const [editing, setEditing] = useState(false);
  return (
    <Card as="article" className="p-4">
      <div className="flex items-start gap-3">
        <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-lg font-bold text-accent-ink">
          {position}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-ink">
            <span className="sr-only">Priority {position}: </span>
            {p.title}
          </h3>
          <div className="mt-1 flex flex-wrap gap-2 text-sm text-muted">
            <Badge>
              {PROJECT_KIND_COPY[p.kind].emoji} {PROJECT_KIND_COPY[p.kind].label}
            </Badge>
            <Badge tone={p.status === "active" ? "accent" : "muted"}>{PROJECT_STATUS_COPY[p.status]}</Badge>
            {p.targetDate ? <span>By {formatDate(p.targetDate)}</span> : null}
            {p.budgetCents ? <span>Budget {formatMoney(p.budgetCents)}</span> : null}
          </div>
          {p.note ? <p className="mt-2 text-sm text-ink">{p.note}</p> : null}
          <p className="mt-1 text-xs text-muted">Added by {addedBy}</p>
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          <button type="button" aria-label={`Move ${p.title} up`} disabled={first || busy} onClick={() => onMove("up")} className="h-11 w-11 rounded-full border border-line text-lg text-accent-text disabled:opacity-30">
            ↑
          </button>
          <button type="button" aria-label={`Move ${p.title} down`} disabled={last || busy} onClick={() => onMove("down")} className="h-11 w-11 rounded-full border border-line text-lg text-accent-text disabled:opacity-30">
            ↓
          </button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {PROJECT_STATUSES.filter((s) => s !== p.status).map((s) => (
          <Button key={s} variant="secondary" className="min-h-11 text-sm" disabled={busy} onClick={() => onStatus(s)}>
            {s === "done" ? "Mark done" : s === "active" ? "Start it" : "Not started"}
          </Button>
        ))}
        <Button variant="ghost" className="min-h-11 text-sm" onClick={() => setEditing((e) => !e)} aria-expanded={editing}>
          {editing ? "Close" : "Budget & more"}
        </Button>
      </div>
      {editing ? (
        <div className="mt-3 border-t border-line pt-3">
          <TextField label="Budget ($)" value={budget} onChange={setBudget} inputMode="numeric" placeholder="e.g. 1200" />
          <div className="flex flex-wrap gap-2">
            <Button
              className="min-h-11"
              disabled={busy}
              onClick={() => {
                const cents = budget.trim() ? parseMoney(budget) : null;
                if (budget.trim() && (cents === null || cents < 0)) return;
                onBudget(cents);
              }}
            >
              Save budget
            </Button>
            <Button variant="danger" className="min-h-11" disabled={busy} onClick={onRemove}>
              Remove project
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
