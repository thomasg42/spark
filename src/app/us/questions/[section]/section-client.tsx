"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useApp } from "@/components/app-provider";
import { CrisisResources } from "@/components/crisis-resources";
import { AnswerReview } from "@/components/questions/answer-review";
import {
  answersMentionCrisis,
  draftMentionsCrisis,
  draftToValue,
  emptyMessage,
  initialDraft,
  isUnchanged,
  nextInSitting,
  resumePosition,
  toSavedMap,
  type Draft,
  type Position,
  type SavedMap,
} from "@/components/questions/flow";
import { QuestionStep } from "@/components/questions/question-step";
import { RequireStage } from "@/components/require-stage";
import { Button, ButtonLink, Card, EmptyState, LoadingBlock, Notice, PageHeader, useToast } from "@/components/ui";
import { messageOf, type SavedAnswer } from "@/lib/backend/types";
import { useLoad } from "@/lib/ui/hooks";
import { findQuestion, findSection, sectionProgress, type Question, type Section } from "@shared/questionnaires.ts";

type Mode =
  | { kind: "asking"; pos: Position }
  | { kind: "sittingDone"; finished: number }
  | { kind: "review" }
  | { kind: "edit"; questionId: string };

const BACK = { href: "/us/questions/", label: "Questions" };

function questionAt(section: Section, pos: Position): Question | undefined {
  return section.sittings[pos.sitting]?.questions[pos.question];
}

function questionFor(section: Section, mode: Mode): Question | undefined {
  if (mode.kind === "asking") return questionAt(section, mode.pos);
  if (mode.kind === "edit") return findQuestion(mode.questionId)?.question;
  return undefined;
}

/** The previous question, crossing back into the previous sitting if needed. */
function previousPosition(section: Section, pos: Position): Position | null {
  if (pos.question > 0) return { sitting: pos.sitting, question: pos.question - 1 };
  const prev = section.sittings[pos.sitting - 1];
  return prev ? { sitting: pos.sitting - 1, question: prev.questions.length - 1 } : null;
}

