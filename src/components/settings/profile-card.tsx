"use client";
import { useId, useState, type FormEvent } from "react";
import { useApp } from "@/components/app-provider";
import { Button, Card, Notice, TextField, useToast } from "@/components/ui";
import type { Profile } from "@/lib/backend/types";
import { formatDate } from "@/lib/domain/dates";
import { useAction } from "@/lib/ui/hooks";
import { hasErrors, isProfileFormDirty, LIMITS, profileFormFrom, profilePatchFrom, validateProfileForm, type ProfileFormValues } from "./form-model";

/** Name, nickname, birth time and place. Birthday is shown but not editable here. */
export function ProfileCard() {
  const { profile } = useApp();
  if (!profile) return null;
  // Keyed by user so the form resets if the signed-in person changes (demo persona switch).
  return <ProfileForm key={profile.userId} profile={profile} />;
}

function ProfileForm({ profile }: { profile: Profile }) {
  const { backend, setProfile } = useApp();
  const toast = useToast();
  const headingId = useId();
  const [values, setValues] = useState<ProfileFormValues>(() => profileFormFrom(profile));
  const [touched, setTouched] = useState(false);
  const errors = validateProfileForm(values);
  const shown = touched ? errors : {};
  const dirty = isProfileFormDirty(values, profile);

  const save = useAction(async () => {
    const saved = await backend.profiles.update(profilePatchFrom(values, profile));
    setProfile(saved);
    setValues(profileFormFrom(saved));
    return saved;
  });

  const set = (key: keyof ProfileFormValues) => (value: string) => setValues((v) => ({ ...v, [key]: value }));

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
      toast.show("Profile saved");
    }
  };

  return (
    <Card as="section" aria-labelledby={headingId} className="fade-up">
      <h2 id={headingId} className="text-xl font-bold text-ink">
        Profile
      </h2>
      <p className="mb-4 mt-1 text-sm text-muted">Your partner sees your name, nickname, birth time and birth place.</p>
      <form onSubmit={submit} noValidate>
        <TextField label="Your name" value={values.displayName} onChange={set("displayName")} autoComplete="given-name" maxLength={LIMITS.displayName} error={shown.displayName} required />
        <TextField label="Nickname" optional value={values.nickname} onChange={set("nickname")} maxLength={LIMITS.nickname} hint="What your partner calls you." error={shown.nickname} />

        <div className="mb-4">
          <p className="mb-1 text-sm font-semibold text-ink">Birthday</p>
          <p className="flex min-h-12 items-center rounded-2xl border border-dashed border-line bg-surface-2 px-4 text-ink">{formatDate(profile.birthday)}</p>
          <p className="mt-1.5 text-sm text-muted">Your birthday can&apos;t be changed here. It&apos;s how Spark confirms everyone is 18 or older.</p>
        </div>

        <TextField label="Birth time" optional type="time" value={values.birthTime} onChange={set("birthTime")} hint="Just for fun and reflection, not prediction." error={shown.birthTime} />
        <TextField label="Birth place" optional value={values.birthPlace} onChange={set("birthPlace")} maxLength={LIMITS.birthPlace} placeholder="City, country" error={shown.birthPlace} />

        {save.error ? (
          <Notice tone="danger" className="mb-3" title="That didn't save.">
            {save.error}
          </Notice>
        ) : null}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button type="submit" loading={save.pending} className="w-full sm:w-auto">
            Save profile
          </Button>
          <p className="text-sm text-muted" aria-live="polite">
            {dirty ? "You have unsaved changes." : ""}
          </p>
        </div>
      </form>
    </Card>
  );
}
