import { describe, expect, it, beforeEach } from "vitest";
import { onBoundaryShared, reviewBoundary } from "@shared/boundaries.ts";
import { goalsCopyIsClean, pauseChangesOnly, projectGoal, type GoalDraft, type GoalRecord } from "@shared/our-goals.ts";
import { findSection, suggestConnectionQuestion } from "@shared/questionnaires.ts";
import { createDemoBackend } from "@/lib/backend/demo";
import { demoStore } from "@/lib/backend/demo/store";
import { DEMO_ALEX, DEMO_SAM } from "@/lib/backend/demo/seed";

const goal = (id: string, status: GoalRecord["status"] = "active"): GoalRecord => ({
  id,
  coupleId: "c",
  type: "home",
  title: status === "drafting" ? "" : "A home",
  status,
  createdAt: "2026-10-10T00:00:00.000Z",
  updatedAt: "2026-10-10T00:00:00.000Z",
});

describe("boundary coach", () => {
  it("turns controlling wording into what I will do", () => {
    const review = reviewBoundary("You're not allowed to go out", "You have to stay home");
    expect(review.kind).toBe("reword");
    if (review.kind !== "reword") return;
    expect(review.text.toLowerCase()).not.toContain("not allowed");
    expect(review.myAction.toLowerCase()).toContain("i'll");
  });
  it("stops coaching and shows resources for crisis wording", () => {
    const review = reviewBoundary("I am afraid of an overdose at home", "I will leave");
    expect(review.kind).toBe("crisis");
    if (review.kind !== "crisis") return;
    expect(review.resources.map((item) => item.id)).toEqual(expect.arrayContaining(["988", "911", "dv", "samhsa", "rainn"]));
  });
  it("does not notify anyone when a boundary is shared", () => {
    expect(onBoundaryShared()).toEqual({ notified: false, channel: null });
  });
});

describe("our goals", () => {
  const members = ["a", "b"];
  const drafts = (submitted: boolean): GoalDraft[] => [
    { goalId: "g", authorId: "a", version: "My house", why: "Roots", submittedAt: "2026-10-10T00:00:00.000Z" },
    { goalId: "g", authorId: "b", version: "Our home", why: "Us", submittedAt: submitted ? "2026-10-10T01:00:00.000Z" : null },
  ];
  it("hides the other version until both submit", () => {
    const hidden = projectGoal({ goal: goal("g", "drafting"), drafts: drafts(false), milestones: [], events: [], checkins: [], uid: "a", partnerId: "b", memberIds: members });
    expect(hidden.partner).toBeNull();
    expect(hidden.mine?.version).toBe("My house");
    const shown = projectGoal({ goal: goal("g", "drafting"), drafts: drafts(true), milestones: [], events: [], checkins: [], uid: "a", partnerId: "b", memberIds: members });
    expect(shown.partner?.version).toBe("Our home");
  });
  it("pausing one goal leaves the others alone", () => {
    const next = pauseChangesOnly([goal("one"), goal("two", "paused"), goal("three")], "one");
    expect(next.map((item) => item.status)).toEqual(["paused", "paused", "active"]);
  });
  it("has no streak or guilt copy", () => {
    expect(goalsCopyIsClean()).toBe(true);
  });
});

describe("connection questions", () => {
  it("seeds twenty skippable prompts and stays quiet during conflict", () => {
    const section = findSection("connection");
    const prompts = section?.sittings.flatMap((sitting) => sitting.questions) ?? [];
    expect(prompts).toHaveLength(20);
    expect(prompts.every((question) => question.optional)).toBe(true);
    expect(suggestConnectionQuestion(false)).toBeNull();
    expect(suggestConnectionQuestion(true)).toBe(prompts[0]?.prompt);
  });
});

describe("demo privacy for goals and boundaries", () => {
  beforeEach(() => demoStore.reset(false));
  it("keeps a draft invisible, then shares it without notifying", async () => {
    const backend = createDemoBackend();
    const saved = await backend.boundaries.save({ category: "honesty", text: "I need honesty even when it's hard.", myAction: "I'll ask once, then give us a calm time to talk." });
    demoStore.update((state) => { state.actingAs = DEMO_SAM; });
    expect((await backend.boundaries.list()).partner).toHaveLength(0);
    demoStore.update((state) => { state.actingAs = DEMO_ALEX; });
    await backend.boundaries.setStatus(saved.id, "shared");
    expect(onBoundaryShared().notified).toBe(false);
    demoStore.update((state) => { state.actingAs = DEMO_SAM; });
    const seen = await backend.boundaries.list();
    expect(seen.partner.map((row) => row.id)).toContain(saved.id);
    await backend.boundaries.ack(saved.id, "understood");
    demoStore.update((state) => { state.actingAs = DEMO_ALEX; });
    await expect(backend.boundaries.ack(saved.id, "understood")).rejects.toThrow(/partner shared/);
  });
  it("lets both edit a merged goal and keeps history", async () => {
    const backend = createDemoBackend();
    const started = await backend.ourGoals.start("travel");
    await backend.ourGoals.submitDraft(started.id, { version: "A long weekend", why: "Time together" });
    demoStore.update((state) => { state.actingAs = DEMO_SAM; });
    expect((await backend.ourGoals.list()).find((item) => item.id === started.id)?.partner).toBeNull();
    await backend.ourGoals.submitDraft(started.id, { version: "A trip with no rush", why: "Rest" });
    const merged = await backend.ourGoals.merge(started.id, { title: "A slow trip", milestones: [{ title: "Pick a date", myPart: "I check the calendar", partnerPart: "Alex picks two options" }] });
    expect(merged.bothSubmitted).toBe(true);
    const renamed = await backend.ourGoals.rename(started.id, "A slow trip this spring");
    expect(renamed.history.some((event) => event.note === "Edited the shared words.")).toBe(true);
    await backend.ourGoals.setMilestone(started.id, renamed.milestones[0]!.id, true);
    const other = await backend.ourGoals.start("home");
    await backend.ourGoals.setStatus(started.id, "paused");
    const cards = await backend.ourGoals.list();
    expect(cards.find((item) => item.id === started.id)?.status).toBe("paused");
    expect(cards.find((item) => item.id === other.id)?.status).toBe("drafting");
  });
});