function SectionFlow({ section, initial }: { section: Section; initial: SavedAnswer[] }) {
  const { backend } = useApp();
  const toast = useToast();
  const [saved, setSaved] = useState<SavedMap>(() => toSavedMap(initial));
  const [mode, setMode] = useState<Mode>(() => {
    const pos = resumePosition(section, toSavedMap(initial));
    return pos ? { kind: "asking", pos } : { kind: "review" };
  });
  const [draft, setDraft] = useState<Draft>(() => {
    const map = toSavedMap(initial);
    const pos = resumePosition(section, map);
    const q = pos ? questionAt(section, pos) : undefined;
    return q ? initialDraft(q, map[q.id]) : null;
  });
  const [pending, setPending] = useState<null | "save" | "skip">(null);
  const [error, setError] = useState<string | null>(null);
  const [moved, setMoved] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [clearing, setClearing] = useState<string | null>(null);
  const doneHeading = useRef<HTMLHeadingElement>(null);

  const progress = sectionProgress(section, saved);
  const current = questionFor(section, mode);
  const savedList = Object.values(saved);
  const supportNeeded = answersMentionCrisis(savedList);

  useEffect(() => {
    if (mode.kind === "sittingDone" && moved) doneHeading.current?.focus();
  }, [mode, moved]);

  const show = (next: Mode, map: SavedMap = saved) => {
    setMode(next);
    setError(null);
    const q = questionFor(section, next);
    if (q) setDraft(initialDraft(q, map[q.id]));
    setMoved(true);
    if (next.kind === "review" || next.kind === "sittingDone") window.scrollTo({ top: 0 });
  };

  const advance = (map: SavedMap) => {
    if (mode.kind === "edit") {
      show({ kind: "review" }, map);
      return;
    }
    if (mode.kind !== "asking") return;
    const next = nextInSitting(section, map, mode.pos);
    show(next ? { kind: "asking", pos: next } : { kind: "sittingDone", finished: mode.pos.sitting }, map);
  };

  const save = async () => {
    if (!current || pending) return;
    if (isUnchanged(current, draft, saved[current.id])) {
      advance(saved);
      return;
    }
    const value = draftToValue(current, draft);
    if (value === null) {
      const existing = saved[current.id];
      // Skip is hidden on answered questions, so point to Clear instead of a button that isn't there.
      setError(existing && !existing.skipped ? "Add an answer to save it. To remove it instead, use Clear on the Review page." : emptyMessage(current));
      return;
    }
    setPending("save");
    setError(null);
    try {
      const answer = await backend.answers.save(current.id, value);
      const map = { ...saved, [current.id]: answer };
      setSaved(map);
      setAnnouncement("Saved. Only you can see it.");
      if (mode.kind === "edit") toast.show("Saved");
      advance(map);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setPending(null);
    }
  };

  const skip = async () => {
    if (!current || pending) return;
    setPending("skip");
    setError(null);
    try {
      const answer = await backend.answers.skip(current.id);
      const map = { ...saved, [current.id]: answer };
      setSaved(map);
      setAnnouncement("Skipped. You can come back to it any time.");
      advance(map);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setPending(null);
    }
  };

  const clear = async (questionId: string): Promise<boolean> => {
    setClearing(questionId);
    try {
      await backend.answers.clear(questionId);
      setSaved((prev) => {
        const next = { ...prev };
        delete next[questionId];
        return next;
      });
      toast.show("Answer cleared");
      return true;
    } catch (e) {
      toast.show(messageOf(e), "error");
      return false;
    } finally {
      setClearing(null);
    }
  };

  const keepGoing = () => {
    const pos = resumePosition(section, saved);
    if (pos) show({ kind: "asking", pos });
  };

  const hasAnswers = savedList.some((a) => a.section === section.key);
  const headerAction =
    mode.kind === "asking" && hasAnswers ? (
      <Button variant="ghost" className="px-3" onClick={() => show({ kind: "review" })}>
        Review
      </Button>
    ) : null;

  let body: ReactNode = null;

  if ((mode.kind === "asking" || mode.kind === "edit") && current) {
    const sitting = mode.kind === "asking" ? section.sittings[mode.pos.sitting] : findQuestion(current.id)?.sitting;
    const total = sitting?.questions.length ?? 0;
    const index = mode.kind === "asking" ? mode.pos.question : (sitting?.questions.findIndex((q) => q.id === current.id) ?? 0);
    const existing = saved[current.id];
    const unchanged = isUnchanged(current, draft, existing);
    const answered = Boolean(existing && !existing.skipped);
    const heading = mode.kind === "asking" ? `Question ${index + 1} of ${total} in “${sitting?.title ?? section.title}”` : `Editing your answer in “${sitting?.title ?? section.title}”`;
    const back = mode.kind === "edit" ? () => show({ kind: "review" }) : previousPosition(section, mode.pos);
    body = (
      <>
        <QuestionStep
          question={current}
          heading={heading}
          progress={mode.kind === "asking" ? { value: index + 1, max: total } : undefined}
          draft={draft}
          onDraft={(d) => {
            setDraft(d);
            if (error) setError(null);
          }}
          onSave={save}
          onSkip={answered ? null : skip}
          onBack={typeof back === "function" ? back : back ? () => show({ kind: "asking", pos: back }) : null}
          mode={mode.kind === "edit" ? "edit" : "flow"}
          pending={pending}
          error={error}
          saveLabel={unchanged ? (mode.kind === "edit" ? "Done" : "Continue") : undefined}
          focusOnMount={moved}
        />
        {supportNeeded && !draftMentionsCrisis(current, draft) ? <CrisisResources compact className="mt-4" /> : null}
        <p className="mt-4 text-center text-sm text-muted">Your progress saves after every answer. Leave whenever you like.</p>
      </>
    );
  } else if (mode.kind === "sittingDone") {
    const nextPos = resumePosition(section, saved);
    const nextSitting = nextPos ? section.sittings[nextPos.sitting] : undefined;
    body = (
      <>
        <Card className="pop text-center">
          <p className="text-4xl" aria-hidden>
            🌿
          </p>
          <h2 ref={doneHeading} tabIndex={-1} className="mt-3 text-2xl font-bold text-ink focus:outline-none">
            Nice. That&apos;s a sitting.
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-muted">
            {nextSitting
              ? "Your answers are saved, and only you can see them. Keep going if you feel like it, or come back another day. There's no rush."
              : `That's everything in ${section.title}. Your answers are saved, and only you can see them.`}
          </p>
          <div className="mx-auto mt-5 flex max-w-sm flex-col gap-2">
            {nextSitting ? <Button onClick={keepGoing}>Next sitting: {nextSitting.title}</Button> : null}
            <ButtonLink href="/us/questions/" variant={nextSitting ? "secondary" : "primary"}>
              {nextSitting ? "Take a break" : "Back to all questions"}
            </ButtonLink>
            <Button variant="ghost" onClick={() => show({ kind: "review" })}>
              Review my answers
            </Button>
          </div>
        </Card>
        {supportNeeded ? <CrisisResources compact className="mt-4" /> : null}
      </>
    );
  } else {
    body = (
      <>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-ink">Review my answers</h2>
          {!progress.done ? (
            <Button variant="secondary" onClick={keepGoing}>
              Keep going
            </Button>
          ) : null}
        </div>
        <p className="mb-4 flex items-center gap-2 text-sm text-muted">
          <span aria-hidden>🔒</span> Only you can see this page. Your partner never will.
        </p>
        {progress.done ? (
          <Notice tone="success" className="mb-4" title="Every question here has an answer or a skip.">
            Change anything, any time. Your answers are yours.
          </Notice>
        ) : null}
        {supportNeeded ? <CrisisResources urgent className="mb-4" /> : null}
        <AnswerReview section={section} saved={saved} onEdit={(questionId) => show({ kind: "edit", questionId })} onClear={clear} clearing={clearing} />
      </>
    );
  }

  return (
    <>
      <PageHeader title={section.title} subtitle={section.blurb} back={BACK} action={headerAction} />
      <p className="sr-only" aria-live="polite" role="status">
        {announcement}
      </p>
      {body}
    </>
  );
}

