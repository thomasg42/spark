/**
 * Pure helpers for the Moments feed (no React, no DOM), unit tested in
 * tests/unit/moments-helpers.test.ts.
 */
import type { Moment, Reaction } from "@/lib/backend/types";
import { daysBetween } from "@/lib/domain/dates";
import { MAX_VIDEO_SECONDS, normalizeLink } from "@/lib/media-rules";
import { REACTION_VALUES } from "./moment-rules";

// ---------------------------------------------------------------------------
// Reactions
// ---------------------------------------------------------------------------
export interface ReactionInfo {
  value: Reaction;
  emoji: string;
  label: string;
  /** Finishes "Sam ..." / "You ..." in the who-reacted line. */
  verb: string;
}

const REACTION_INFO: Record<Reaction, Omit<ReactionInfo, "value">> = {
  heart: { emoji: "❤️", label: "Love", verb: "loved it" },
  laugh: { emoji: "😂", label: "Haha", verb: "laughed" },
  fire: { emoji: "🔥", label: "Fire", verb: "thought it was fire" },
  wow: { emoji: "😮", label: "Wow", verb: "said wow" },
  hug: { emoji: "🤗", label: "Hug", verb: "sent a hug" },
};

export const REACTIONS: ReactionInfo[] = REACTION_VALUES.map((value) => ({ value, ...REACTION_INFO[value] }));

export function reactionInfo(value: Reaction): ReactionInfo {
  return { value, ...REACTION_INFO[value] };
}

/** User ids per reaction, in display order. */
export function tallyReactions(reactions: Record<string, Reaction>): Record<Reaction, string[]> {
  const out = Object.fromEntries(REACTION_VALUES.map((r) => [r, [] as string[]])) as Record<Reaction, string[]>;
  for (const [userId, reaction] of Object.entries(reactions)) out[reaction]?.push(userId);
  return out;
}

/** "Sam laughed · You loved it". The viewer's own reaction comes last. */
export function reactionSummary(reactions: Record<string, Reaction>, meId: string | null | undefined, nameOf: (userId: string) => string): string {
  const entries = Object.entries(reactions).sort(([a], [b]) => (a === meId ? 1 : 0) - (b === meId ? 1 : 0));
  return entries.map(([userId, reaction]) => `${nameOf(userId)} ${REACTION_INFO[reaction]?.verb ?? "reacted"}`).join(" · ");
}

/** The reactions map after the viewer sets or clears their own reaction. */
export function withMyReaction(reactions: Record<string, Reaction>, meId: string, reaction: Reaction | null): Record<string, Reaction> {
  const next = { ...reactions };
  if (reaction) next[meId] = reaction;
  else delete next[meId];
  return next;
}

// ---------------------------------------------------------------------------
// Links: platform detection from the hostname only. Nothing is ever fetched.
// ---------------------------------------------------------------------------
export type LinkPlatformId = "tiktok" | "instagram" | "youtube" | "x" | "facebook" | "reddit" | "other";

export interface LinkPlatform {
  id: LinkPlatformId;
  label: string;
  /** Plain text glyph (no brand logos). */
  glyph: string;
}

const PLATFORMS: Array<LinkPlatform & { domains: string[] }> = [
  { id: "tiktok", label: "TikTok", glyph: "♪", domains: ["tiktok.com"] },
  { id: "instagram", label: "Instagram", glyph: "◎", domains: ["instagram.com", "instagr.am"] },
  { id: "youtube", label: "YouTube", glyph: "▶", domains: ["youtube.com", "youtu.be", "youtube-nocookie.com"] },
  { id: "x", label: "X", glyph: "✕", domains: ["x.com", "twitter.com", "t.co"] },
  { id: "facebook", label: "Facebook", glyph: "f", domains: ["facebook.com", "fb.com", "fb.watch", "fb.me"] },
  { id: "reddit", label: "Reddit", glyph: "◉", domains: ["reddit.com", "redd.it"] },
];

export const OTHER_PLATFORM: LinkPlatform = { id: "other", label: "Link", glyph: "↗" };

