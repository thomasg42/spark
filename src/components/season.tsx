"use client";
import { useEffect, useState, type ReactNode } from "react";
import { SEASONS, seasonOf, seasonUrl, type Season } from "@/lib/domain/seasons";
import { cx } from "@/lib/ui/cx";

/**
 * The current season, rechecked every few minutes so the scene turns over on the day it changes.
 * Null until mounted: the static build date must never be baked into the page.
 */
export function useSeason(): Season | null {
  const [season, setSeason] = useState<Season | null>(null);
  useEffect(() => {
    const tick = () => setSeason(seasonOf(new Date()));
    tick();
    const timer = setInterval(tick, 5 * 60 * 1000);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", tick);
    };
  }, []);
  return season;
}

/** Full-app scene behind everything. Decorative only. */
export function SeasonBackdrop({ season }: { season: Season | null }) {
  if (!season) return null;
  return <div aria-hidden className="season-backdrop" data-season={season} style={{ backgroundImage: `url("${seasonUrl(season)}")` }} />;
}

/** Small corner label naming the season. */
export function SeasonLabel({ season }: { season: Season | null }) {
  if (!season) return null;
  return (
    <span className="rounded-full border border-line bg-surface/90 px-2.5 py-0.5 text-xs font-semibold text-ink" data-testid="season-label">
      {SEASONS[season].label}
    </span>
  );
}

/** One small seasonal picture (decorative). */
export function SeasonMark({ className }: { className?: string }) {
  const season = useSeason();
  if (!season) return <span aria-hidden className={className} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={seasonUrl(season)} alt="" aria-hidden className={cx("object-cover", className)} />;
}

/** Picture behind words: the seasonal scene with the message on a light panel so it stays readable. */
export function SeasonPanel({ children, className }: { children: ReactNode; className?: string }) {
  const season = useSeason();
  return (
    <span className={cx("season-panel", className)} style={season ? { backgroundImage: `url("${seasonUrl(season)}")` } : undefined}>
      <span className="season-panel-words">{children}</span>
    </span>
  );
}
