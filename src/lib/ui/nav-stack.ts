/**
 * The app's own back stack, so the ‹ back arrow, the tab bar and the phone's
 * swipe-back all agree (Thomas, 2026-10-08).
 *
 * The arrow used to OPEN its target as a new page, so history grew
 * Us → Buddy → Sharing → Buddy, and swiping back from Buddy landed on Sharing
 * again. Now the arrow (and a tab) goes BACK when the screen it names is the
 * one you came from, and only opens it fresh when you arrived some other way
 * (a shared link, a reload).
 *
 * Pure functions plus a sessionStorage wrapper that never throws.
 */

export const NAV_STACK_KEY = "spark-nav-stack";
const MAX_DEPTH = 30;

/** "/us/buddy" and "/us/buddy/?x=1" are the same screen as "/us/buddy/". */
export function normalizePath(path: string): string {
  const p = path.split(/[?#]/)[0] || "/";
  return p.endsWith("/") ? p : `${p}/`;
}

/** The stack after landing on `path`. Landing on the screen just below the top is a back, so it pops. */
export function nextStack(stack: readonly string[], path: string): string[] {
  const p = normalizePath(path);
  if (stack.at(-1) === p) return [...stack];
  if (stack.at(-2) === p) return stack.slice(0, -1);
  return [...stack, p].slice(-MAX_DEPTH);
}

/** True when going to `target` is exactly a step back, so history.back() keeps the stack clean. */
export function isBackTo(stack: readonly string[], target: string): boolean {
  return stack.length >= 2 && stack.at(-2) === normalizePath(target);
}

/** The screen one level up: /us/buddy/sharing/ → /us/buddy/. */
export function parentPath(path: string): string {
  const parts = normalizePath(path).split("/").filter(Boolean);
  parts.pop();
  return parts.length ? `/${parts.join("/")}/` : "/";
}

/**
 * Where a swipe-back from the left edge goes: "history" when the app has a
 * previous screen, the parent screen for an inner screen opened directly, or
 * null (a tab root with nowhere to go back to inside the app).
 */
export function swipeBackTarget(stack: readonly string[], path: string, inner: boolean): "history" | string | null {
  if (stack.length >= 2) return "history";
  return inner ? parentPath(path) : null;
}

/** Pixels from the left edge where a back swipe may start. */
export const EDGE_PX = 28;

/** A deliberate rightward swipe that started at the left edge, not a scroll or a tap. */
export function isBackSwipe(start: { x: number; y: number }, end: { x: number; y: number }): boolean {
  const dx = end.x - start.x;
  const dy = Math.abs(end.y - start.y);
  return start.x <= EDGE_PX && dx >= 70 && dy <= Math.max(60, dx * 0.6);
}

export function readStack(): string[] {
  try {
    const raw = sessionStorage.getItem(NAV_STACK_KEY);
    const value: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(value) ? value.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Pure: the stack to start this page load with. A fresh load (a link from
 * another site, a typed address) has no in-app screens behind it, so an old
 * stack from earlier in this tab would make ‹ back leave Spark. A reload or a
 * browser back/forward keeps it.
 */
export function stackForLoad(stored: readonly string[], loadType: string | undefined): string[] {
  return loadType === "navigate" ? [] : [...stored];
}

let loaded = false;

export function recordVisit(path: string): void {
  try {
    let stack = readStack();
    if (!loaded) {
      loaded = true;
      const entry = typeof performance !== "undefined" ? (performance.getEntriesByType?.("navigation")[0] as PerformanceNavigationTiming | undefined) : undefined;
      stack = stackForLoad(stack, entry?.type);
    }
    sessionStorage.setItem(NAV_STACK_KEY, JSON.stringify(nextStack(stack, path)));
  } catch {
    // storage blocked: back links fall back to opening their target
  }
}
