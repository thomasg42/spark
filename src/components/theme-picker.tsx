"use client";
import type { AccentTheme, ColorMode } from "@/lib/backend/types";
import { ACCENTS, ACCENT_ORDER, COLOR_MODES } from "@/lib/domain/themes";
import { cx } from "@/lib/ui/cx";

export function ThemePicker({ accent, mode, onAccent, onMode }: { accent: AccentTheme; mode: ColorMode; onAccent: (a: AccentTheme) => void; onMode: (m: ColorMode) => void }) {
  return (
    <div>
      <fieldset className="mb-4">
        <legend className="mb-2 text-base font-semibold text-ink">Your accent color</legend>
        <p className="mb-2 text-sm text-muted">Only changes your own view. Your partner picks theirs.</p>
        <div className="flex flex-wrap gap-2">
          {ACCENT_ORDER.map((key) => (
            <label key={key} className="cursor-pointer">
              <input type="radio" name="accent" className="peer sr-only" checked={accent === key} onChange={() => onAccent(key)} />
              <span
                className={cx(
                  "flex min-h-12 items-center gap-2 rounded-full border px-4 font-semibold transition peer-focus-visible:outline peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--accent)]",
                  accent === key ? "border-ink bg-surface-2 text-ink" : "border-line bg-surface text-ink",
                )}
              >
                <span aria-hidden className="h-5 w-5 rounded-full border border-line" style={{ background: ACCENTS[key].light.deco }} />
                {ACCENTS[key].label}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="mb-4">
        <legend className="mb-2 text-base font-semibold text-ink">Light or dark</legend>
        <div className="flex flex-wrap gap-2">
          {COLOR_MODES.map((m) => (
            <label key={m.value} className="cursor-pointer">
              <input type="radio" name="mode" className="peer sr-only" checked={mode === m.value} onChange={() => onMode(m.value)} />
              <span className={cx("flex min-h-12 items-center rounded-full border px-4 font-semibold peer-focus-visible:outline peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--accent)]", mode === m.value ? "border-ink bg-surface-2 text-ink" : "border-line bg-surface text-ink")}>
                {m.label}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
