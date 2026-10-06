"use client";
import { useState } from "react";
import { Badge, Button } from "@/components/ui";
import type { Section } from "@shared/questionnaires.ts";
import { formatAnswer, type SavedMap } from "./flow";

/** Every question in a section with the person's own answer, plus Edit and Clear. */
export function AnswerReview({
  section,
  saved,
  onEdit,
  onClear,
  clearing,
}: {
  section: Section;
  saved: SavedMap;
  onEdit: (questionId: string) => void;
  onClear: (questionId: string) => Promise<boolean>;
  clearing: string | null;
}) {
  const [confirming, setConfirming] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      {section.sittings.map((sitting, sittingIndex) => (
        <section key={sitting.id} aria-labelledby={`review-${sitting.id}`}>
          <h3 id={`review-${sitting.id}`} className="mb-3 text-lg font-bold text-ink">
            <span className="mr-2 text-sm font-semibold text-muted">Sitting {sittingIndex + 1}</span>
            {sitting.title}
          </h3>
          <ol className="space-y-3">
            {sitting.questions.map((question) => {
              const answer = saved[question.id];
              const isConfirming = confirming === question.id;
              return (
                <li key={question.id} className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
                  <p className="font-semibold text-ink">{question.prompt}</p>
                  <div className="mt-2">
                    {!answer ? (
                      <Badge tone="muted">Not answered yet</Badge>
                    ) : answer.skipped ? (
                      <p className="text-sm text-muted">
                        <Badge tone="muted">Skipped</Badge> <span className="ml-1">You can answer any time.</span>
                      </p>
                    ) : (
                      <p className="whitespace-pre-wrap break-words text-ink">{formatAnswer(question, answer.value)}</p>
                    )}
                  </div>

                  {isConfirming ? (
                    <div className="mt-3 rounded-2xl bg-surface-2 p-3" role="group" aria-label="Confirm clearing this answer">
                      <p className="text-sm text-ink">Clear this answer? It will be gone for good, and the question will be waiting for you again.</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button
                          variant="danger"
                          loading={clearing === question.id}
                          onClick={async () => {
                            if (await onClear(question.id)) setConfirming(null);
                          }}
                        >
                          Yes, clear it
                        </Button>
                        <Button variant="secondary" autoFocus onClick={() => setConfirming(null)} disabled={clearing === question.id}>
                          Keep it
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button variant="secondary" onClick={() => onEdit(question.id)} aria-label={`${answer && !answer.skipped ? "Edit" : "Answer"}: ${question.prompt}`}>
                        {answer && !answer.skipped ? "Edit" : "Answer"}
                      </Button>
                      {answer ? (
                        <Button variant="ghost" onClick={() => setConfirming(question.id)} aria-label={`Clear: ${question.prompt}`}>
                          Clear
                        </Button>
                      ) : null}
                    </div>
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
