"use client";
import { useId, useMemo, useState, type FormEvent } from "react";
import { useApp } from "@/components/app-provider";
import { Button, Card, Notice, TextField, useToast } from "@/components/ui";
import type { Couple } from "@/lib/backend/types";
import { toISODate } from "@/lib/domain/dates";
import { useAction } from "@/lib/ui/hooks";
import { personName } from "@/components/agreements/view-model";
import { couplePatchFrom, coupleFormFrom, hasErrors, isCoupleFormDirty, LIMITS, validateCoupleForm, type CoupleFormValues } from "./form-model";

/** Shared couple details: city (for date ideas) and the date you got together. */
export function CoupleCard() {
  const { couple } = useApp();
  if (!couple) return null;
  return <CoupleForm key={couple.id} couple={couple} />;
}

function CoupleForm({ couple }: { couple: Couple }) {
  const { backend, partner, setCouple } = useApp();
  const toast = useToast();
  const headingId = useId();
  const today = useMemo(() => new Date(), []);
  const [values, setValues] = useState<CoupleFormValues>(() => coupleFormFrom(couple));
  const [touched, setTouched] = useState(false);
  const errors = validateCoupleForm(values, today);
  const shown = touched ? errors : {};
  const dirty = isCoupleFormDirty(values, couple);

  const save = useAction(async () => {
    const saved = await backend.couple.update(couplePatchFrom(values, couple));
    setCouple(saved);
    setValues(coupleFormFrom(saved));
    return saved;
  });

  const set = (key: keyof CoupleFormValues) => (value: string) => setValues((v) => ({ ...v, [key]: value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (hasErrors(errors)) return;
    if (!dirty) {
      toast.show("Already up to date");
      return;
    }
    const saved = await save.run();
    if (saved) {
      setTouched(false);
      toast.show("Saved for both of you");
    }
  };

  return (
    <Card as="section" aria-labelledby={headingId} className="fade-up mt-4">
      <h2 id={headingId} className="text-xl font-bold text-ink">
        The two of you
      </h2>
      <p className="mb-4 mt-1 text-sm text-muted">Shared with {personName(partner)}. Either of you can change these.</p>
      <form onSubmit={submit} noValidate>
        <TextField label="City" optional value={values.city} onChange={set("city")} hint="Used for date ideas." maxLength={LIMITS.city} placeholder="City, state" autoComplete="address-level2" error={shown.city} />
        <TextField label="Together since" optional type="date" value={values.togetherSince} onChange={set("togetherSince")} max={toISODate(today)} min="1900-01-01" error={shown.togetherSince} />
        {save.error ? (
          <Notice tone="danger" className="mb-3" title="That didn't save.">
            {save.error}
          </Notice>
        ) : null}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button type="submit" loading={save.pending} className="w-full sm:w-auto">
            Save details
          </Button>
          <p className="text-sm text-muted" aria-live="polite">
            {dirty ? "You have unsaved changes." : ""}
          </p>
        </div>
      </form>
    </Card>
  );
}
