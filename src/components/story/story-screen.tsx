"use client";
/**
 * Our Story screen: upcoming yearly reminders, the shared timeline, quick
 * starts for the classic firsts, and an inline add/edit card. Focus is moved
 * deliberately (into the card when it opens, back to where you were after).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/components/app-provider";
import { Button, EmptyState, LoadingBlock, Notice, PageHeader, useToast } from "@/components/ui";
import { STORY_KIND_COPY, type StoryKind } from "@/lib/domain/categories";
import type { StoryEntry } from "@/lib/backend/types";
import { useLoad } from "@/lib/ui/hooks";
import { ComingUp } from "./coming-up";
import { missingFirsts, upsertStory, CLASSIC_FIRSTS } from "./rules";
import { StoryForm, type StoryEditorTarget } from "./story-form";
import { StoryTimeline, editButtonDomId, entryDomId } from "./story-timeline";

const EDITOR_ID = "story-editor";
const ADD_BUTTON_ID = "story-add";
const TIMELINE_HEADING_ID = "story-timeline-title";
const quickDomId = (kind: StoryKind) => `story-quick-${kind}`;

function FirstsChips({ kinds, label, onPick }: { kinds: readonly StoryKind[]; label: string; onPick(kind: StoryKind): void }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap justify-center gap-2">
      {kinds.map((kind) => {
        const copy = STORY_KIND_COPY[kind];
        return (
          <button
            key={kind}
            id={quickDomId(kind)}
            type="button"
            onClick={() => onPick(kind)}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line bg-surface px-4 text-sm font-semibold text-ink transition hover:bg-accent-soft"
          >
            <span aria-hidden>{copy.emoji}</span>
            {copy.label}
          </button>
        );
      })}
    </div>
  );
}

export function StoryScreen() {
  const { backend, user } = useApp();
  const toast = useToast();
  const { data, setData, error, loading, reload } = useLoad(() => backend.story.list(), [backend, user?.id]);
  const [editor, setEditor] = useState<StoryEditorTarget | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [focusTarget, setFocusTarget] = useState<string | null>(null);
  const returnFocus = useRef(ADD_BUTTON_ID);
  const today = useMemo(() => new Date(), []);
  const entries = data ?? [];
  const missing = missingFirsts(entries);

  // Runs after the DOM reflects the change, so the target element exists.
  useEffect(() => {
    if (!focusTarget) return;
    (document.getElementById(focusTarget) ?? document.getElementById(ADD_BUTTON_ID))?.focus();
    setFocusTarget(null);
  }, [focusTarget]);

  const open = (target: StoryEditorTarget, from: string) => {
    returnFocus.current = from;
    setEditor(target);
    setEditorKey((k) => k + 1);
  };

  const close = (focusId: string) => {
    setEditor(null);
    setFocusTarget(focusId);
  };

  const onAddClick = () => {
    if (editor?.mode === "add") {
      // Already open: bring it back into view instead of wiping what was typed.
      document.getElementById(EDITOR_ID)?.querySelector<HTMLElement>("h2")?.focus();
      return;
    }
    open({ mode: "add", kind: entries.length === 0 ? "how_we_met" : "milestone" }, ADD_BUTTON_ID);
  };

  const onSaved = (entry: StoryEntry, mode: "add" | "edit") => {
    setData((prev) => upsertStory(prev ?? [], entry));
    close(entryDomId(entry.id));
    toast.show(mode === "add" ? "Added to your story" : "Changes saved");
  };

  const onDeleted = (entryId: string) => {
    setData((prev) => (prev ?? []).filter((e) => e.id !== entryId));
    close(TIMELINE_HEADING_ID);
    toast.show("Removed from your story");
  };

  const onCancel = () => close(returnFocus.current);

  const form = (target: StoryEditorTarget) => (
    <StoryForm key={editorKey} id={EDITOR_ID} target={target} onSaved={onSaved} onDeleted={onDeleted} onCancel={onCancel} />
  );

  const addOpen = editor?.mode === "add";

  return (
    <>
      <PageHeader
        title="Our Story"
        subtitle="The moments that made you two. You can both add to it."
        back={{ href: "/us/", label: "Us" }}
        action={
          data ? (
            <Button
              id={ADD_BUTTON_ID}
              onClick={onAddClick}
              aria-label="Add a moment"
              aria-expanded={addOpen}
              aria-controls={addOpen ? EDITOR_ID : undefined}
            >
              <span aria-hidden>+</span> Add
            </Button>
          ) : null
        }
      />

      {editor?.mode === "add" ? <div className="mb-6">{form(editor)}</div> : null}

      {loading && !data ? (
        <LoadingBlock label="Opening your story…" />
      ) : error && !data ? (
        <Notice tone="danger" title="Your story didn't load.">
          <p>{error}</p>
          <Button variant="secondary" className="mt-3" onClick={() => void reload()}>
            Try again
          </Button>
        </Notice>
      ) : entries.length === 0 ? (
        addOpen ? null : (
          <EmptyState
            emoji="📖"
            title="Start your story"
            body="Add the moments you'll want to remember in twenty years. Start with a classic first, or add anything you like."
            action={
              <div className="w-full">
                <FirstsChips
                  kinds={CLASSIC_FIRSTS}
                  label="Start with a classic first"
                  onPick={(kind) => open({ mode: "add", kind }, quickDomId(kind))}
                />
              </div>
            }
          />
        )
      ) : (
        <>
          <ComingUp entries={entries} today={today} />

          <section aria-labelledby={TIMELINE_HEADING_ID} className="mt-8">
            <h2 id={TIMELINE_HEADING_ID} tabIndex={-1} className="mb-3 text-xl font-bold text-ink">
              Our timeline
            </h2>
            <StoryTimeline
              entries={entries}
              editingId={editor?.mode === "edit" ? editor.entry.id : null}
              onEdit={(entry) => open({ mode: "edit", entry }, editButtonDomId(entry.id))}
              renderEditor={(entry) => form({ mode: "edit", entry })}
            />
          </section>

          {missing.length > 0 && !addOpen ? (
            <section aria-labelledby="story-more-firsts" className="mt-8 rounded-[var(--radius-card)] border border-dashed border-line px-5 py-6 text-center">
              <h2 id="story-more-firsts" className="font-bold text-ink">
                Add another first?
              </h2>
              <p className="mx-auto mb-4 mt-1 max-w-sm text-sm text-muted">Only the ones you both want here. Every one is optional.</p>
              <FirstsChips kinds={missing} label="Add a classic first" onPick={(kind) => open({ mode: "add", kind }, quickDomId(kind))} />
            </section>
          ) : null}
        </>
      )}
    </>
  );
}
