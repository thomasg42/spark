// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { AppProvider } from "@/components/app-provider";
import { MonthlyScreen } from "@/components/checkin/monthly-screen";
import { ToastProvider } from "@/components/ui";
import { checkins } from "@/lib/backend/demo/checkins";
import { DEMO_ALEX, DEMO_SAM, demoStore } from "@/lib/backend/demo/store";
import { periodOf, previousPeriod } from "@/lib/domain/dates";

let requestedPeriod = "";
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(requestedPeriod ? { period: requestedPeriod } : {}),
}));

const actAs = (id: string) => demoStore.update((s) => { s.signedIn = true; s.actingAs = id; });
const show = () => render(<AppProvider><ToastProvider><MonthlyScreen /></ToastProvider></AppProvider>);

beforeEach(() => {
  requestedPeriod = "";
  localStorage.clear();
  demoStore.reset(false);
  actAs(DEMO_ALEX);
});
afterEach(cleanup);

it("saves only the optional reflections and reveals them after both partners submit", async () => {
  const view = show();
  const security = await screen.findByRole("textbox", { name: /How secure and supported/ });
  const growth = screen.getByRole("textbox", { name: /Do any personal or shared goals/ });
  expect(screen.getByText(/Feeling comfortable together is a good thing/)).toBeTruthy();
  fireEvent.change(security, { target: { value: "I feel secure in our quiet evenings." } });
  fireEvent.change(growth, { target: { value: "Our goals feel on track." } });
  fireEvent.click(screen.getByRole("button", { name: "Submit privately" }));
  await screen.findByText("Hidden until Sam answers.");
  expect(screen.queryByRole("heading", { name: "Read together" })).toBeNull();
  view.unmount();

  actAs(DEMO_SAM);
  await checkins.submit(periodOf(new Date()), { best: "", closest: "", distant: "", more_of: "", talk_about: "", security: "I feel supported and comfortable.", growth: "No goals need attention right now." });
  actAs(DEMO_ALEX);
  show();
  const revealed = await screen.findByRole("region", { name: "Read together" });
  expect(within(revealed).getByText("I feel secure in our quiet evenings.")).toBeTruthy();
  expect(within(revealed).getByText("I feel supported and comfortable.")).toBeTruthy();
  expect(within(revealed).getByText("Our goals feel on track.")).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "What is worth noticing" })).toBeNull();
});

it("opens a legacy month with empty optional fields and its saved summary intact", async () => {
  requestedPeriod = previousPeriod(periodOf(new Date()));
  const before = await checkins.get(requestedPeriod);
  show();
  await screen.findByRole("region", { name: "Read together" });
  await waitFor(() => expect((screen.getByRole("textbox", { name: /How secure and supported/ }) as HTMLTextAreaElement).value).toBe(""));
  expect((screen.getByRole("textbox", { name: /Do any personal or shared goals/ }) as HTMLTextAreaElement).value).toBe("");
  expect((await checkins.get(requestedPeriod)).summary).toEqual(before.summary);
});
