"use client";
/** The shared timeline: grouped by year, oldest first, undated moments last. */
import type { ReactNode } from "react";
import { useApp } from "@/components/app-provider";
import { StoredMedia } from "@/components/stored-image";
import { Badge, Card } from "@/components/ui";
import { STORY_KIND_COPY } from "@/lib/domain/categories";
import { formatDate } from "@/lib/domain/dates";
import type { StoryEntry } from "@/lib/backend/types";
import { groupByYear } from "./rules";

export const entryDomId = (id: string) => `story-entry-${id}`;
export const editButtonDomId = (id: string) => `story-edit-${id}`;

/** "Your partner" and "A former member" read better mid-sentence in lower case. */
function inSentence(name: string): string {
  return name === "Your partner" || name === "A former member" ? name.charAt(0).toLowerCase() + name.slice(1) : name;
}

function EntryCard({ entry, onEdit }: { entry: StoryEntry; onEdit(entry: StoryEntry): void }) {
  const { nameOf } = useApp();
  const kind = STORY_KIND_COPY[entry.kind];
  const addedBy = inSentence(nameOf(entry.authorId, "you"));
  return (
    <Card as="article" id={entryDomId(entry.id)} tabIndex={-1} aria-labelledby={`${entryDomId(entry.id)}-title`} className="min-w-0">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <Badge>{kind.label}</Badge>
        {entry.happenedOn ? (
          <time dateTime={entry.happenedOn} className="text-muted">
            {formatDate(entry.happenedOn)}
          </time>
        ) : (
          <span className="text-muted">No date</span>
        )}
        {entry.remindYearly && entry.happenedOn ? <Badge tone="muted">Yearly reminder</Badge> : null}
      </p>
      <h4 id={`${entryDomId(entry.id)}-title`} className="mt-2 break-words text-lg font-bold leading-snug text-ink">
        {entry.title}
      </h4>
      {entry.body ? <p className="mt-1 whitespace-pre-line break-words text-ink">{entry.body}</p> : null}
      {entry.photoPath ? (
        <StoredMedia path={entry.photoPath} alt={`Photo for "${entry.title}"`} className="reveal mt-3 aspect-[4/3] w-full rounded-2xl" />
      ) : null}
      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-sm text-muted">Added by {addedBy}</p>
        <button
          id={editButtonDomId(entry.id)}
          type="button"
          onClick={() => onEdit(entry)}
          aria-label={`Edit "${entry.title}"`}
          className="inline-flex min-h-11 shrink-0 items-center rounded-full px-4 text-sm font-semibold text-accent-text transition hover:bg-accent-soft"
        >
          Edit
        </button>
      </div>
    </Card>
  );
}

export function StoryTimeline({
  entries,
  editingId,
  onEdit,
  renderEditor,
}: {
  entries: StoryEntry[];
  /** The entry currently open in the inline editor, if any. */
  editingId: string | null;
  onEdit(entry: StoryEntry): void;
  renderEditor(entry: StoryEntry): ReactNode;
}) {
  const groups = groupByYear(entries);
  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <section key={group.key} aria-labelledby={`story-year-${group.key}`}>
          <h3 id={`story-year-${group.key}`} className="mb-3 inline-flex items-center gap-2 rounded-full bg-surface-2 px-3 py-1 text-sm font-bold text-muted">
            {group.label}
          </h3>
          <ol className="relative space-y-4 before:absolute before:bottom-3 before:left-[1.125rem] before:top-3 before:w-0.5 before:-translate-x-1/2 before:rounded-full before:bg-line">
            {group.entries.map((entry) => {
              const editing = editingId === entry.id;
              return (
                <li key={entry.id} className={editing ? "relative" : "fade-up relative pl-12"}>
                  {editing ? (
                    renderEditor(entry)
                  ) : (
                    <>
                      <span
                        aria-hidden
                        className="absolute left-0 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-line bg-accent-soft text-base shadow-sm"
                      >
                        {STORY_KIND_COPY[entry.kind].emoji}
                      </span>
                      <EntryCard entry={entry} onEdit={onEdit} />
                    </>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
