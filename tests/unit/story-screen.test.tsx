// @vitest-environment jsdom
/**
 * Renders the Our Story screen against the demo backend and seed data:
 * reminders, timeline, photos, authorship, add, edit, delete with inline
 * confirm, quick starts, and validation.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { AppProvider } from "@/components/app-provider";
import { StoryScreen } from "@/components/story/story-screen";
import { ToastProvider } from "@/components/ui";
import { DEMO_ALEX, demoStore } from "@/lib/backend/demo/store";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

function renderScreen() {
  return render(
    <AppProvider>
      <ToastProvider>
        <StoryScreen />
      </ToastProvider>
    </AppProvider>,
  );
}

beforeEach(() => {
  demoStore.reset(false);
  demoStore.update((s) => {
    s.signedIn = true;
    s.actingAs = DEMO_ALEX;
  });
});

afterEach(() => cleanup());

describe("Our Story screen", () => {
  it("shows the seed timeline, the upcoming anniversary, photos and who added what", async () => {
    renderScreen();
    expect(await screen.findByRole("heading", { name: "Made it official" })).toBeTruthy();

    const comingUp = screen.getByRole("region", { name: "Coming up" });
    expect(within(comingUp).getByText("Made it official")).toBeTruthy();
    expect(within(comingUp).getByText("In 12 days")).toBeTruthy();
    expect(within(comingUp).getByText(/2 years on/)).toBeTruthy();

    const photo = (await screen.findByAltText('Photo for "Trivia night, wrong team"')) as HTMLImageElement;
    expect(photo.getAttribute("src")).toMatch(/^data:image\/svg\+xml/);

    const tacos = document.getElementById("story-entry-seed-story-2")!;
    expect(within(tacos).getByText("Added by Sam")).toBeTruthy();
    const trivia = document.getElementById("story-entry-seed-story-1")!;
    expect(within(trivia).getByText("Added by you")).toBeTruthy();

    // Classic firsts not added yet are offered, gently.
    const more = screen.getByRole("group", { name: "Add a classic first" });
    expect(within(more).getByRole("button", { name: "First kiss" })).toBeTruthy();
    expect(within(more).queryByRole("button", { name: "How we met" })).toBeNull();
  });

  it("adds an entry inline, validates the title, and announces the save", async () => {
    renderScreen();
    await screen.findByRole("heading", { name: "Made it official" });
    fireEvent.click(screen.getByRole("button", { name: "Add a moment" }));

    const heading = await screen.findByRole("heading", { name: "Add to your story" });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText(/Shared with Sam/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Save to our story" }));
    expect(await screen.findByText("Give this moment a short title.")).toBeTruthy();

    fireEvent.click(screen.getByRole("radio", { name: "Trip" }));
    expect(screen.getByText(STORY_PROMPT_TRIP)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Glacier weekend" } });
    fireEvent.change(screen.getByLabelText(/When was it/), { target: { value: "2025-07-04" } });
    fireEvent.change(screen.getByLabelText(/Notes/), { target: { value: "Mountain goats." } });
    fireEvent.click(screen.getByRole("button", { name: "Save to our story" }));

    expect(await screen.findByText("Added to your story")).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "Glacier weekend" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Add to your story" })).toBeNull();
    const saved = demoStore.get().story.find((e) => e.title === "Glacier weekend")!;
    expect(saved).toMatchObject({ kind: "trip", happenedOn: "2025-07-04", body: "Mountain goats.", authorId: DEMO_ALEX, remindYearly: false });
    await waitFor(() => expect(document.activeElement?.id).toBe(`story-entry-${saved.id}`));
  });

  it("edits an entry in place and removes another with an inline confirm", async () => {
    renderScreen();
    await screen.findByRole("heading", { name: "Made it official" });

    fireEvent.click(screen.getByRole("button", { name: 'Edit "Tacos and a very long walk"' }));
    const title = (await screen.findByLabelText("Title")) as HTMLInputElement;
    expect(title.value).toBe("Tacos and a very long walk");
    fireEvent.change(title, { target: { value: "Tacos, then a very long walk" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("heading", { name: "Tacos, then a very long walk" })).toBeTruthy();
    expect(demoStore.get().story.find((e) => e.id === "seed-story-2")!.title).toBe("Tacos, then a very long walk");

    fireEvent.click(screen.getByRole("button", { name: 'Edit "Trivia night, wrong team"' }));
    fireEvent.click(await screen.findByRole("button", { name: "Remove this moment" }));
    const confirm = screen.getByRole("group", { name: "Remove this moment from your story?" });
    await waitFor(() => expect(document.activeElement).toBe(within(confirm).getByRole("button", { name: "Keep it" })));
    fireEvent.click(within(confirm).getByRole("button", { name: "Yes, remove it" }));

    expect(await screen.findByText("Removed from your story")).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Trivia night, wrong team" })).toBeNull());
    expect(demoStore.get().story.some((e) => e.id === "seed-story-1")).toBe(false);
  });

  it("starts an empty story from a classic first, with reminders on for together", async () => {
    demoStore.update((s) => {
      s.story = [];
    });
    renderScreen();
    expect(await screen.findByText("Start your story")).toBeTruthy();
    const starters = screen.getByRole("group", { name: "Start with a classic first" });
    fireEvent.click(within(starters).getByRole("button", { name: "First kiss" }));

    expect(((await screen.findByRole("radio", { name: "First kiss" })) as HTMLInputElement).checked).toBe(true);
    const remind = screen.getByRole("switch", { name: "Remind us every year" }) as HTMLInputElement;
    expect(remind.checked).toBe(false);
    fireEvent.click(screen.getByRole("radio", { name: "Officially together" }));
    expect(remind.checked).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Add to your story" })).toBeNull());
    await waitFor(() => expect(document.activeElement?.id).toBe("story-quick-first_kiss"));
  });

  it("rejects a non-photo file before saving", async () => {
    renderScreen();
    await screen.findByRole("heading", { name: "Made it official" });
    fireEvent.click(screen.getByRole("button", { name: "Add a moment" }));
    const input = (await screen.findByLabelText(/Add a photo/)) as HTMLInputElement;
    const clip = new File([new Uint8Array([1])], "clip.mp4", { type: "video/mp4" });
    await act(async () => {
      fireEvent.change(input, { target: { files: [clip] } });
    });
    expect(screen.getByText("Please choose a photo.")).toBeTruthy();
  });
});

const STORY_PROMPT_TRIP = "Where to, and the moment you'd relive?";
