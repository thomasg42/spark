// @vitest-environment jsdom
/**
 * Renders the real Agreements and Settings pages on top of the real demo backend
 * (AppProvider + RequireStage + demoStore seed), so the seed data, the saves, and
 * the "agreement is always the more private choice" rule are checked end to end.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentType } from "react";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/us/",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/link", async () => {
  const React = await import("react");
  return {
    default: ({ href, children, ...rest }: { href: string; children?: React.ReactNode } & Record<string, unknown>) =>
      React.createElement("a", { href, ...rest }, children),
  };
});

import AgreementsPage from "@/app/us/agreements/page";
import SettingsPage from "@/app/us/settings/page";
import { formatLongDate } from "@/components/agreements/view-model";
import { AppProvider } from "@/components/app-provider";
import { ToastProvider } from "@/components/ui";
import { DEMO_ALEX, DEMO_SAM, demoStore } from "@/lib/backend/demo/store";
import { addDays } from "@/lib/domain/dates";

const WAIT = { timeout: 4000 };

function renderPage(Page: ComponentType) {
  return render(
    <AppProvider>
      <ToastProvider>
        <Page />
      </ToastProvider>
    </AppProvider>,
  );
}

const agreementBox = () => screen.getByText("Your agreement").parentElement as HTMLElement;
const rhythmBox = () => screen.getByText("Your shared rhythm").parentElement as HTMLElement;
const pickTile = (label: string) => screen.getByText(label).closest("div") as HTMLElement;

beforeEach(() => {
  demoStore.reset(false);
  router.push.mockClear();
  router.replace.mockClear();
});

describe("Agreements page with the demo couple", () => {
  it("shows both rhythm picks, the split, the ladder as text, and the next revisit date", async () => {
    renderPage(AgreementsPage);
    await screen.findByText("Check-in rhythm", undefined, WAIT);

    expect(within(pickTile("You picked")).getByText("Every week")).toBeTruthy();
    expect(within(pickTile("Sam picked")).getByText("Every month")).toBeTruthy();
    expect(within(rhythmBox()).getByText("Every two weeks")).toBeTruthy();
    expect(within(rhythmBox()).getByText(/halfway between your two choices/i)).toBeTruthy();

    const ladder = screen.getByRole("list", { name: "From most often to least often" });
    expect(within(ladder).getAllByRole("listitem")).toHaveLength(5);
    expect(within(ladder).getByText("Every week: your pick")).toBeTruthy();
    expect(within(ladder).getByText("Every month: Sam's pick")).toBeTruthy();
    expect(within(ladder).getByText("Every two weeks: your shared rhythm")).toBeTruthy();

    const reviewedAt = demoStore.get().couple!.cadenceReviewedAt;
    const expected = formatLongDate(addDays(new Date(reviewedAt), 90));
    expect(screen.getByText(`Next revisit around ${expected}`)).toBeTruthy();
    expect(screen.queryByText(/Still feel right\?/)).toBeNull();
  });

  it("shows both social choices and highlights the more private one as the agreement", async () => {
    renderPage(AgreementsPage);
    await screen.findByText("Social media", undefined, WAIT);

    const choices = screen.getByRole("list", { name: "Both choices" });
    const [mineTile, partnerTile] = within(choices).getAllByRole("listitem") as [HTMLElement, HTMLElement];
    expect(within(mineTile).getByText("Your choice")).toBeTruthy();
    expect(within(mineTile).getByText("Big milestones")).toBeTruthy();
    expect(within(partnerTile).getByText("Sam's choice")).toBeTruthy();
    expect(within(partnerTile).getByText("Relationship status only")).toBeTruthy();
    expect(within(partnerTile).getByText("More private, so we use this")).toBeTruthy();
    expect(within(mineTile).queryByText("More private, so we use this")).toBeNull();

    expect(within(agreementBox()).getByText("Relationship status only")).toBeTruthy();
    expect(screen.getByText("Spark always goes with the more private choice. Nobody gets pushed to share more than they want.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open Moments" }).getAttribute("href")).toBe("/moments/");
  });

  it("saves a new social choice immediately and keeps the agreement at the more private choice", async () => {
    renderPage(AgreementsPage);
    const toggle = await screen.findByRole("button", { name: "Change my choice" }, WAIT);
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(screen.getByRole("radio", { name: /Keep us private/ }));
    await waitFor(() => expect(within(agreementBox()).getByText("Keep us private")).toBeTruthy(), WAIT);
    expect(demoStore.get().profiles[DEMO_ALEX]!.socialSharing).toBe("private");
    expect(await screen.findByText('Saved. Your agreement is "Keep us private".', undefined, WAIT)).toBeTruthy();

    // Choosing something more public than Sam never makes the agreement more public than Sam's choice.
    fireEvent.click(screen.getByRole("radio", { name: /Share freely/ }));
    await waitFor(() => expect(demoStore.get().profiles[DEMO_ALEX]!.socialSharing).toBe("open"), WAIT);
    await waitFor(() => expect(within(agreementBox()).getByText("Relationship status only")).toBeTruthy(), WAIT);
  });

  it("saves a new rhythm pick immediately and re-splits the difference", async () => {
    renderPage(AgreementsPage);
    fireEvent.click(await screen.findByRole("button", { name: "Change my pick" }, WAIT));
    fireEvent.click(screen.getByRole("radio", { name: /Every day/ }));
    await waitFor(() => expect(within(rhythmBox()).getByText("Every week")).toBeTruthy(), WAIT);
    expect(demoStore.get().profiles[DEMO_ALEX]!.preferredCadence).toBe("daily");
    expect(await screen.findByText("Saved. Your shared rhythm is every week.", undefined, WAIT)).toBeTruthy();
  });

  it("offers the quarterly revisit when it is due, and 'Yes, keep it' marks it reviewed", async () => {
    demoStore.update((s) => {
      s.couple!.cadenceReviewedAt = addDays(new Date(), -100).toISOString();
    });
    renderPage(AgreementsPage);
    expect(await screen.findByText("It's been a few months. Still feel right?", undefined, WAIT)).toBeTruthy();
    const before = Date.now();
    fireEvent.click(screen.getByRole("button", { name: "Yes, keep it" }));
    await waitFor(() => expect(screen.queryByText(/Still feel right\?/)).toBeNull(), WAIT);
    expect(screen.getByText(/^Next revisit around/)).toBeTruthy();
    expect(new Date(demoStore.get().couple!.cadenceReviewedAt).getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  it("shows the same agreements from Sam's side with the names flipped", async () => {
    demoStore.update((s) => {
      s.actingAs = DEMO_SAM;
    });
    renderPage(AgreementsPage);
    await screen.findByText("Check-in rhythm", undefined, WAIT);
    expect(within(pickTile("You picked")).getByText("Every month")).toBeTruthy();
    expect(within(pickTile("Al picked")).getByText("Every week")).toBeTruthy();
    expect(within(rhythmBox()).getByText("Every two weeks")).toBeTruthy();
    expect(screen.getByText("Al's choice")).toBeTruthy();
    expect(within(agreementBox()).getByText("Relationship status only")).toBeTruthy();
  });

  it("shows a pending state instead of an agreement until both have chosen", async () => {
    demoStore.update((s) => {
      s.profiles[DEMO_SAM]!.socialSharing = null;
    });
    const { unmount } = renderPage(AgreementsPage);
    expect(await screen.findByText("Waiting for Sam to choose", undefined, WAIT)).toBeTruthy();
    expect(screen.queryByText("Your agreement")).toBeNull();
    unmount();

    demoStore.update((s) => {
      s.actingAs = DEMO_SAM;
    });
    renderPage(AgreementsPage);
    expect(await screen.findByText("Pick yours", undefined, WAIT)).toBeTruthy();
    // No extra tap needed: the choices are already showing.
    expect(screen.getByRole("radio", { name: /Keep us private/ })).toBeTruthy();
    expect(screen.queryByText("Your agreement")).toBeNull();
  });

  it("keeps the choices on screen and focus in place after a first social pick", async () => {
    demoStore.update((s) => {
      s.profiles[DEMO_ALEX]!.socialSharing = null;
    });
    renderPage(AgreementsPage);
    const radio = await screen.findByRole("radio", { name: /Keep us private/ }, WAIT);
    radio.focus();
    fireEvent.click(radio);
    await waitFor(() => expect(within(agreementBox()).getByText("Keep us private")).toBeTruthy(), WAIT);
    // Still visible (role queries skip hidden elements) with a way to close it.
    const after = screen.getByRole("radio", { name: /Keep us private/ }) as HTMLInputElement;
    expect(after.checked).toBe(true);
    expect(document.activeElement).toBe(after);
    expect(screen.getByRole("button", { name: "Done" }).getAttribute("aria-expanded")).toBe("true");
  });

  it("never shows anyone's private answers", async () => {
    renderPage(AgreementsPage);
    await screen.findByText("Social media", undefined, WAIT);
    const text = document.body.textContent ?? "";
    for (const list of Object.values(demoStore.get().answers)) {
      for (const answer of list) {
        if (typeof answer.value === "string") expect(text).not.toContain(answer.value);
      }
    }
  });
});

describe("Settings page with the demo couple", () => {
  it("prefills the profile, shows the birthday read-only and saves changes", async () => {
    renderPage(SettingsPage);
    const name = (await screen.findByLabelText("Your name", undefined, WAIT)) as HTMLInputElement;
    expect(name.value).toBe("Alex");
    const nickname = screen.getByLabelText(/Nickname/) as HTMLInputElement;
    expect(nickname.value).toBe("Al");
    expect(screen.getByText("May 17, 1994")).toBeTruthy();
    expect(screen.queryByLabelText(/Birthday/)).toBeNull();

    fireEvent.change(nickname, { target: { value: "  Lex " } });
    fireEvent.change(screen.getByLabelText(/Birth place/), { target: { value: "Lisbon, Portugal" } });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    expect(await screen.findByText("Profile saved", undefined, WAIT)).toBeTruthy();
    const saved = demoStore.get().profiles[DEMO_ALEX]!;
    expect(saved.nickname).toBe("Lex");
    expect(saved.birthPlace).toBe("Lisbon, Portugal");
    expect(saved.birthday).toBe("1994-05-17");
  });

  it("does not save an empty name", async () => {
    renderPage(SettingsPage);
    const name = await screen.findByLabelText("Your name", undefined, WAIT);
    fireEvent.change(name, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    expect(await screen.findByText("Add the name your partner knows you by.")).toBeTruthy();
    expect(demoStore.get().profiles[DEMO_ALEX]!.displayName).toBe("Alex");
  });

  it("applies a new accent instantly and saves it", async () => {
    renderPage(SettingsPage);
    fireEvent.click(await screen.findByRole("radio", { name: "Ocean" }, WAIT));
    expect(document.documentElement.dataset.accent).toBe("ocean");
    await waitFor(() => expect(demoStore.get().profiles[DEMO_ALEX]!.accentTheme).toBe("ocean"), WAIT);
    expect(await screen.findByText("Look saved", undefined, WAIT)).toBeTruthy();
  });

  it("saves the shared city and rejects a future together date", async () => {
    renderPage(SettingsPage);
    const city = (await screen.findByLabelText(/City/, undefined, WAIT)) as HTMLInputElement;
    expect(city.value).toBe("Bozeman, MT");
    fireEvent.change(city, { target: { value: "Missoula, MT" } });
    fireEvent.click(screen.getByRole("button", { name: "Save details" }));
    expect(await screen.findByText("Saved for both of you", undefined, WAIT)).toBeTruthy();
    expect(demoStore.get().couple!.city).toBe("Missoula, MT");

    const before = demoStore.get().couple!.togetherSince;
    fireEvent.change(screen.getByLabelText(/Together since/), { target: { value: "2999-01-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Save details" }));
    expect(await screen.findByText("Pick a date that has already happened.")).toBeTruthy();
    expect(demoStore.get().couple!.togetherSince).toBe(before);
  });

  it("is honest about data export and deletion, notes demo mode, and links privacy and support", async () => {
    renderPage(SettingsPage);
    await screen.findByText("Your data", undefined, WAIT);
    expect(screen.getByText(/planned for a later release/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /export|download|delete/i })).toBeNull();
    expect(screen.getByText(/Changes here stay in this browser/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "What's private" }).getAttribute("href")).toBe("/privacy/");
    expect(screen.getByRole("link", { name: "Support" }).getAttribute("href")).toBe("/support/");
    expect(screen.getByText("alex@demo.spark")).toBeTruthy();
  });

  it("signs out and goes to the start page", async () => {
    renderPage(SettingsPage);
    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }, WAIT));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/"), WAIT);
    expect(demoStore.get().signedIn).toBe(false);
  });
});
