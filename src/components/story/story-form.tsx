"use client";
/**
 * Inline add/edit card for a story entry (deliberately not a modal): kind
 * chips with a writing prompt, title, optional date, notes, photo and a yearly
 * reminder switch. Delete uses an inline confirm, never window.confirm.
 */
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useApp } from "@/components/app-provider";
import { Button, Card, Notice, TextAreaField, TextField, cx } from "@/components/ui";
import { STORY_KINDS, STORY_KIND_COPY, type StoryKind } from "@/lib/domain/categories";
import { messageOf, type StoryEntry, type StoryInput } from "@/lib/backend/types";
import { PhotoPicker } from "./photo-picker";
import { STORY_BODY_MAX, STORY_TITLE_MAX, isRealDate, remindsByDefault } from "./rules";

export type StoryEditorTarget = { mode: "add"; kind: StoryKind } | { mode: "edit"; entry: StoryEntry };

const TITLE_PLACEHOLDER: Record<StoryKind, string> = {
  how_we_met: "A friend's birthday party",
  together: "Made it official",
  first_date: "Tacos and a long walk",
  first_kiss: "On the porch steps",
  met_family: "The day we met your cousin",
  met_friend: "Meeting your oldest friend",
  trip: "Road trip to the coast",
  milestone: "Got our first place",
  anniversary: "Our wedding day",
  other: "The night the power went out",
};

const chipFocus =
  "peer-focus-visible:outline peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--accent)]";

function KindPicker({ value, onChange }: { value: StoryKind; onChange(kind: StoryKind): void }) {
  const name = useId();
  const hintId = `${name}-prompt`;
  const copy = STORY_KIND_COPY[value];
  return (
    <fieldset className="mb-4 min-w-0" aria-describedby={hintId}>
      <legend className="mb-2 text-sm font-semibold text-ink">What kind of moment?</legend>
      <div className="flex flex-wrap gap-2">
        {STORY_KINDS.map((kind) => {
          const k = STORY_KIND_COPY[kind];
          return (
            <label key={kind} className="cursor-pointer">
              <input type="radio" name={name} value={kind} checked={value === kind} onChange={() => onChange(kind)} className="peer sr-only" />
              <span
                className={cx(
                  "inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line bg-surface px-4 text-sm font-semibold text-ink transition hover:bg-surface-2",
                  "peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:text-accent-text",
                  chipFocus,
                )}
              >
                <span aria-hidden>{k.emoji}</span>
                {k.label}
              </span>
            </label>
          );
        })}
      </div>
      <p id={hintId} className="mt-3 rounded-2xl bg-surface-2 px-4 py-3 text-sm text-ink" aria-live="polite">
        <span aria-hidden className="mr-1.5">
          {copy.emoji}
        </span>
        {copy.prompt}
      </p>
    </fieldset>
  );
}

function RemindSwitch({ checked, onChange, hasDate }: { checked: boolean; onChange(next: boolean): void; hasDate: boolean }) {
  const id = useId();
  return (
    <div className="mb-5">
      <label htmlFor={id} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 transition hover:bg-surface-2">
        <input id={id} type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" aria-describedby={`${id}-hint`} />
        <span
          aria-hidden
          className={cx(
            "inline-flex h-7 w-12 shrink-0 items-center rounded-full border border-line bg-surface-2 pl-1 transition-[padding,background-color]",
            "peer-checked:border-accent peer-checked:bg-accent peer-checked:pl-6",
            chipFocus,
          )}
        >
          <span className="h-5 w-5 rounded-full bg-surface shadow-sm" />
        </span>
        <span className="min-w-0 font-semibold text-ink">Remind us every year</span>
      </label>
      <p id={`${id}-hint`} className="mt-1.5 px-1 text-sm text-muted">
        {checked && !hasDate
          ? "Add a date above so Spark knows when to remind you."
          : "Reminders show under Coming up, a month ahead, every year."}
      </p>
    </div>
  );
}

function DeleteConfirm({ pending, onConfirm, onCancel }: { pending: boolean; onConfirm(): void; onCancel(): void }) {
  const textId = useId();
  const keepId = `${textId}-keep`;
  // The safe choice gets focus first.
  useEffect(() => document.getElementById(keepId)?.focus(), [keepId]);
  return (
    <div role="group" aria-labelledby={textId} className="pop mt-4 rounded-2xl border border-danger bg-surface p-4">
      <p id={textId} className="font-semibold text-ink">
        Remove this moment from your story?
      </p>
      <p className="mt-1 text-sm text-muted">It disappears for both of you, photo included. This can't be undone.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="danger" loading={pending} onClick={onConfirm}>
          Yes, remove it
        </Button>
        <Button id={keepId} variant="secondary" onClick={onCancel} disabled={pending}>
          Keep it
        </Button>
      </div>
    </div>
  );
}

