// @vitest-environment jsdom
/**
 * Drives the real questionnaire pages against the demo backend: privacy copy
 * comes first, the flow resumes where you left off, saves each step, shows
 * crisis resources right away, and never shows the partner's answers.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { AppState } from "@/components/app-provider";
import { createDemoBackend } from "@/lib/backend/demo";
import { DEMO_ALEX, DEMO_SAM, demoStore } from "@/lib/backend/demo/store";
import { SectionClient } from "@/app/us/questions/[section]/section-client";
import QuestionsPage from "@/app/us/questions/page";
import { PRIVATE_ANSWERS_PROMISE } from "@/components/questions/privacy-explainer";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/us/questions/",
}));

let appState: Partial<AppState> = {};
vi.mock("@/components/app-provider", () => ({ useApp: () => appState }));

function signInAs(userId: string) {
  demoStore.update((s) => {
    s.signedIn = true;
    s.actingAs = userId;
  });
  appState = { backend: createDemoBackend(), stage: "ready", user: { id: userId, email: null } };
}

beforeEach(() => {
  demoStore.reset(false);
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});
afterEach(() => cleanup());

// next/link only keeps the trailing slash when the build config (trailingSlash: true) is loaded.
const hrefOf = (el: Element) => (el.getAttribute("href") ?? "").replace(/\/?$/, "/");
const heading = () => screen.findByRole("heading", { level: 2, name: /^Question \d+ of \d+ in/ });

describe("questions hub", () => {
  it("explains privacy before any question, lists Phase 1 sets with progress, and shows later sets as not clickable", async () => {
    signInAs(DEMO_SAM);
    const { container } = render(<QuestionsPage />);
    expect(screen.getByText(PRIVATE_ANSWERS_PROMISE)).toBeTruthy();
    const links = await screen.findAllByRole("link", { name: /Not started|done|All done/ });
    expect(links.map(hrefOf)).toEqual(["/us/questions/roots/", "/us/questions/beginnings/", "/us/questions/closeness_trust/", "/us/questions/attachment/", "/us/questions/direction/"]);
    expect(screen.getAllByRole("progressbar")).toHaveLength(5);
    // Privacy promise comes before the first set in reading order.
    const text = container.textContent ?? "";
    expect(text.indexOf(PRIVATE_ANSWERS_PROMISE)).toBeLessThan(text.indexOf("Beginnings"));
    // Coming later: shown with their note, never as links.
    const later = screen.getByRole("list", { name: "Coming later" });
    expect(within(later).getAllByRole("listitem")).toHaveLength(4);
    expect(within(later).queryAllByRole("link")).toHaveLength(0);
    expect(within(later).getByText("Private by default, with a confidentiality screen first.")).toBeTruthy();
  });
});

describe("section flow", () => {
  it("resumes at the first unanswered question and saves each step", async () => {
    signInAs(DEMO_ALEX); // Alex's seed already answered questions 1 and 2 of "The spark"
    render(<SectionClient sectionKey="beginnings" />);
    expect((await heading()).textContent).toBe("Question 3 of 5 in “The spark”");
    const input = screen.getByLabelText(/What made you want to keep spending time together/);
    fireEvent.change(input, { target: { value: "We could talk for hours." } });
    fireEvent.click(screen.getByRole("button", { name: "Save and continue" }));
    await waitFor(() => expect(screen.getByRole("heading", { level: 2, name: /^Question 4 of 5/ })).toBeTruthy());
    const stored = demoStore.get().answers[DEMO_ALEX]!.find((a) => a.questionId === "wanted_more_time");
    expect(stored?.value).toBe("We could talk for hours.");
  });

  it("asks for an answer or a skip instead of saving an empty one", async () => {
    signInAs(DEMO_SAM);
    render(<SectionClient sectionKey="beginnings" />);
    await heading();
    fireEvent.click(screen.getByRole("button", { name: "Save and continue" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/Write a little, or tap Skip/);
  });

  it("shows crisis resources inline as soon as the text suggests danger", async () => {
    signInAs(DEMO_SAM);
    render(<SectionClient sectionKey="beginnings" />);
    await heading();
    expect(screen.queryByRole("complementary", { name: "Crisis support" })).toBeNull();
    fireEvent.change(screen.getByLabelText(/How did you two meet/), { target: { value: "Honestly I don't feel safe, he hits me sometimes." } });
    const support = await screen.findByRole("alert", { name: "Crisis support" });
    expect(support.textContent).toMatch(/988/);
    expect(support.textContent).toMatch(/1-800-799-7233/);
  });

  it("ends a sitting with a calm card offering the next sitting or a break", async () => {
    signInAs(DEMO_SAM);
    render(<SectionClient sectionKey="beginnings" />);
    // Sam's seed already answered question 2, so the flow goes 1 -> 3 -> 4 -> 5 without asking it again.
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      seen.push((await heading()).textContent ?? "");
      fireEvent.click(screen.getByRole("button", { name: "Skip" }));
      await waitFor(() => expect(screen.queryByRole("heading", { level: 2, name: seen[seen.length - 1] })).toBeNull());
    }
    expect(seen.map((t) => t.slice(0, 13))).toEqual(["Question 1 of", "Question 3 of", "Question 4 of", "Question 5 of"]);
    expect(await screen.findByRole("heading", { name: "Nice. That's a sitting." })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Next sitting: Getting closer" })).toBeTruthy();
    expect(hrefOf(screen.getByRole("link", { name: "Take a break" }))).toBe("/us/questions/");
    expect(document.body.textContent).not.toMatch(/streak/i);
    fireEvent.click(screen.getByRole("button", { name: "Next sitting: Getting closer" }));
    expect((await heading()).textContent).toBe("Question 1 of 6 in “Getting closer”");
  });

  it("marks gentle optional questions", async () => {
    signInAs(DEMO_SAM);
    demoStore.update((s) => {
      s.answers[DEMO_SAM] = ["how_we_met_mine", "what_attracted_you", "wanted_more_time", "first_this_could_be", "early_small_thing", "met_through", "met_through_feeling", "met_through_why"].map((questionId) => ({
        questionId,
        section: "beginnings",
        value: null,
        skipped: true,
        updatedAt: "2026-10-01T00:00:00.000Z",
      }));
    });
    render(<SectionClient sectionKey="beginnings" />);
    expect((await heading()).textContent).toBe("Question 4 of 6 in “Getting closer”");
    expect(screen.getByText(/A gentle one\./)).toBeTruthy();
  });

  it("review mode lists only my answers, with Edit and an inline Clear confirmation", async () => {
    signInAs(DEMO_SAM);
    render(<SectionClient sectionKey="beginnings" />);
    await heading();
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    expect(await screen.findByRole("heading", { name: "Review my answers" })).toBeTruthy();
    expect(screen.getByText("Alex was kind to the bartender when it got busy.")).toBeTruthy();
    expect(document.body.textContent).not.toContain("laughed at their own jokes");
    expect(document.body.textContent).not.toContain("Trivia night");

    fireEvent.click(screen.getByRole("button", { name: "Clear: What attracted you to them at first?" }));
    const confirm = screen.getByRole("group", { name: "Confirm clearing this answer" });
    fireEvent.click(within(confirm).getByRole("button", { name: "Yes, clear it" }));
    await waitFor(() => expect(screen.queryByText("Alex was kind to the bartender when it got busy.")).toBeNull());
    expect(demoStore.get().answers[DEMO_SAM]!.find((a) => a.questionId === "what_attracted_you")).toBeUndefined();
    expect(demoStore.get().answers[DEMO_ALEX]!.find((a) => a.questionId === "what_attracted_you")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Answer: What attracted you to them at first?" }));
    expect((await screen.findByRole("heading", { level: 2, name: /^Editing your answer/ })).textContent).toContain("The spark");
    fireEvent.change(screen.getByLabelText(/What attracted you to them at first/), { target: { value: "Their calm." } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Their calm.")).toBeTruthy();
  });
});

describe("answered questions", () => {
  it("never offer Skip (so an answer can't be overwritten by accident) and point to Clear if emptied", async () => {
    signInAs(DEMO_ALEX);
    render(<SectionClient sectionKey="beginnings" />);
    await heading();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect((await heading()).textContent).toBe("Question 2 of 5 in “The spark”");
    expect(screen.queryByRole("button", { name: "Skip" })).toBeNull();
    expect(screen.getByRole("button", { name: "Continue" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/What attracted you to them at first/), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save and continue" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/use Clear on the Review page/);
    expect(demoStore.get().answers[DEMO_ALEX]!.find((a) => a.questionId === "what_attracted_you")?.skipped).toBe(false);
  });
});
