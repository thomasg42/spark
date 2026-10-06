"use client";
import { useId, useRef, useState } from "react";
import { useApp } from "@/components/app-provider";
import { ThemePicker } from "@/components/theme-picker";
import { Card, Notice, useToast } from "@/components/ui";
import { messageOf, type AccentTheme, type ColorMode, type Profile } from "@/lib/backend/types";

type Look = { accentTheme: AccentTheme; colorMode: ColorMode };
const lookOf = (p: Profile): Look => ({ accentTheme: p.accentTheme, colorMode: p.colorMode });

/** Accent color and light/dark. Applies instantly (setProfile applies the theme), then saves. */
export function LookCard() {
  const { backend, profile, setProfile } = useApp();
  const toast = useToast();
  const headingId = useId();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const latest = useRef<Profile | null>(profile);
  latest.current = profile;
  // Last look the server confirmed, so a failed save can put things back.
  const confirmed = useRef<{ userId: string; look: Look } | null>(null);
  if (profile && confirmed.current?.userId !== profile.userId) confirmed.current = { userId: profile.userId, look: lookOf(profile) };

  if (!profile) return null;

  const apply = async (look: Look) => {
    const current = latest.current;
    if (!current) return;
    setProfile({ ...current, ...look });
    const run = ++seq.current;
    setPending(true);
    setError(null);
    try {
      // Always send the whole look so the newest request carries the full intent.
      const saved = await backend.profiles.update(look);
      if (run !== seq.current) return;
      confirmed.current = { userId: saved.userId, look: lookOf(saved) };
      setProfile(saved);
      toast.show("Look saved");
    } catch (e) {
      if (run !== seq.current) return;
      const base = latest.current ?? current;
      setProfile({ ...base, ...(confirmed.current?.look ?? lookOf(current)) });
      setError(messageOf(e));
    } finally {
      if (run === seq.current) setPending(false);
    }
  };

  return (
    <Card as="section" aria-labelledby={headingId} className="fade-up mt-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id={headingId} className="text-xl font-bold text-ink">
          Look
        </h2>
        <p role="status" className="text-sm text-muted">
          {pending ? "Saving…" : ""}
        </p>
      </div>
      <ThemePicker
        accent={profile.accentTheme}
        mode={profile.colorMode}
        onAccent={(accentTheme) => void apply({ accentTheme, colorMode: profile.colorMode })}
        onMode={(colorMode) => void apply({ accentTheme: profile.accentTheme, colorMode })}
      />
      {error ? (
        <Notice tone="danger" title="Your look didn't save.">
          {error} We put your last saved look back.
        </Notice>
      ) : null}
    </Card>
  );
}
