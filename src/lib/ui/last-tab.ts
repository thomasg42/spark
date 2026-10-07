/** Which tab root (Home, Moments, ...) the person was on before opening a drill-down. */
export const LAST_TAB_KEY = "spark-last-tab";

/** Back link for a drill-down: Home when it was opened from Home (a favorite), else its default. */
export function resolveBack(back: { href: string; label: string }, lastTab: string | null): { href: string; label: string } {
  const normalized = lastTab && (lastTab.endsWith("/") ? lastTab : `${lastTab}/`);
  if (normalized === "/home/" && back.href !== "/home/") return { href: "/home/", label: "Home" };
  return back;
}
