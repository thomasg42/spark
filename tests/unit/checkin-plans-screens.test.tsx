// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { AppProvider } from "@/components/app-provider";
import { ToastProvider } from "@/components/ui";
import { CheckinHub } from "@/components/checkin/checkin-hub";
import { ActivitiesScreen } from "@/components/plans/plans-screen";
import { DEMO_ALEX, demoStore } from "@/lib/backend/demo/store";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

function renderApp(view: ReactNode) {
  return render(<AppProvider><ToastProvider>{view}</ToastProvider></AppProvider>);
}

beforeEach(() => {
  demoStore.reset(false);
  demoStore.update((state) => { state.signedIn = true; state.actingAs = DEMO_ALEX; });
});

afterEach(() => cleanup());

describe("Check-in and Plans screens", () => {
  it("shows the three check-in cards and the negotiated rhythm", async () => {
    renderApp(<CheckinHub />);
    expect(await screen.findByRole("heading", { name: "Check-in" })).toBeTruthy();
    // Arrow rows: everything on the left, the arrow on the right, the whole row opens the screen.
    expect((await screen.findByRole("link", { name: /Quick check-in/ })).getAttribute("href")).toBe("/checkin/pulse/");
    expect(screen.getByRole("link", { name: /Monthly check-in/ }).getAttribute("href")).toBe("/checkin/monthly/");
    expect(screen.getByRole("link", { name: /Appreciation notes/ }).getAttribute("href")).toBe("/checkin/notes/");
    expect(screen.getByText("Your shared rhythm")).toBeTruthy();
    // The tab bar already reaches Home, so the hub doesn't repeat a Home link.
    expect(screen.queryByRole("link", { name: /^‹?\s*Home$/ })).toBeNull();
  });

  it("groups activities, filters by category, and keeps rating controls per activity", async () => {
    renderApp(<ActivitiesScreen />);
    expect(await screen.findByRole("heading", { name: "Farmers market + picnic" })).toBeTruthy();
    expect(screen.getAllByRole("heading", { name: /October|September|2026/ }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("radio", { name: "Chill" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Movie marathon" })).toBeTruthy());
    expect(screen.queryByRole("heading", { name: "Thai cooking night" })).toBeNull();
    const movie = screen.getByRole("heading", { name: "Movie marathon" }).closest("article")!;
    const rating = within(movie).getByRole("radiogroup", { name: /Your rating/ });
    expect(within(rating).getByRole("radio", { name: "3 stars" })).toBeTruthy();
    fireEvent.click(within(rating).getByRole("radio", { name: "5 stars" }));
    await waitFor(() => expect(demoStore.get().activities.find((a) => a.title === "Movie marathon")?.ratings[DEMO_ALEX]).toBe(5));
  });
});
