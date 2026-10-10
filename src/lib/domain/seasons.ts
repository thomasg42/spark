/**
 * Northern-hemisphere seasons drive the app's background scene. The dates are
 * fixed calendar boundaries (not astronomical), so every device agrees:
 * spring Mar 20–Jun 20, summer Jun 21–Sep 21, fall Sep 22–Dec 20, winter Dec 21–Mar 19.
 * Scenes are original SVGs in public/seasons/ — no photos, nothing hotlinked.
 */
export type Season = "spring" | "summer" | "fall" | "winter";

export const SEASONS: Record<Season, { label: string; file: string; picture: string }> = {
  spring: { label: "Spring", file: "seasons/spring.svg", picture: "Cherry blossoms" },
  summer: { label: "Summer", file: "seasons/summer.svg", picture: "A warm sun" },
  fall: { label: "Fall", file: "seasons/fall.svg", picture: "Falling leaves" },
  winter: { label: "Winter", file: "seasons/winter.svg", picture: "Snowflakes" },
};

/** Uses the local calendar date, so a new season begins at the viewer's midnight. */
export function seasonOf(date: Date): Season {
  const md = (date.getMonth() + 1) * 100 + date.getDate();
  if (md >= 320 && md <= 620) return "spring";
  if (md >= 621 && md <= 921) return "summer";
  if (md >= 922 && md <= 1220) return "fall";
  return "winter";
}

/** Public URL for a season scene, honouring the GitHub Pages base path. */
export function seasonUrl(season: Season, basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ""): string {
  return `${basePath.replace(/\/$/, "")}/${SEASONS[season].file}`;
}
