// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { AppProvider, useApp } from "@/components/app-provider";
import { AttentionBanner } from "@/components/checkin/attention-banner";
import { AttentionForm } from "@/components/checkin/attention-form";
import { useAttentionSignals } from "@/components/checkin/attention-signals";
import * as backendModule from "@/lib/backend";
import type { AttentionSignal, Backend, SessionUser } from "@/lib/backend";
import { DEMO_ALEX, DEMO_SAM, demoStore } from "@/lib/backend/demo/store";
import { periodOf } from "@/lib/domain/dates";

const backend = backendModule.getBackend();
const selfQuestion = "Have I become too comfortable and stopped making an effort?";
const partnerQuestion = "Do I feel my partner has become too comfortable and stopped making an effort?";
const show = () => render(<AppProvider><AttentionBanner /><AttentionForm /></AppProvider>);
const switchTo = (id: string) => act(() => { demoStore.update((state) => { state.actingAs = id; }); });

/** Live-mode auth can change before the provider's async refresh publishes the new viewer. */
function liveAuthFacade() {
  const listeners = new Set<(user: SessionUser | null) => void>();
  let user: SessionUser = { id: DEMO_ALEX, email: null };
  let blocked = false;
  const live: Backend = {
    ...backend,
    demo: undefined,
    auth: {
      ...backend.auth,
      getUser: () => blocked ? new Promise<SessionUser | null>(() => {}) : Promise.resolve(user),
      onChange: (callback) => { listeners.add(callback); return () => { listeners.delete(callback); }; },
    },
    attention: { ...backend.attention },
  };
  return {
    live,
    changeAuthBeforeProviderRefresh() {
      blocked = true;
      user = { id: DEMO_SAM, email: null };
      listeners.forEach((callback) => callback(user));
    },
  };
}

function CurrentViewer() {
  return <p data-testid="provider-viewer">{useApp().user?.id}</p>;
}

