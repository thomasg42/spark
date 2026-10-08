// @vitest-environment jsdom
/**
 * Thomas's 2026-10-06 changes:
 *  - Home has no repeats of the bottom tabs; it shows the person's favorites as
 *    rows with an arrow on the right that open the full screen.
 *  - Check-ins pop up on their own until done ("Not now" hides them for this visit).
 *  - The monthly form asks "sooner or later?"; the rhythm moves only when both agree.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { AppProvider } from "@/components/app-provider";
import { isDrillDown } from "@/components/app-shell";
import { CheckinPrompt, lastQuickCheckin } from "@/components/checkin/checkin-prompt";
import { ToastProvider } from "@/components/ui";
import HomePage from "@/app/home/page";
import { createDemoBackend } from "@/lib/backend/demo";
import { DEMO_ALEX, DEMO_SAM, demoStore } from "@/lib/backend/demo/store";
import { periodOf } from "@/lib/domain/dates";
import { agreedRhythm, paceOutcome } from "@/lib/domain/rhythm";
import { resolveBack } from "@/lib/ui/last-tab";
import { weekStartOf } from "@/lib/domain/dates";
import { DEFAULT_FAVORITES, FAVORITE_CATALOG, parseFavorites, toggleFavorite } from "@/lib/ui/favorites";
import { loadPaceRounds } from "@/lib/ui/rhythm";

let pathname = "/home/";
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(),
}));

const renderApp = (view: ReactNode) => render(<AppProvider><ToastProvider>{view}</ToastProvider></AppProvider>);
const TAB_ROOTS = ["/home/", "/moments/", "/checkin/", "/plans/", "/activities/", "/projects/", "/our-story/", "/intimacy/", "/us/"];

beforeEach(() => {
  pathname = "/home/";
  localStorage.clear();
  sessionStorage.clear();
  demoStore.reset(false);
  demoStore.update((s) => {
    s.signedIn = true;
    s.actingAs = DEMO_ALEX;
  });
});
afterEach(() => cleanup());

describe("favorites and drill-down helpers", () => {
  it("defaults include Date ideas and never offer a bottom-tab destination", () => {
    expect(DEFAULT_FAVORITES).toContain("ideas");
    for (const f of FAVORITE_CATALOG) {
      expect(TAB_ROOTS).not.toContain(f.href);
      expect(isDrillDown(f.href)).toBe(true);
    }
  });
  it("parses stored lists safely and keeps catalog order when toggling", () => {
    expect(parseFavorites(null)).toEqual(DEFAULT_FAVORITES);
    expect(parseFavorites("not json")).toEqual(DEFAULT_FAVORITES);
    expect(parseFavorites('["notes","bogus","notes"]')).toEqual(["notes"]);
    expect(toggleFavorite(["notes"], "ideas")).toEqual(["ideas", "notes"]);
    expect(toggleFavorite(["ideas", "notes"], "ideas")).toEqual(["notes"]);
  });
  it("treats tab roots as full pages and their children as drill-downs", () => {
    for (const root of TAB_ROOTS) expect(isDrillDown(root)).toBe(false);
    expect(isDrillDown("/checkin/pulse/")).toBe(true);
    expect(isDrillDown("/us/questions/beginnings")).toBe(true);
    expect(isDrillDown("/support/")).toBe(false);
  });
  it("finds the last quick check-in from the person's own entries only", () => {
    const entries = [
      { userId: "a", weekStart: "2026-09-28", updatedAt: "2026-09-30T10:00:00Z" },
      { userId: "a", weekStart: "2026-10-05" },
      { userId: "b", weekStart: "2026-10-12", updatedAt: "2026-10-13T10:00:00Z" },
    ];
    expect(lastQuickCheckin(entries, "a")).toBe("2026-10-05");
    expect(lastQuickCheckin(entries, "c")).toBeNull();
  });
});

describe("home screen", () => {
  it("shows favorites as arrow rows and no repeats of the bottom tabs", async () => {
    renderApp(<HomePage />);
    const ideas = await screen.findByRole("link", { name: /Date ideas/ });
    expect(ideas.getAttribute("href")).toBe("/activities/ideas/");
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    for (const root of TAB_ROOTS) expect(hrefs).not.toContain(root);
    expect(hrefs).toEqual(expect.arrayContaining(["/activities/ideas/", "/checkin/notes/", "/us/questions/"]));
  });

  it("lets each person edit their own favorites and remembers them", async () => {
    renderApp(<HomePage />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit favorites" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Monthly check-in/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Appreciation notes/ }));
    await waitFor(() => expect(screen.getByRole("link", { name: /Monthly check-in/ }).getAttribute("href")).toBe("/checkin/monthly/"));
    expect(screen.queryByRole("link", { name: /Appreciation notes/ })).toBeNull();
    expect(JSON.parse(localStorage.getItem(`spark-favorites:${DEMO_ALEX}`)!)).toEqual(["buddy", "ideas", "monthly", "questions"]);
  });
});

describe("automatic check-in pop-up", () => {
  it("pops up the monthly check-in until it's done, and Not now hides it for this visit", async () => {
    renderApp(<CheckinPrompt aboveTabs />);
    expect(await screen.findByRole("region", { name: "Time for your monthly check-in" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Start now" }).getAttribute("href")).toBe("/checkin/monthly/");
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    await waitFor(() => expect(screen.queryByRole("region")).toBeNull());
    const dismissed = sessionStorage.getItem("spark-checkin-prompt-dismissed")!;
    expect(dismissed).toContain(`monthly:${DEMO_ALEX}:${periodOf(new Date())}`);
  });

  it("stays out of the way on the check-in screens themselves", async () => {
    pathname = "/checkin/monthly/";
    renderApp(<CheckinPrompt aboveTabs={false} />);
    await new Promise((r) => setTimeout(r, 400));
    expect(screen.queryByRole("region")).toBeNull();
  });

  it("switches to the quick check-in once this month's check-in is done", async () => {
    const b = createDemoBackend();
    await b.checkins.submit(periodOf(new Date()), { best: "Hike", closest: "", distant: "", more_of: "", talk_about: "" });
    demoStore.update((s) => {
      s.pulses = s.pulses.filter((p) => p.userId !== DEMO_ALEX); // no quick check-in yet
    });
    renderApp(<CheckinPrompt aboveTabs />);
    expect(await screen.findByRole("region", { name: "Quick check-in" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Start now" }).getAttribute("href")).toBe("/checkin/pulse/");
  });
});

describe("pace votes on the monthly check-in", () => {
  it("move the rhythm only after both submit and agree, without leaking an early vote", async () => {
    const b = createDemoBackend();
    const period = periodOf(new Date());
    const answers = { best: "Hike", closest: "", distant: "", more_of: "", talk_about: "" };
    b.demo!.actAs(DEMO_ALEX);
    await b.checkins.submit(period, { ...answers, pace: "sooner" });

    b.demo!.actAs(DEMO_SAM);
    const before = await b.checkins.get(period);
    expect(before.partner).toBeNull();
    expect(JSON.stringify(before)).not.toContain("sooner");
    expect((await loadPaceRounds(b, DEMO_SAM)).find((r) => r.period === period)).toBeUndefined();

    await b.checkins.submit(period, { ...answers, pace: "sooner" });
    const rounds = await loadPaceRounds(b, DEMO_SAM);
    expect(rounds.find((r) => r.period === period)).toEqual({ period, mine: "sooner", partner: "sooner" });
    // Sample couple: Alex picked weekly, Sam monthly -> base every two weeks -> both sooner -> weekly.
    const rhythm = agreedRhythm("monthly", "weekly", rounds);
    expect(rhythm).toMatchObject({ base: "biweekly", current: "weekly", steps: -1 });
  });
});

describe("review fixes", () => {
  it("prompts the quick check-in as soon as the partner answered this week, so you land in the same week", async () => {
    const b = createDemoBackend();
    await b.checkins.submit(periodOf(new Date()), { best: "Hike", closest: "", distant: "", more_of: "", talk_about: "" });
    b.demo!.actAs(DEMO_SAM);
    await b.pulse.submit(weekStartOf(new Date()), 4, 4);
    b.demo!.actAs(DEMO_ALEX);
    demoStore.update((s) => {
      s.pulses = s.pulses.map((p) => (p.userId === DEMO_ALEX ? { ...p, updatedAt: new Date().toISOString() } : p));
    });
    renderApp(<CheckinPrompt aboveTabs />);
    expect(await screen.findByText(/Sam checked in this week/)).toBeTruthy();
  });

  it("never pops up over the Support page", async () => {
    pathname = "/support/";
    renderApp(<CheckinPrompt aboveTabs />);
    await new Promise((r) => setTimeout(r, 400));
    expect(screen.queryByRole("region")).toBeNull();
  });

  it("sends a favorite's back link to Home when it was opened from Home", () => {
    expect(resolveBack({ href: "/plans/", label: "Plans" }, "/home/")).toEqual({ href: "/home/", label: "Home" });
    expect(resolveBack({ href: "/plans/", label: "Plans" }, "/plans/")).toEqual({ href: "/plans/", label: "Plans" });
    expect(resolveBack({ href: "/plans/", label: "Plans" }, null)).toEqual({ href: "/plans/", label: "Plans" });
  });

  it("is honest when a vote can't move the rhythm further", () => {
    expect(paceOutcome("later", "later", "Sam", { from: "monthly", to: "monthly" })).toMatch(/already at the most relaxed pace/);
    expect(paceOutcome("sooner", "sooner", "Sam", { from: "daily", to: "daily" })).toMatch(/stay daily/);
    expect(paceOutcome("sooner", "sooner", "Sam", { from: "weekly", to: "twice_weekly" })).toMatch(/step more often/);
  });

  it("doesn't repeat the couple's names on Home (the header already shows them)", async () => {
    renderApp(<HomePage />);
    await screen.findByRole("link", { name: /Date ideas/ });
    expect(screen.queryByText(/^You and /)).toBeNull();
  });
});
