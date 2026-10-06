/**
 * Demo activity log + date ideas: same rules as the database and the Edge Function.
 */
import { activities } from "@/lib/backend/demo/activities";
import { DEMO_IDEAS_NOTICE, ideas } from "@/lib/backend/demo/ideas";
import { DEMO_ALEX, DEMO_SAM, demoStore } from "@/lib/backend/demo/store";
import { UserFacingError } from "@/lib/backend/types";
import { addDays, toISODate } from "@/lib/domain/dates";
import { isRepeat, MAX_BATCHES_PER_DAY } from "@shared/date-ideas.ts";
import { activityProblems, checkActivityInput } from "@/components/plans/rules";

const actAs = (userId: string) =>
  demoStore.update((s) => {
    s.signedIn = true;
    s.actingAs = userId;
  });

beforeEach(() => {
  demoStore.reset(false);
  actAs(DEMO_ALEX);
});

describe("demo activities", () => {
  it("lists the seed activities newest first with both partners' ratings", async () => {
    const list = await activities.list();
    expect(list.map((a) => a.title)).toEqual(["Farmers market + picnic", "Movie marathon", "Thai cooking night", "Hot springs day"]);
    expect(list[3]!.ratings).toEqual({ [DEMO_ALEX]: 5, [DEMO_SAM]: 5 });
    expect(list[0]!.ratings).toEqual({ [DEMO_SAM]: 4 });
  });

  it("returns copies, so callers cannot mutate the store", async () => {
    const [first] = await activities.list();
    first!.ratings[DEMO_ALEX] = 1;
    first!.title = "changed";
    const [again] = await activities.list();
    expect(again!.title).toBe("Farmers market + picnic");
    expect(again!.ratings[DEMO_ALEX]).toBeUndefined();
  });

  it("adds an activity created by the acting partner, shared with the other", async () => {
    const today = toISODate(new Date());
    const created = await activities.add({ title: "  Pottery class  ", happenedOn: today, category: "creative", note: "  Messy!  " });
    expect(created).toMatchObject({ title: "Pottery class", note: "Messy!", createdBy: DEMO_ALEX, ratings: {}, photoPath: null, sourceIdeaId: null });
    actAs(DEMO_SAM);
    expect((await activities.list())[0]!.id).toBe(created.id);
  });

  it("validates title, date, category and note", async () => {
    const today = toISODate(new Date());
    await expect(activities.add({ title: "   ", happenedOn: today, category: "food" })).rejects.toBeInstanceOf(UserFacingError);
    await expect(activities.add({ title: "x".repeat(121), happenedOn: today, category: "food" })).rejects.toThrow(/120/);
    await expect(activities.add({ title: "Trip", happenedOn: toISODate(addDays(new Date(), 2)), category: "food" })).rejects.toThrow(/future/);
    await expect(activities.add({ title: "Trip", happenedOn: "2026-02-31", category: "food" })).rejects.toThrow(/date/);
    await expect(activities.add({ title: "Trip", happenedOn: today, category: "nightlife" as never })).rejects.toThrow(/category/);
    await expect(activities.add({ title: "Trip", happenedOn: today, category: "food", note: "n".repeat(2001) })).rejects.toThrow(/2000/);
    // Tomorrow is allowed (late-night logging across time zones).
    await expect(activities.add({ title: "Trip", happenedOn: toISODate(addDays(new Date(), 1)), category: "food" })).resolves.toBeTruthy();
  });

  it("each partner rates only for themselves, and can change their rating", async () => {
    const [latest] = await activities.list();
    await activities.rate(latest!.id, 5);
    await activities.rate(latest!.id, 3);
    const [after] = await activities.list();
    expect(after!.ratings).toEqual({ [DEMO_SAM]: 4, [DEMO_ALEX]: 3 });
  });

  it("rejects invalid ratings and unknown activities", async () => {
    const [latest] = await activities.list();
    for (const bad of [0, 6, 2.5, Number.NaN]) await expect(activities.rate(latest!.id, bad)).rejects.toBeInstanceOf(UserFacingError);
    await expect(activities.rate("nope", 4)).rejects.toThrow(/no longer/);
  });

  it("removes an activity for both partners", async () => {
    const [latest] = await activities.list();
    await activities.remove(latest!.id);
    actAs(DEMO_SAM);
    expect((await activities.list()).some((a) => a.id === latest!.id)).toBe(false);
  });

  it("requires a paired couple and a signed-in partner", async () => {
    demoStore.reset(true);
    actAs(DEMO_ALEX);
    await expect(activities.list()).rejects.toThrow(/Pair/);
    demoStore.update((s) => {
      s.signedIn = false;
    });
    await expect(activities.list()).rejects.toThrow(/demo partner/);
  });

  it("drops ratings from anyone outside the couple", async () => {
    demoStore.update((s) => {
      s.activities[0]!.ratings["intruder"] = 1;
    });
    const list = await activities.list();
    expect(list.every((a) => !("intruder" in a.ratings))).toBe(true);
  });
});