beforeEach(() => {
  localStorage.clear();
  demoStore.reset(false);
  demoStore.update((state) => { state.signedIn = true; state.actingAs = DEMO_ALEX; });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it("shares only explicitly submitted Yes answers, independently of monthly responses", async () => {
  const raise = vi.spyOn(backend.attention, "raise");
  show();
  const self = await screen.findByRole("group", { name: selfQuestion });
  const partner = screen.getByRole("group", { name: partnerQuestion });
  const share = screen.getByRole("button", { name: "Share with Sam now" }) as HTMLButtonElement;
  expect(share.disabled).toBe(true);
  fireEvent.click(within(self).getByRole("radio", { name: "No" }));
  fireEvent.click(within(partner).getByRole("radio", { name: "Skip" }));
  expect(share.disabled).toBe(true);
  expect(raise).not.toHaveBeenCalled();
  fireEvent.click(within(self).getByRole("radio", { name: "Yes" }));
  expect(raise).not.toHaveBeenCalled();
  fireEvent.click(share);
  await screen.findByText("Shared with Sam. Your concern is now visible to both of you.");
  expect(raise).toHaveBeenCalledExactlyOnceWith("self", DEMO_ALEX);
  expect(await screen.findByText("You shared that you may have stopped making an effort.")).toBeTruthy();
  const monthly = await backend.checkins.get(periodOf(new Date()));
  expect(monthly.iSubmitted).toBe(false);
  expect(monthly.partnerSubmitted).toBe(false);
});

it("allows the partner to acknowledge and only the author to resolve", async () => {
  await backend.attention.raise("partner", DEMO_ALEX);
  show();
  expect(await screen.findByText("You feel Sam may have stopped making an effort.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Acknowledge" })).toBeNull();
  switchTo(DEMO_SAM);
  expect(await screen.findByText("Al feels you may have stopped making an effort.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Mark resolved" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Acknowledge" }));
  await screen.findByText("You acknowledged this.");
  expect(screen.getByRole("heading", { name: "Needs attention" })).toBeTruthy();
  switchTo(DEMO_ALEX);
  await screen.findByText("Sam acknowledged this.");
  fireEvent.click(screen.getByRole("button", { name: "Mark resolved" }));
  await waitFor(() => expect(screen.queryByRole("heading", { name: "Needs attention" })).toBeNull());
  expect(await backend.attention.list()).toEqual([]);
});

it("keeps a failed share selected and offers a retry without reporting success", async () => {
  vi.spyOn(backend.attention, "raise").mockRejectedValueOnce(new Error("offline"));
  show();
  const self = await screen.findByRole("group", { name: selfQuestion });
  fireEvent.click(within(self).getByRole("radio", { name: "Yes" }));
  fireEvent.click(screen.getByRole("button", { name: "Share with Sam now" }));
  await screen.findByText("Could not confirm sharing. Your concern may already be visible to your partner. Your Yes is still selected; retrying is safe.");
  expect(screen.queryByText(/Your concern is now visible/)).toBeNull();
  expect((within(self).getByRole("radio", { name: "Yes" }) as HTMLInputElement).checked).toBe(true);
  expect(await backend.attention.list()).toEqual([]);
  fireEvent.click(screen.getByRole("button", { name: "Share with Sam now" }));
  await screen.findByText("Shared with Sam. Your concern is now visible to both of you.");
});

it("retries only the remaining concern after a partial two-answer submission", async () => {
  const original = backend.attention.raise;
  const raise = vi.spyOn(backend.attention, "raise").mockImplementationOnce(original).mockRejectedValueOnce(new Error("offline"));
  show();
  const self = await screen.findByRole("group", { name: selfQuestion });
  const partner = screen.getByRole("group", { name: partnerQuestion });
  fireEvent.click(within(self).getByRole("radio", { name: "Yes" }));
  fireEvent.click(within(partner).getByRole("radio", { name: "Yes" }));
  fireEvent.click(screen.getByRole("button", { name: "Share with Sam now" }));
  await screen.findByText(/One concern was shared. We could not confirm the other/);
  expect((within(self).getByRole("radio", { name: "Yes" }) as HTMLInputElement).checked).toBe(false);
  expect((within(partner).getByRole("radio", { name: "Yes" }) as HTMLInputElement).checked).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Share with Sam now" }));
  await screen.findByText("Shared with Sam. Your concern is now visible to both of you.");
  expect(raise.mock.calls.map(([subject]) => subject)).toEqual(["self", "partner", "partner"]);
  expect((await backend.attention.list()).length).toBe(2);
});

it("discards another persona's draft and late submission result", async () => {
  let finish!: () => void;
  vi.spyOn(backend.attention, "raise").mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
  show();
  const self = await screen.findByRole("group", { name: selfQuestion });
  fireEvent.click(within(self).getByRole("radio", { name: "Yes" }));
  fireEvent.click(screen.getByRole("button", { name: "Share with Sam now" }));
  switchTo(DEMO_SAM);
  const share = await screen.findByRole("button", { name: "Share with Al now" });
  await act(async () => finish());
  expect((share as HTMLButtonElement).disabled).toBe(true);
  expect(screen.queryByText(/Your concern is now visible/)).toBeNull();
  expect((within(screen.getByRole("group", { name: selfQuestion })).getByRole("radio", { name: "Yes" }) as HTMLInputElement).checked).toBe(false);
});

it("stops a two-answer live submission on auth change before the provider remounts", async () => {
  const { live, changeAuthBeforeProviderRefresh } = liveAuthFacade();
  vi.spyOn(backendModule, "getBackend").mockReturnValue(live);
  let finish!: () => void;
  const raise = vi.spyOn(live.attention, "raise").mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
  render(<AppProvider><CurrentViewer /><AttentionBanner /><AttentionForm /></AppProvider>);
  const self = await screen.findByRole("group", { name: selfQuestion });
  const partner = screen.getByRole("group", { name: partnerQuestion });
  fireEvent.click(within(self).getByRole("radio", { name: "Yes" }));
  fireEvent.click(within(partner).getByRole("radio", { name: "Yes" }));
  fireEvent.click(screen.getByRole("button", { name: "Share with Sam now" }));
  expect(raise).toHaveBeenCalledExactlyOnceWith("self", DEMO_ALEX);
  act(() => changeAuthBeforeProviderRefresh());
  expect(screen.getByTestId("provider-viewer").textContent).toBe(DEMO_ALEX);
  expect(screen.queryByRole("group", { name: selfQuestion })).toBeNull();
  await act(async () => finish());
  expect(raise).toHaveBeenCalledExactlyOnceWith("self", DEMO_ALEX);
  expect(screen.queryByText(/Your concern is now visible/)).toBeNull();
});

it("invalidates live alert reads and actions before the provider publishes a changed account", async () => {
  const { live, changeAuthBeforeProviderRefresh } = liveAuthFacade();
  vi.spyOn(backendModule, "getBackend").mockReturnValue(live);
  const signal: AttentionSignal = { id: "signal", coupleId: demoStore.get().couple!.id, authorId: DEMO_SAM, subject: "self", createdAt: "2026-01-01T12:00:00Z", acknowledgedAt: null, resolvedAt: null };
  let finishRead!: (signals: AttentionSignal[]) => void;
  const list = vi.spyOn(live.attention, "list").mockResolvedValueOnce([signal]).mockImplementation(() => new Promise<AttentionSignal[]>((resolve) => { finishRead = resolve; }));
  const acknowledge = vi.spyOn(live.attention, "acknowledge");
  render(<AppProvider><CurrentViewer /><AttentionBanner /></AppProvider>);
  const action = await screen.findByRole("button", { name: "Acknowledge" });
  fireEvent.focus(window);
  await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  act(() => changeAuthBeforeProviderRefresh());
  expect(screen.getByTestId("provider-viewer").textContent).toBe(DEMO_ALEX);
  expect(screen.queryByRole("heading", { name: "Needs attention" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Review shared concern" })).toBeNull();
  fireEvent.click(action);
  expect(acknowledge).not.toHaveBeenCalled();
  await act(async () => finishRead([signal]));
  expect(screen.queryByRole("heading", { name: "Needs attention" })).toBeNull();
});

it("refreshes shared state when a response is lost after the concern was saved", async () => {
  const original = backend.attention.raise;
  vi.spyOn(backend.attention, "subscribe").mockImplementation(() => () => {});
  vi.spyOn(backend.attention, "raise").mockImplementationOnce(async (subject, viewerId) => {
    await original(subject, viewerId);
    throw new Error("response lost");
  });
  show();
  const self = await screen.findByRole("group", { name: selfQuestion });
  fireEvent.click(within(self).getByRole("radio", { name: "Yes" }));
  fireEvent.click(screen.getByRole("button", { name: "Share with Sam now" }));
  await screen.findByText("Could not confirm sharing. Your concern may already be visible to your partner. Your Yes is still selected; retrying is safe.");
  await screen.findByText("You shared that you may have stopped making an effort.");
  expect(screen.queryByText(/Your concern is now visible/)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Share with Sam now" }));
  await screen.findByText("Shared with Sam. Your concern is now visible to both of you.");
  expect(await backend.attention.list()).toHaveLength(1);
});

it("keeps an acknowledgment failure actionable and does not resolve the concern", async () => {
  await backend.attention.raise("self", DEMO_ALEX);
  switchTo(DEMO_SAM);
  vi.spyOn(backend.attention, "acknowledge").mockRejectedValueOnce(new Error("offline"));
  show();
  fireEvent.click(await screen.findByRole("button", { name: "Acknowledge" }));
  await screen.findByText("Could not confirm that change. It may already be saved; retrying is safe.");
  expect(screen.queryByText("You acknowledged this.")).toBeNull();
  await waitFor(() => expect((screen.getByRole("button", { name: "Acknowledge" }) as HTMLButtonElement).disabled).toBe(false));
  expect((await backend.attention.list())[0]?.acknowledgedAt).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Acknowledge" }));
  await screen.findByText("You acknowledged this.");
  expect((await backend.attention.list()).length).toBe(1);
});

it("offers a retry after a load failure", async () => {
  await backend.attention.raise("self", DEMO_ALEX);
  vi.spyOn(backend.attention, "list").mockRejectedValueOnce(new Error("offline"));
  show();
  fireEvent.click(await screen.findByRole("button", { name: "Retry shared concerns" }));
  await screen.findByText("You shared that you may have stopped making an effort.");
  expect(screen.queryByText("Shared concerns could not refresh")).toBeNull();
});

it("shows a visible partner notice once per signal, without repeating on refresh", async () => {
  await backend.attention.raise("partner", DEMO_ALEX);
  switchTo(DEMO_SAM);
  show();
  const review = await screen.findByRole("button", { name: "Review shared concern" });
  fireEvent.click(review);
  expect(screen.queryByRole("button", { name: "Review shared concern" })).toBeNull();
  const list = vi.spyOn(backend.attention, "list");
  fireEvent.focus(window);
  await waitFor(() => expect(list).toHaveBeenCalled());
  await screen.findByText("Al feels you may have stopped making an effort.");
  expect(screen.queryByRole("button", { name: "Review shared concern" })).toBeNull();
});

it("receives subscribed changes and refreshes on focus and fallback polling without a load loop", async () => {
  vi.useFakeTimers();
  const coupleId = demoStore.get().couple!.id;
  const signal: AttentionSignal = { id: "signal", coupleId, authorId: DEMO_SAM, subject: "self", createdAt: "2026-01-01T12:00:00Z", acknowledgedAt: null, resolvedAt: null };
  let notify: (() => void) | undefined;
  let records: AttentionSignal[] = [];
  const list = vi.spyOn(backend.attention, "list").mockImplementation(async () => records);
  vi.spyOn(backend.attention, "subscribe").mockImplementation((callback) => { notify = callback; return () => { notify = undefined; }; });
  const view = renderHook(() => useAttentionSignals(backend, DEMO_ALEX, coupleId));
  await act(async () => {});
  expect(list).toHaveBeenCalledTimes(1);
  records = [signal];
  await act(async () => notify?.());
  expect(view.result.current.signals).toEqual([signal]);
  expect(list).toHaveBeenCalledTimes(2);
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(list).toHaveBeenCalledTimes(3);
  await act(async () => vi.advanceTimersByTimeAsync(45_000));
  expect(list).toHaveBeenCalledTimes(4);
  view.unmount();
  await act(async () => vi.advanceTimersByTimeAsync(45_000));
  expect(list).toHaveBeenCalledTimes(4);
  expect(notify).toBeUndefined();
});