export function StoryForm({
  target,
  id,
  onSaved,
  onDeleted,
  onCancel,
}: {
  target: StoryEditorTarget;
  /** DOM id of the card, used by the toggle button's aria-controls. */
  id: string;
  onSaved(entry: StoryEntry, mode: "add" | "edit"): void;
  onDeleted(entryId: string): void;
  onCancel(): void;
}) {
  const { backend, partner } = useApp();
  const editing = target.mode === "edit" ? target.entry : null;
  const initialKind = editing ? editing.kind : target.mode === "add" ? target.kind : "other";

  const [kind, setKind] = useState<StoryKind>(initialKind);
  const [title, setTitle] = useState(editing?.title ?? "");
  const [date, setDate] = useState(editing?.happenedOn ?? "");
  const [notes, setNotes] = useState(editing?.body ?? "");
  const [remind, setRemind] = useState(editing ? editing.remindYearly : remindsByDefault(initialKind));
  const [remindTouched, setRemindTouched] = useState(Boolean(editing));
  const [file, setFile] = useState<File | null>(null);
  const [removeSaved, setRemoveSaved] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<null | "save" | "delete">(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const formRef = useRef<HTMLFormElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const headingId = useId();
  const submitId = `${headingId}-submit`;
  const partnerName = partner?.nickname || partner?.displayName || backend.demo?.personas.find((persona) => persona.id !== backend.demo?.actingAs())?.name || "your partner";

  // Announce and reveal the card as soon as it opens.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  // A failed save leaves focus near the error instead of on the page body.
  useEffect(() => {
    if (error) document.getElementById(submitId)?.focus();
  }, [error, submitId]);

  const chooseKind = (next: StoryKind) => {
    setKind(next);
    if (!remindTouched) setRemind(remindsByDefault(next));
  };

  const focusField = (name: string) => formRef.current?.querySelector<HTMLElement>(`[name="${name}"]`)?.focus();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setTitleError("Give this moment a short title.");
      focusField("story-title");
      return;
    }
    setTitleError(null);
    if (date && !isRealDate(date)) {
      setDateError("That date doesn't look right. Try picking it again.");
      focusField("story-date");
      return;
    }
    setDateError(null);
    const input: StoryInput = {
      kind,
      title: cleanTitle,
      happenedOn: date || null,
      body: notes.trim() || null,
      remindYearly: remind,
      photo: file,
      removePhoto: !file && removeSaved,
    };
    setPending("save");
    setError(null);
    try {
      const saved = editing ? await backend.story.update(editing.id, input) : await backend.story.add(input);
      onSaved(saved, editing ? "edit" : "add");
    } catch (e) {
      setError(messageOf(e));
      setPending(null);
    }
  };

  const remove = async () => {
    if (!editing || pending) return;
    setPending("delete");
    setError(null);
    try {
      await backend.story.remove(editing.id);
      onDeleted(editing.id);
    } catch (e) {
      setError(messageOf(e));
      setConfirmingDelete(false);
      setPending(null);
    }
  };

  const busy = pending !== null;

  return (
    <Card id={id} as="div" className="fade-up ring-2 ring-accent/40">
      <form ref={formRef} onSubmit={submit} noValidate aria-labelledby={headingId}>
        <h2 id={headingId} ref={headingRef} tabIndex={-1} className="text-xl font-bold text-ink">
          {editing ? "Edit this moment" : "Add to your story"}
        </h2>
        <p className="mb-4 mt-1 text-sm text-muted">
          <span aria-hidden className="mr-1 text-deco">
            ♥
          </span>
          Shared with {partnerName}. You can both add, edit and remove anything here.
        </p>

        <fieldset disabled={busy} className="min-w-0">
          <KindPicker value={kind} onChange={chooseKind} />
          <TextField
            label="Title"
            name="story-title"
            value={title}
            onChange={(v) => {
              setTitle(v);
              if (titleError && v.trim()) setTitleError(null);
            }}
            maxLength={STORY_TITLE_MAX}
            placeholder={`e.g. ${TITLE_PLACEHOLDER[kind]}`}
            autoComplete="off"
            required
            error={titleError}
          />
          <TextField
            label="When was it?"
            name="story-date"
            type="date"
            optional
            hint="Leave it blank if you're not sure."
            value={date}
            onChange={(v) => {
              setDate(v);
              setDateError(null);
            }}
            error={dateError}
          />
          {date ? (
            <button
              type="button"
              className="-mt-3 mb-4 inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold text-accent-text hover:bg-accent-soft"
              onClick={() => {
                setDate("");
                focusField("story-date");
              }}
            >
              Clear date
            </button>
          ) : null}
          <TextAreaField
            label="Notes"
            name="story-notes"
            optional
            value={notes}
            onChange={setNotes}
            rows={4}
            maxLength={STORY_BODY_MAX}
            placeholder="What do you each remember?"
          />
          <PhotoPicker
            existingPath={editing?.photoPath ?? null}
            file={file}
            removed={removeSaved}
            title={title}
            error={photoError}
            disabled={busy}
            onPick={(picked) => setFile(picked)}
            onRemove={() => {
              setFile(null);
              setRemoveSaved(Boolean(editing?.photoPath));
            }}
            onError={setPhotoError}
          />
          <RemindSwitch
            checked={remind}
            hasDate={Boolean(date)}
            onChange={(next) => {
              setRemind(next);
              setRemindTouched(true);
            }}
          />
        </fieldset>

        {error ? <Notice tone="danger" className="mb-4" title={error} /> : null}

        <div className="flex flex-wrap gap-2">
          <Button id={submitId} type="submit" loading={pending === "save"} disabled={busy}>
            {editing ? "Save changes" : "Save to our story"}
          </Button>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        </div>
        {pending === "save" ? (
          <p className="mt-2 text-sm text-muted" role="status">
            {file ? "Saving your photo and story…" : "Saving…"}
          </p>
        ) : null}
      </form>

      {editing ? (
        confirmingDelete ? (
          <DeleteConfirm pending={pending === "delete"} onConfirm={remove} onCancel={() => setConfirmingDelete(false)} />
        ) : (
          <div className="mt-4 border-t border-line pt-3">
            <Button variant="danger" onClick={() => setConfirmingDelete(true)} disabled={busy}>
              Remove this moment
            </Button>
          </div>
        )
      ) : null}
    </Card>
  );
}
