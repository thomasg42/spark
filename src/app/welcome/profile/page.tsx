"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { applyTheme, useApp } from "@/components/app-provider";
import { RequireStage } from "@/components/require-stage";
import { ThemePicker } from "@/components/theme-picker";
import { Button, Card, ChoiceGroup, Notice, PageHeader, TextField } from "@/components/ui";
import type { AccentTheme, ColorMode, PickableCadence, SocialLevel } from "@/lib/backend/types";
import { messageOf } from "@/lib/backend/types";
import { CADENCE_LABELS, PICKABLE_CADENCES } from "@/lib/domain/cadence";
import { isAdult } from "@/lib/domain/dates";
import { SOCIAL_COPY, SOCIAL_LEVELS } from "@/lib/domain/social";

function ProfileForm() {
  const { backend, setProfile, refresh } = useApp();
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [nickname, setNickname] = useState("");
  const [birthday, setBirthday] = useState("");
  const [adult, setAdult] = useState(false);
  const [birthTime, setBirthTime] = useState("");
  const [birthPlace, setBirthPlace] = useState("");
  const [accent, setAccent] = useState<AccentTheme>("rose");
  const [mode, setMode] = useState<ColorMode>("system");
  const [cadence, setCadence] = useState<PickableCadence>("weekly");
  const [social, setSocial] = useState<SocialLevel | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const nameError = touched && !displayName.trim() ? "Add the name your partner knows you by." : null;
  const birthdayError = touched && birthday && !isAdult(birthday, new Date()) ? "Spark is only for adults 18 and older." : touched && !birthday ? "Add your birthday." : null;
  const adultError = touched && !adult ? "Please confirm you are 18 or older." : null;

  const submit = async () => {
    setTouched(true);
    if (!displayName.trim() || !birthday || !isAdult(birthday, new Date()) || !adult) return;
    setPending(true);
    setError(null);
    try {
      const profile = await backend.profiles.create({
        displayName,
        nickname: nickname || null,
        birthday,
        birthTime: birthTime || null,
        birthPlace: birthPlace || null,
        accentTheme: accent,
        colorMode: mode,
        preferredCadence: cadence,
        socialSharing: social,
        adultConfirmed: true,
      });
      setProfile(profile);
      await refresh();
      router.push("/welcome/pair/");
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setPending(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      noValidate
    >
      <PageHeader title="About you" subtitle="Your partner will see your name, nickname, colors and rhythm. Everything else you answer later is private." />
      <Card>
        <TextField label="Your name" value={displayName} onChange={setDisplayName} autoComplete="given-name" maxLength={60} error={nameError} required />
        <TextField label="Nickname" optional value={nickname} onChange={setNickname} maxLength={40} hint="What your partner calls you." />
        <TextField label="Birthday" type="date" value={birthday} onChange={setBirthday} error={birthdayError} required max={new Date().toISOString().slice(0, 10)} />
        <label className="mb-1 flex min-h-12 cursor-pointer items-start gap-3 rounded-2xl border border-line px-4 py-3">
          <input type="checkbox" className="mt-1 h-5 w-5 accent-[var(--accent)]" checked={adult} onChange={(e) => setAdult(e.target.checked)} aria-describedby={adultError ? "adult-error" : undefined} />
          <span className="text-ink">I confirm I am 18 or older.</span>
        </label>
        {adultError ? (
          <p id="adult-error" role="alert" className="mb-3 text-sm font-medium text-danger">
            {adultError}
          </p>
        ) : null}
      </Card>

      <Card className="mt-4">
        <h2 className="mb-1 text-lg font-bold text-ink">Just for fun (optional)</h2>
        <p className="mb-3 text-sm text-muted">Birth time and place unlock a reflection card later. It is for fun and reflection, not prediction. Your partner can see these.</p>
        <TextField label="Birth time" optional type="time" value={birthTime} onChange={setBirthTime} />
        <TextField label="Birth place" optional value={birthPlace} onChange={setBirthPlace} maxLength={120} placeholder="City, country" />
      </Card>

      <Card className="mt-4">
        <ThemePicker
          accent={accent}
          mode={mode}
          onAccent={(a) => {
            setAccent(a);
            applyTheme({ accentTheme: a, colorMode: mode });
          }}
          onMode={(m) => {
            setMode(m);
            applyTheme({ accentTheme: accent, colorMode: m });
          }}
        />
      </Card>

      <Card className="mt-4">
        <ChoiceGroup
          legend="How often would you like relationship check-ins?"
          hint="Your partner picks too. Spark splits the difference and shows both choices."
          options={PICKABLE_CADENCES.map((c) => ({ value: c, label: CADENCE_LABELS[c] }))}
          value={cadence}
          onChange={setCadence}
        />
        <ChoiceGroup
          legend="How public do you want your relationship on social media?"
          hint="Optional for now. Your partner sees your choice, and Spark always uses the more private of your two picks."
          options={SOCIAL_LEVELS.map((s) => ({ value: s, label: SOCIAL_COPY[s].label, description: SOCIAL_COPY[s].detail }))}
          value={social}
          onChange={setSocial}
        />
      </Card>

      {error ? <Notice tone="danger" className="mt-4" title={error} /> : null}
      <Button type="submit" className="mt-5 w-full" loading={pending}>
        Save and continue
      </Button>
    </form>
  );
}

export default function WelcomeProfile() {
  return (
    <RequireStage allow="needsProfile">
      <ProfileForm />
    </RequireStage>
  );
}
