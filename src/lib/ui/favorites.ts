/**
 * Home-screen favorites: the shortcuts each person keeps on their home page.
 * Tab destinations (Moments, Check-in, Plans, Us) are deliberately NOT offered,
 * because the bottom bar already reaches them. Screens one level down (Spark
 * Buddy, Projects, Money) are, since they take an extra tap otherwise. Saved per person on this device.
 */
export const FAVORITE_CATALOG = [
  { id: "buddy", href: "/us/buddy/", icon: "✦", title: "Spark Buddy" },
  { id: "projects", href: "/plans/projects/", icon: "🔨", title: "Projects" },
  { id: "money", href: "/plans/money/", icon: "💵", title: "Money" },
  { id: "ideas", href: "/plans/ideas/", icon: "💡", title: "Date ideas" },
  { id: "pulse", href: "/checkin/pulse/", icon: "💓", title: "Quick check-in" },
  { id: "monthly", href: "/checkin/monthly/", icon: "🗓️", title: "Monthly check-in" },
  { id: "notes", href: "/checkin/notes/", icon: "💌", title: "Appreciation notes" },
  { id: "story", href: "/us/story/", icon: "📖", title: "Our Story" },
  { id: "questions", href: "/us/questions/", icon: "🌱", title: "Questions" },
  { id: "log", href: "/plans/new/", icon: "📝", title: "Log a date" },
  { id: "agreements", href: "/us/agreements/", icon: "🤝", title: "Our agreements" },
] as const;

export type FavoriteId = (typeof FAVORITE_CATALOG)[number]["id"];
export const DEFAULT_FAVORITES: FavoriteId[] = ["buddy", "projects", "ideas", "notes", "story", "questions"];

const key = (userId: string) => `spark-favorites:${userId}`;
const isFavoriteId = (v: unknown): v is FavoriteId => typeof v === "string" && FAVORITE_CATALOG.some((f) => f.id === v);

/** Parses a stored list, dropping unknown ids and duplicates; falls back to defaults. */
export function parseFavorites(raw: string | null | undefined): FavoriteId[] {
  if (!raw) return [...DEFAULT_FAVORITES];
  try {
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [...DEFAULT_FAVORITES];
    return [...new Set(list.filter(isFavoriteId))];
  } catch {
    return [...DEFAULT_FAVORITES];
  }
}

/** Keeps catalog order so the list stays stable as people add and remove items. */
export function toggleFavorite(list: FavoriteId[], id: FavoriteId): FavoriteId[] {
  const next = new Set(list);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return FAVORITE_CATALOG.map((f) => f.id).filter((x) => next.has(x));
}

export function loadFavorites(userId: string): FavoriteId[] {
  try {
    return parseFavorites(localStorage.getItem(key(userId)));
  } catch {
    return [...DEFAULT_FAVORITES];
  }
}

export function saveFavorites(userId: string, list: FavoriteId[]) {
  try {
    localStorage.setItem(key(userId), JSON.stringify(list));
  } catch {
    // Storage blocked: the change lasts for this visit only.
  }
}
