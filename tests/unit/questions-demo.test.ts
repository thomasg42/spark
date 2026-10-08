/**
 * Demo backend for private answers must enforce the same rule as the database:
 * only the author ever sees their answers. Alex's answers are never visible to Sam.
 */
import { answers } from "@/lib/backend/demo/answers";
import { DEMO_ALEX, DEMO_SAM, demoStore } from "@/lib/backend/demo/store";
import { UserFacingError } from "@/lib/backend/types";

const actAs = (userId: string) =>
  demoStore.update((s) => {
    s.signedIn = true;
    s.actingAs = userId;
  });

beforeEach(() => {
  demoStore.reset(false);
});

describe("demo private answers", () => {
  it("acting as Sam, never returns any of Alex's seeded answers", async () => {
    const alexSeed = demoStore.get().answers[DEMO_ALEX] ?? [];
    expect(alexSeed.length).toBeGreaterThan(0);
    actAs(DEMO_SAM);
    const all = await answers.list();
    const beginnings = await answers.list("beginnings");
    expect(all.map((a) => a.questionId).sort()).toEqual(["conflict_tendency", "dont_take_personally", "feel_close_when", "leave_behind", "love_language", "trust_hurts", "trust_level", "what_attracted_you"]);
    const seen = JSON.stringify([all, beginnings]);
    for (const a of alexSeed) expect(seen).not.toContain(String(a.value));
    expect(seen).not.toContain("Trivia night");
  });

  it("acting as Alex, returns only Alex's answers", async () => {
    actAs(DEMO_ALEX);
    const all = await answers.list();
    expect(all.map((a) => a.questionId).sort()).toEqual(["conflict_tendency", "dont_take_personally", "feel_close_when", "how_we_met_mine", "love_language", "what_attracted_you"]);
    expect(JSON.stringify(all)).not.toContain("kind to the bartender");
  });

  it("a new answer from Alex stays invisible to Sam", async () => {
    actAs(DEMO_ALEX);
    await answers.save("trust_one_thing", "When plans change and I hear about it last.");
    actAs(DEMO_SAM);
    const samView = await answers.list();
    expect(samView.find((a) => a.questionId === "trust_one_thing")).toBeUndefined();
    expect(JSON.stringify(samView)).not.toContain("hear about it last");
    actAs(DEMO_ALEX);
    expect((await answers.list()).find((a) => a.questionId === "trust_one_thing")?.value).toBe("When plans change and I hear about it last.");
  });

  it("Sam clearing or skipping a question never touches Alex's answer to the same question", async () => {
    actAs(DEMO_SAM);
    await answers.clear("what_attracted_you");
    await answers.skip("how_we_met_mine");
    expect((await answers.list()).find((a) => a.questionId === "what_attracted_you")).toBeUndefined();
    actAs(DEMO_ALEX);
    const alexView = await answers.list();
    expect(alexView.find((a) => a.questionId === "what_attracted_you")?.value).toBe("How Sam laughed at their own jokes before the punchline.");
    expect(alexView.find((a) => a.questionId === "how_we_met_mine")?.skipped).toBe(false);
  });

  it("validates exactly like the server", async () => {
    actAs(DEMO_SAM);
    await expect(answers.save("not_a_question", "x")).rejects.toBeInstanceOf(UserFacingError);
    await expect(answers.skip("not_a_question")).rejects.toBeInstanceOf(UserFacingError);
    await expect(answers.save("met_through", "space")).rejects.toThrow("Pick one of the options.");
    await expect(answers.save("trust_level", 9)).rejects.toThrow("Pick 1 to 5.");
    await expect(answers.save("what_attracted_you", "   ")).rejects.toThrow(/empty/i);
    await expect(answers.list("intimacy")).rejects.toBeInstanceOf(UserFacingError);
    const saved = await answers.save("trust_helps", ["honesty", "honesty", "plans_shared"]);
    expect(saved).toMatchObject({ section: "closeness_trust", value: ["honesty", "plans_shared"], skipped: false });
    const trimmed = await answers.save("ready_signal", "  A silly text.  ");
    expect(trimmed.value).toBe("A silly text.");
  });

  it("skip then save flips the skipped flag and stores no value while skipped", async () => {
    actAs(DEMO_SAM);
    const skipped = await answers.skip("comfortable_getting_close");
    expect(skipped).toMatchObject({ section: "beginnings", value: null, skipped: true });
    const saved = await answers.save("comfortable_getting_close", "Taking it slow.");
    expect(saved.skipped).toBe(false);
    const list = (await answers.list("beginnings")).filter((a) => a.questionId === "comfortable_getting_close");
    expect(list).toHaveLength(1);
  });

  it("returns copies, so changing a result never changes the stored answer", async () => {
    actAs(DEMO_SAM);
    const saved = await answers.save("trust_helps", ["honesty"]);
    (saved.value as string[]).push("introductions");
    const listed = await answers.list("closeness_trust");
    expect(listed.find((a) => a.questionId === "trust_helps")?.value).toEqual(["honesty"]);
  });

  it("refuses to work for a signed-out visitor", async () => {
    demoStore.update((s) => {
      s.signedIn = false;
    });
    await expect(answers.list()).rejects.toBeInstanceOf(UserFacingError);
    await expect(answers.save("trust_level", 3)).rejects.toBeInstanceOf(UserFacingError);
  });

  it("works from a fresh demo with no answers yet", async () => {
    demoStore.reset(true);
    const first = demoStore.get().personas[0]!.id;
    actAs(first);
    expect(await answers.list()).toEqual([]);
    await answers.save("trust_level", 4);
    expect(await answers.list()).toHaveLength(1);
  });
});
