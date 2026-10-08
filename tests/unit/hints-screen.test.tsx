// @vitest-environment jsdom
/**
 * Module H screens in the demo: "Hints from Sam" (pattern card, hints, a locked
 * teaser to answer), the "feeling a bit distant" flag as both partners see it,
 * and choosing when a hint shows on the sharing screen.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { AppProvider } from "@/components/app-provider";
import { ToastProvider } from "@/components/ui";
import { HintsScreen } from "@/components/hints/hints-screen";
import { SharingScreen } from "@/components/buddy/sharing-screen";
import { DEMO_ALEX, DEMO_SAM, demoStore } from "@/lib/backend/demo/store";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/us/hints/",
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

describe("Hints from Sam", () => {
  it("shows Sam's pattern card and hints, and locks the rest until Alex answers", async () => {
    renderApp(<HintsScreen />);
    const card = (await screen.findByRole("heading", { name: "Sam's pattern card" })).closest("section")!;
    expect(within(card).getByText("Pull away to think.")).toBeTruthy();
    expect(within(card).getByText("It's not about you")).toBeTruthy();
    expect(screen.getByText("Unhurried evenings with phones put away go a long way with them.")).toBeTruthy();
    const locked = (screen.getByRole("heading", { name: "Waiting for you" })).closest("section")!;
    expect(within(locked).getByText("What tends to shake your trust, even a little?")).toBeTruthy();
    expect(within(locked).getByRole("link", { name: "Answer it" }).getAttribute("href")).toBe("/us/questions/closeness_trust/");
    expect(screen.queryByText(/afterthought/)).toBeNull(); // the locked hint's words never render
  });

  it("'I'm feeling a bit distant' reaches Sam with what helps, and fades back when cleared", async () => {
    demoStore.update((s) => {
      // Alex set a hint for exactly this moment, and Sam has answered the same question.
      s.buddyShares[DEMO_ALEX] = [{ questionId: "feel_close_when", level: "hint", text: "A slow Sunday with no plans goes a long way with them.", updatedAt: new Date().toISOString(), showWhen: "feeling_distant" }];
    });
    renderApp(<HintsScreen />);
    fireEvent.click(await screen.findByRole("button", { name: "I'm feeling a bit distant" }));
    expect(await screen.findByRole("button", { name: "I'm feeling better" })).toBeTruthy();
    cleanup();
    actAs(DEMO_SAM);
    renderApp(<HintsScreen />);
    expect(await screen.findByText("Al is feeling a bit distant right now.")).toBeTruthy(); // Alex's nickname
    expect(screen.getByText("A slow Sunday with no plans goes a long way with them.")).toBeTruthy();
    cleanup();
    actAs(DEMO_ALEX);
    renderApp(<HintsScreen />);
    fireEvent.click(await screen.findByRole("button", { name: "I'm feeling better" }));
    await screen.findByRole("button", { name: "I'm feeling a bit distant" });
    expect(demoStore.get().distanceFlags).toEqual([]);
  });
});

describe("choosing when a hint shows", () => {
  it("saves a hint that waits for 'when we're apart'", async () => {
    renderApp(<SharingScreen />);
    const row = (await screen.findByText("You feel closest to them when…")).closest("article")!;
    fireEvent.click(within(row).getByRole("button", { name: "Hint" }));
    const picker = await within(row).findByLabelText("When should it show?");
    fireEvent.change(picker, { target: { value: "away" } });
    fireEvent.click(within(row).getByRole("button", { name: "Approve hint" }));
    await waitFor(() => expect(demoStore.get().buddyShares[DEMO_ALEX]?.find((x) => x.questionId === "feel_close_when")?.showWhen).toBe("away"));
    expect(await within(row).findByText(/Only when we're apart/)).toBeTruthy();
  });
});
