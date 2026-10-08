// @vitest-environment jsdom
/**
 * Module E screens in the demo: setting a standing date night (and what the
 * partner can and can't do with it), the Home nudge cards with "Not now", and
 * a logged life change speeding up the shared rhythm on Agreements.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { AppProvider } from "@/components/app-provider";
import { ToastProvider } from "@/components/ui";
import HomePage from "@/app/home/page";
import { AgreementsScreen } from "@/components/agreements/agreements-screen";
import { PlansScreen } from "@/components/plans/plans-screen";
import { StandingScreen } from "@/components/plans/standing-screen";
import { DEMO_ALEX, DEMO_SAM, demoStore } from "@/lib/backend/demo/store";
import { addDays, previousWeekStart, toISODate, weekStartOf } from "@/lib/domain/dates";
import type { Activity } from "@/lib/backend/types";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/plans/standing/",
  useSearchParams: () => new URLSearchParams(),
}));

const renderApp = (view: ReactNode) => render(<AppProvider><ToastProvider>{view}</ToastProvider></AppProvider>);
const actAs = (id: string) =>
  demoStore.update((s) => {
    s.signedIn = true;
    s.actingAs = id;
  });

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  demoStore.reset(false);
  actAs(DEMO_ALEX);
});
afterEach(() => cleanup());

describe("standing date night", () => {
  it("sets 'every Wednesday 6 to 9 PM', offers the calendar file, and shows on Plans", async () => {
    renderApp(<StandingScreen />);
    expect(await screen.findByText("No standing date yet")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Every"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText(/The deal/), { target: { value: "Date night, then we each go home." } });
    fireEvent.click(screen.getByRole("button", { name: "Save standing date" }));
    expect(await screen.findByText("Every Wednesday, 6 to 9 PM")).toBeTruthy();
    expect(screen.getByText("Date night, then we each go home.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add to my calendar" })).toBeTruthy();
    expect(demoStore.get().dateRules).toHaveLength(1);
    cleanup();
    renderApp(<PlansScreen />);
    const row = await screen.findByRole("link", { name: /Standing date night/ });
    expect(row.getAttribute("href")).toBe("/plans/standing/");
    await waitFor(() => expect(row.textContent).toMatch(/Every Wednesday, 6 to 9 PM/));
  });

  it("the partner sees it but can't pause or remove it", async () => {
    demoStore.update((s) => {
      s.dateRules.push({ id: "r1", title: "Date night", weekday: 3, startTime: "18:00", endTime: "21:00", note: null, active: true, createdBy: DEMO_ALEX, createdAt: new Date().toISOString() });
    });
    actAs(DEMO_SAM);
    renderApp(<StandingScreen />);
    const card = (await screen.findByRole("heading", { name: "Date night" })).closest("article")!;
    expect(within(card).queryByRole("button", { name: "Pause" })).toBeNull();
    expect(within(card).queryByRole("button", { name: "Remove" })).toBeNull();
    expect(within(card).getByText(/Set by/)).toBeTruthy();
  });

  it("refuses a night that ends before it starts, with a plain message", async () => {
    renderApp(<StandingScreen />);
    await screen.findByText("No standing date yet");
    fireEvent.change(screen.getByLabelText("Until"), { target: { value: "17:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Save standing date" }));
    expect(await screen.findByText("The end time needs to be after the start time.")).toBeTruthy();
    expect(demoStore.get().dateRules).toEqual([]);
  });
});

describe("Home nudges", () => {
  it("turns three weeks of the same kind of date into a card, and 'Not now' puts it off", async () => {
    const thisWeek = weekStartOf(new Date());
    const day = (weeksBack: number) => toISODate(addDays(new Date(`${previousWeekStart(thisWeek, weeksBack)}T12:00:00`), 1));
    const same = (id: string, happenedOn: string): Activity => ({ id, title: "Movie night", happenedOn, category: "chill", note: null, photoPath: null, createdBy: DEMO_ALEX, sourceIdeaId: null, ratings: {}, createdAt: "" });
    demoStore.update((s) => {
      s.activities = [same("a0", day(0)), same("a1", day(1)), same("a2", day(2))].filter((a) => a.happenedOn <= toISODate(new Date()));
      if (s.activities.length < 3) s.activities.push(same("a0b", toISODate(new Date(`${thisWeek}T12:00:00`))));
      s.pulses = [];
    });
    renderApp(<HomePage />);
    const nudge = (await screen.findByText(/same kind of plan for 3 weeks/)).closest("section")!;
    expect(within(nudge).getByRole("link", { name: "Find a new kind of date" }).getAttribute("href")).toBe("/plans/ideas/");
    fireEvent.click(within(nudge).getByRole("button", { name: "Not now" }));
    await waitFor(() => expect(screen.queryByText(/same kind of plan for 3 weeks/)).toBeNull());
    expect(JSON.parse(localStorage.getItem(`spark-rhythm-snooze:${DEMO_ALEX}`)!)).toHaveProperty("category_rut");
  });
});

describe("big life changes", () => {
  it("logging a new job makes quick check-ins a step more frequent, and says until when", async () => {
    renderApp(<AgreementsScreen />);
    fireEvent.click(await screen.findByRole("button", { name: "Log a life change" }));
    fireEvent.click(screen.getByRole("radio", { name: /New job/ }));
    fireEvent.click(screen.getByRole("button", { name: "Log it" }));
    expect(await screen.findByText(/New job ·/)).toBeTruthy();
    expect(await screen.findByText(/quick check-ins come a little more often until/)).toBeTruthy();
    expect(demoStore.get().lifeChanges.map((c) => c.kind)).toEqual(["new_job"]);
  });
});
