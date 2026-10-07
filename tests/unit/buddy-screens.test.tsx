// @vitest-environment jsdom
/**
 * Spark Buddy, Projects, Money and Stars screens in the demo: the interview fills
 * in an answer from what you say and then asks "Do you trust this to your Spark
 * Buddy?"; suggestions arrive as cards you confirm; projects show in priority
 * order; private savings goals of the partner never render.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { AppProvider } from "@/components/app-provider";
import { ToastProvider } from "@/components/ui";
import BuddyPage from "@/app/us/buddy/page";
import BuddySharingPage from "@/app/us/buddy/sharing/page";
import StarsPage from "@/app/us/stars/page";
import ProjectsPage from "@/app/plans/projects/page";
import MoneyPage from "@/app/plans/money/page";
import { DEMO_ALEX, DEMO_SAM, demoStore } from "@/lib/backend/demo/store";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/us/buddy/",
  useSearchParams: () => new URLSearchParams(),
}));

const renderApp = (view: ReactNode) => render(<AppProvider><ToastProvider>{view}</ToastProvider></AppProvider>);

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  demoStore.reset(false);
  demoStore.update((s) => {
    s.signedIn = true;
    s.actingAs = DEMO_ALEX;
  });
});
afterEach(() => cleanup());

describe("Spark Buddy screen", () => {
  it("interviews you, fills in the answer from what you say, then asks what Buddy may share", async () => {
    renderApp(<BuddyPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Fill out my onboarding" }));
    expect(await screen.findByText("Who raised you, mostly?")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Your answer"), { target: { value: "My single mom raised me" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Do you trust this to your Spark Buddy?", {}, { timeout: 4000 })).toBeTruthy();
    expect(demoStore.get().answers[DEMO_ALEX]!.find((a) => a.questionId === "raised_by")?.value).toBe("single_parent");
    fireEvent.click(screen.getByRole("button", { name: /Off the table \(default\)/ }));
    expect(await screen.findByText("How many brothers and sisters did you grow up with?")).toBeTruthy();
    expect(demoStore.get().buddyShares[DEMO_ALEX] ?? []).toEqual([]);
  });

  it("turns a suggestion into a card you confirm", async () => {
    renderApp(<BuddyPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Plan a date night for us" }));
    const add = await screen.findByRole("button", { name: "Add it" }, { timeout: 4000 });
    fireEvent.click(add);
    await waitFor(() => expect(demoStore.get().datePlans).toHaveLength(1));
    expect(demoStore.get().datePlans[0]!.createdBy).toBe(DEMO_ALEX);
  });

  it("asks no AI question in the demo (the demo never uses AI)", async () => {
    renderApp(<BuddyPage />);
    await screen.findByRole("button", { name: "Fill out my onboarding" });
    expect(screen.queryByText("Turn on AI replies for your Buddy?")).toBeNull();
  });
});

describe("sharing screen", () => {
  it("lists your answers with their share level, off the table by default", async () => {
    demoStore.update((s) => {
      s.actingAs = DEMO_SAM;
    });
    renderApp(<BuddySharingPage />);
    const card = (await screen.findByText("Something from growing up you'd rather leave behind.")).closest("article")!;
    expect(within(card).getByRole("button", { name: "Off the table" }).getAttribute("aria-pressed")).toBe("true");
    const hint = (await screen.findByText("What tends to shake your trust, even a little?")).closest("article")!;
    expect(within(hint).getByText(/Their Buddy may see/)).toBeTruthy();
  });
});

describe("projects, money and stars", () => {
  it("shows projects numbered in priority order", async () => {
    renderApp(<ProjectsPage />);
    const list = await screen.findByRole("list", { name: "Projects in priority order" });
    const titles = (await within(list).findAllByRole("heading")).map((h) => h.textContent);
    expect(titles[0]).toMatch(/Priority 1: Paint the baby's room/);
    expect(titles[1]).toMatch(/Priority 2: Finish the garage/);
  });

  it("shows joint and personal savings, and never the partner's private goal", async () => {
    renderApp(<MoneyPage />);
    expect(await screen.findByText("Vacation fund")).toBeTruthy();
    expect(screen.getByText("My savings")).toBeTruthy();
    expect(screen.getByText("New camera")).toBeTruthy();
    expect(screen.queryByText(/Private sample goal/)).toBeNull();
  });

  it("reads both charts and the couple's watch-outs", async () => {
    renderApp(<StarsPage />);
    expect(await screen.findByText(/Taurus/)).toBeTruthy();
    expect(screen.getByText(/Scorpio/)).toBeTruthy();
    expect(screen.getByText("Things to watch for")).toBeTruthy();
  });
});
