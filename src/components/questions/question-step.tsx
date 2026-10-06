"use client";
import { useEffect, useRef, type FormEvent } from "react";
import { CrisisResources } from "@/components/crisis-resources";
import { Badge, Button, Card, ProgressBar } from "@/components/ui";
import type { Question } from "@shared/questionnaires.ts";
import { draftMentionsCrisis, type Draft } from "./flow";
import { QuestionField } from "./question-field";

export interface QuestionStepProps {
  question: Question;
  /** e.g. Question 3 of 6 in “The spark” */
  heading: string;
  /** 1-based position and total, for the progress bar (flow mode only). */
  progress?: { value: number; max: number };
  draft: Draft;
  onDraft: (draft: Draft) => void;
  onSave: () => void;
  /** Hidden (null) when the question already has an answer, so a tap can't overwrite it by accident. */
  onSkip: (() => void) | null;
  /** Flow mode: go to the previous question. Edit mode: cancel. */
  onBack?: (() => void) | null;
  mode: "flow" | "edit";
  pending: null | "save" | "skip";
  error: string | null;
  /** Primary label override, e.g. "Continue" when nothing changed. */
  saveLabel?: string;
  /** Move focus to the heading when the question changes (not on first page load). */
  focusOnMount?: boolean;
}

/** One question at a time: big, calm, private, and always skippable. */
export function QuestionStep(props: QuestionStepProps) {
  const { question, heading, progress, draft, onDraft, onSave, onSkip, onBack, mode, pending, error, saveLabel, focusOnMount = false } = props;
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (focusOnMount) headingRef.current?.focus();
  }, [focusOnMount, question.id]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!pending) onSave();
  };

  const isText = question.kind === "text";
  const showCrisis = draftMentionsCrisis(question, draft);

  return (
    <form onSubmit={submit} noValidate className="fade-up" key={question.id}>
      <div className="mb-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 ref={headingRef} tabIndex={-1} className="text-sm font-semibold text-muted focus:outline-none">
            {heading}
          </h2>
          <Badge tone="muted">
            <span aria-hidden className="mr-1">
              🔒
            </span>
            Only you
          </Badge>
        </div>
        {progress ? <ProgressBar value={progress.value} max={progress.max} label={heading} /> : null}
      </div>

      <Card className="pop">
        {question.optional ? (
          <p className="mb-4 rounded-2xl bg-surface-2 px-4 py-3 text-sm text-ink">
            <span className="font-semibold">A gentle one.</span> Share as much or as little as feels right. Skipping is always okay.
          </p>
        ) : null}

        <QuestionField question={question} draft={draft} onChange={onDraft} error={isText ? error : null} />

        {!isText && error ? (
          <p className="-mt-2 mb-3 text-sm font-medium text-danger" role="alert">
            {error}
          </p>
        ) : null}

        {showCrisis ? <CrisisResources urgent className="mb-4" /> : null}

        <div className="mt-2 flex flex-col gap-2">
          <Button type="submit" loading={pending === "save"} disabled={pending !== null && pending !== "save"}>
            {saveLabel ?? (mode === "edit" ? "Save" : "Save and continue")}
          </Button>
          {onBack || onSkip ? (
            <div className="flex gap-2">
              {onBack ? (
                <Button variant="secondary" className="flex-1" onClick={onBack} disabled={pending !== null}>
                  {mode === "edit" ? "Cancel" : "Back"}
                </Button>
              ) : null}
              {onSkip ? (
                <Button variant="ghost" className="flex-1" onClick={onSkip} loading={pending === "skip"} disabled={pending !== null && pending !== "skip"}>
                  {mode === "edit" ? "Skip this one" : "Skip"}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </Card>
    </form>
  );
}
