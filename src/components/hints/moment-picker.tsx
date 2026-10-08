"use client";
/** "When should it show?" for a hint (Module H): always, or only in a moment it helps most. */
import { SelectField } from "@/components/ui";
import type { HintMoment } from "@/lib/backend/types";
import { HINT_MOMENT_COPY, HINT_MOMENTS } from "@shared/buddy.ts";

const OPTIONS: Array<{ value: HintMoment | "always"; label: string }> = [
  { value: "always", label: "Always" },
  ...HINT_MOMENTS.map((m) => ({ value: m, label: HINT_MOMENT_COPY[m].label })),
];

export function MomentPicker({ value, onChange }: { value: HintMoment | null; onChange(next: HintMoment | null): void }) {
  return (
    <SelectField
      label="When should it show?"
      hint="A hint can wait for the moment it helps most."
      value={value ?? "always"}
      onChange={(v) => onChange(v === "always" ? null : v)}
      options={OPTIONS}
    />
  );
}
