"use client";
import { ChoiceGroup, ScaleInput, TextAreaField, TextField } from "@/components/ui";
import { TEXT_ANSWER_MAX, type Question } from "@shared/questionnaires.ts";
import type { Draft } from "./flow";

function Prompt({ text }: { text: string }) {
  return <span className="block text-xl font-bold leading-snug text-ink">{text}</span>;
}

/** Renders the right labelled input for a question kind. */
export function QuestionField({ question, draft, onChange, error }: { question: Question; draft: Draft; onChange: (draft: Draft) => void; error?: string | null }) {
  switch (question.kind) {
    case "text": {
      const shared = {
        label: <Prompt text={question.prompt} />,
        hint: question.help,
        error,
        value: typeof draft === "string" ? draft : "",
        onChange: (v: string) => onChange(v),
        placeholder: question.placeholder,
        maxLength: TEXT_ANSWER_MAX,
        name: question.id,
      };
      return question.long ? <TextAreaField rows={6} {...shared} /> : <TextField {...shared} />;
    }
    case "single":
      return (
        <ChoiceGroup
          legend={<Prompt text={question.prompt} />}
          hint={question.help}
          name={question.id}
          options={question.options}
          value={typeof draft === "string" ? draft : null}
          onChange={(v: string) => onChange(v)}
        />
      );
    case "multi": {
      const pick = question.max ? `Pick up to ${question.max}.` : "Pick any that fit.";
      return (
        <ChoiceGroup
          legend={<Prompt text={question.prompt} />}
          hint={question.help ? `${question.help} ${pick}` : pick}
          name={question.id}
          multiple
          options={question.options}
          value={Array.isArray(draft) ? draft : []}
          onChange={(v: string[]) => {
            // Keep options in their listed order so answers read naturally later.
            const chosen = new Set(v);
            onChange(question.options.filter((o) => chosen.has(o.value)).map((o) => o.value));
          }}
        />
      );
    }
    case "scale":
      return (
        <ScaleInput
          legend={<Prompt text={question.prompt} />}
          hint={question.help}
          name={question.id}
          minLabel={question.minLabel}
          maxLabel={question.maxLabel}
          value={typeof draft === "number" ? draft : null}
          onChange={(v) => onChange(v)}
        />
      );
  }
}