function SectionLoader({ sectionKey }: { sectionKey: string }) {
  const { backend, user } = useApp();
  const section = findSection(sectionKey);
  const owner = user?.id ?? null;
  // Remember whose answers were loaded, so a demo partner switch never shows the other person's answers, even for a frame.
  const { data, error, loading, reload } = useLoad(async () => ({ owner, list: section ? await backend.answers.list(section.key) : [] }), [section?.key, owner]);

  if (!section) {
    return (
      <>
        <PageHeader title="Questions" back={BACK} />
        <EmptyState emoji="🧭" title="We couldn't find that set" body="It may have moved. Pick a set from the list." action={<ButtonLink href="/us/questions/">See all questions</ButtonLink>} />
      </>
    );
  }

  if (error) {
    return (
      <>
        <PageHeader title={section.title} subtitle={section.blurb} back={BACK} />
        <Notice tone="danger" title="Your answers didn't load.">
          {error}
        </Notice>
        <Button variant="secondary" className="mt-4" onClick={() => void reload()}>
          Try again
        </Button>
      </>
    );
  }

  if (loading || !data || data.owner !== owner) {
    return (
      <>
        <PageHeader title={section.title} subtitle={section.blurb} back={BACK} />
        <LoadingBlock label="Loading your answers…" />
      </>
    );
  }

  return <SectionFlow key={owner ?? "signed-out"} section={section} initial={data.list} />;
}

export function SectionClient({ sectionKey }: { sectionKey: string }) {
  return (
    <RequireStage allow="ready">
      <SectionLoader sectionKey={sectionKey} />
    </RequireStage>
  );
}