describe("demo ideas", () => {
  it("starts empty and generates exactly five labelled, non-repeating ideas", async () => {
    expect(await ideas.list()).toEqual([]);
    const batch = await ideas.generate();
    expect(batch.notice).toBe(DEMO_IDEAS_NOTICE);
    expect(batch.ideas).toHaveLength(5);
    expect(new Set(batch.ideas.map((i) => i.batchId)).size).toBe(1);
    const past = demoStore.get().activities.map((a) => a.title);
    for (const idea of batch.ideas) {
      expect(idea).toMatchObject({ source: "fallback", status: "new" });
      expect(isRepeat(idea.title, past)).toBe(false);
    }
    expect((await ideas.list()).map((i) => i.id).sort()).toEqual(batch.ideas.map((i) => i.id).sort());
  });

  it("never repeats earlier ideas in later batches", async () => {
    const first = await ideas.generate();
    const second = await ideas.generate();
    for (const idea of second.ideas) expect(isRepeat(idea.title, first.ideas.map((i) => i.title))).toBe(false);
  });

  it("shares ideas and status changes between partners", async () => {
    const { ideas: batch } = await ideas.generate();
    await ideas.setStatus(batch[0]!.id, "saved");
    await ideas.setStatus(batch[1]!.id, "dismissed");
    actAs(DEMO_SAM);
    const list = await ideas.list();
    expect(list.find((i) => i.id === batch[0]!.id)!.status).toBe("saved");
    expect(list.find((i) => i.id === batch[1]!.id)!.status).toBe("dismissed");
  });

  it("validates status and idea ids", async () => {
    const { ideas: batch } = await ideas.generate();
    await expect(ideas.setStatus(batch[0]!.id, "archived" as never)).rejects.toBeInstanceOf(UserFacingError);
    await expect(ideas.setStatus("missing", "saved")).rejects.toThrow(/no longer/);
  });

  it("applies the same daily limit as the live app", async () => {
    demoStore.update((s) => {
      for (let b = 0; b < MAX_BATCHES_PER_DAY; b++) {
        s.ideas.push({
          id: `old-${b}`,
          batchId: `batch-${b}`,
          title: `Old idea ${b}`,
          description: "x",
          category: "food",
          budget: "$",
          duration: "quick",
          timeOfDay: "any",
          weather: "indoor",
          why: null,
          source: "fallback",
          status: "new",
          createdAt: new Date().toISOString(),
        });
      }
    });
    await expect(ideas.generate()).rejects.toThrow(/tomorrow/);
  });

  it("marks an idea done after logging it", async () => {
    const { ideas: batch } = await ideas.generate();
    const idea = batch[0]!;
    const created = await activities.add({ title: idea.title, happenedOn: toISODate(new Date()), category: idea.category, sourceIdeaId: idea.id });
    expect(created.sourceIdeaId).toBe(idea.id);
    await ideas.setStatus(idea.id, "done");
    expect((await ideas.list()).find((i) => i.id === idea.id)!.status).toBe("done");
  });
});

describe("activity rules", () => {
  it("reports every problem by field for the form", () => {
    const problems = activityProblems({ title: "", happenedOn: "", category: "x" as never, note: null });
    expect(Object.keys(problems).sort()).toEqual(["category", "happenedOn", "title"]);
  });

  it("normalizes valid input", () => {
    expect(checkActivityInput({ title: " Hike ", happenedOn: "2026-10-01", category: "active", note: "  ", sourceIdeaId: "" }, new Date(2026, 9, 6))).toEqual({
      title: "Hike",
      happenedOn: "2026-10-01",
      category: "active",
      note: null,
      sourceIdeaId: null,
    });
  });
});