/** Matches the exact domain or a subdomain of it (m.youtube.com yes, notyoutube.com no). */
export function platformForHost(hostname: string): LinkPlatform {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  const match = PLATFORMS.find((p) => p.domains.some((d) => host === d || host.endsWith(`.${d}`)));
  return match ? { id: match.id, label: match.label, glyph: match.glyph } : OTHER_PLATFORM;
}

export interface LinkInfo {
  url: string; // normalized https URL
  domain: string; // hostname without "www."
  path: string; // pathname + search, for a short preview line ("" for the root)
  platform: LinkPlatform;
}

/** Normalizes a pasted link (https only) and detects its platform, or null when invalid. */
export function linkInfo(raw: string | null | undefined): LinkInfo | null {
  const url = normalizeLink(raw ?? "");
  if (!url) return null;
  const parsed = new URL(url);
  const domain = parsed.hostname.toLowerCase().replace(/^www\./, "");
  const rest = `${parsed.pathname}${parsed.search}`;
  return { url, domain, path: rest === "/" ? "" : rest, platform: platformForHost(parsed.hostname) };
}

// ---------------------------------------------------------------------------
// Clips
// ---------------------------------------------------------------------------
/** 42 -> "0:42", 75.4 -> "1:15". */
export function formatClipLength(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Friendly problem when a clip is longer than MAX_VIDEO_SECONDS, else null.
 * Unknown length (null, NaN, Infinity) is allowed: some browsers cannot read
 * every format, and the 50 MB limit still applies. Half a second of grace
 * covers clips the camera labels "1:00".
 */
export function videoLengthProblem(seconds: number | null | undefined, max = MAX_VIDEO_SECONDS): string | null {
  if (seconds == null || !Number.isFinite(seconds)) return null;
  if (seconds <= max + 0.5) return null;
  return `That clip is ${formatClipLength(seconds)}. Clips can be up to ${max} seconds, so trim it to a minute or less and try again.`;
}

/** 820 KB, 4.2 MB. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------
/** Short, friendly relative time: "Just now", "5 min ago", "3 hours ago", "Yesterday", "4 days ago", "Sep 12". */
export function relativeTime(iso: string, now: Date, locale = "en-US"): string {
  const then = new Date(iso);
  const ms = now.getTime() - then.getTime();
  if (!Number.isFinite(ms)) return "";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "Just now"; // also covers small clock differences
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  const days = daysBetween(then, now);
  // Same calendar day, or late last night: hours read better than "Yesterday".
  if (days === 0 || hours < 6) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return then.toLocaleDateString(locale, then.getFullYear() === now.getFullYear() ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
}

// ---------------------------------------------------------------------------
// "New" marker: a per-person, per-device convenience (never a source of truth).
// ---------------------------------------------------------------------------
const seenKey = (userId: string) => `spark-moments-seen:${userId}`;

export function readLastVisit(userId: string): string | null {
  try {
    const value = localStorage.getItem(seenKey(userId));
    return value && Number.isFinite(Date.parse(value)) ? value : null;
  } catch {
    return null;
  }
}

export function writeLastVisit(userId: string, iso: string): void {
  try {
    localStorage.setItem(seenKey(userId), iso);
  } catch {
    // Private mode or blocked storage: markers just won't carry over.
  }
}

/**
 * A partner's moment is new when it arrived after this device's last visit.
 * With no recorded visit, partner moments the viewer hasn't reacted to yet
 * count as new (the same rule as the Home tile).
 */
export function isNewMoment(moment: Pick<Moment, "authorId" | "createdAt" | "reactions">, meId: string, lastVisit: string | null): boolean {
  if (!moment.authorId || moment.authorId === meId) return false;
  if (lastVisit) return Date.parse(moment.createdAt) > Date.parse(lastVisit);
  return !moment.reactions[meId];
}

/** The newest createdAt in the list (server clock), used as the next "last visit". */
export function newestTimestamp(list: Array<Pick<Moment, "createdAt">>): string | null {
  let best: string | null = null;
  let bestAt = -Infinity;
  for (const m of list) {
    const at = Date.parse(m.createdAt);
    if (Number.isFinite(at) && at > bestAt) {
      bestAt = at;
      best = m.createdAt;
    }
  }
  return best;
}
