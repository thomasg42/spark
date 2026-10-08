/**
 * The public demo, end to end: Thomas's "I see my partner pulling away, is it
 * something I did?" scenario between the two demo personas, with the same
 * privacy rules as the database (Sam's off-the-table answer and private savings
 * goal never reach Alex or Alex's Buddy), plus projects, money and the calendar.
 */
import { createDemoBackend } from "@/lib/backend/demo";
import { DEMO_ALEX, DEMO_SAM, demoStore } from "@/lib/backend/demo/store";
import { buildBuddyContext } from "@/lib/buddy/context";
import { runAction } from "@/lib/buddy/actions";

const backend = createDemoBackend();
const actAs = (id: string) => backend.demo!.actAs(id);

async function contextFor(userId: string) {
  const s = demoStore.get();
  const partnerId = userId === DEMO_ALEX ? DEMO_SAM : DEMO_ALEX;
  return buildBuddyContext(backend, { userId, profile: s.profiles[userId]!, partner: s.profiles[partnerId]!, couple: s.couple });
}

beforeEach(() => {
  demoStore.reset(false);
  actAs(DEMO_ALEX);
});

describe("Spark Buddy in the demo", () => {
  it("answers from Sam's shares and revealed check-in, never Sam's off-the-table answer", async () => {
    const context = await contextFor(DEMO_ALEX);
    const { reply, notice } = await backend.buddy.send({ text: "I see Sam pulling away. Is this something I did?", interviewQuestionId: null, context, aiConsent: false });
    expect(notice).toMatch(/Demo mode/);
    expect(reply.reply).toContain(`felt distant "when our plans kept getting moved for work"`);
    expect(reply.actions.map((a) => a.type)).toEqual(["plan_date", "send_note"]);
    expect(reply.reply).not.toContain("Private sample answer");
    // The rest of Sam's shares, on request: the approved hint only, never the raw answer.
    const more = (await backend.buddy.send({ text: "What else did Sam share?", interviewQuestionId: null, context, aiConsent: false })).reply.reply;
    expect(more).toContain("Pull away to think");
    expect(more).toContain("Plans that keep getting moved");
    expect(more).not.toContain("I start to feel like an afterthought");
    expect(reply.reply).not.toContain("I start to feel like an afterthought"); // Sam's raw trust_hurts answer stays private; only the approved hint is used
    expect(JSON.stringify(context)).not.toContain("Private sample");
    expect(reply.reply.length).toBeLessThan(1500); // nothing cut off
  });

  it("books the date night Buddy suggests onto the calendar Sam sees", async () => {
    const context = await contextFor(DEMO_ALEX);
    await backend.buddy.send({ text: "Is it something I did? Sam seems distant", interviewQuestionId: null, context, aiConsent: false });
    const { reply } = await backend.buddy.send({ text: "Okay, what day can we do that?", interviewQuestionId: null, context, aiConsent: false });
    const plan = reply.actions.find((a) => a.type === "plan_date");
    expect(plan).toBeTruthy();
    await runAction(backend, plan!, "Sam");
    actAs(DEMO_SAM);
    expect((await backend.datePlans.list()).map((p) => p.title)).toEqual(["Date night, just us"]);
    // Sam can see it but can't remove Alex's plan.
    await expect(backend.datePlans.remove((await backend.datePlans.list())[0]!.id)).rejects.toThrow(/Only the person/);
  });

  it("fills in the interview from what you say, and keeps each chat private", async () => {
    const context = await contextFor(DEMO_ALEX);
    const { reply } = await backend.buddy.send({ text: "I have a brother and sister", interviewQuestionId: "siblings", context, aiConsent: false });
    expect(reply.actions).toEqual([{ type: "save_answer", questionId: "siblings", value: "two" }]);
    await runAction(backend, reply.actions[0]!, "Sam");
    expect((await backend.answers.list()).find((a) => a.questionId === "siblings")?.value).toBe("two");
    actAs(DEMO_SAM);
    expect(await backend.buddy.history()).toEqual([]);
  });

  it("shares only what the author allows, and clearing an answer stops sharing it", async () => {
    await backend.answers.save("hometown", "Billings");
    await expect(backend.buddy.share("five_years", "open")).rejects.toThrow(/Answer this question first/);
    await backend.buddy.share("hometown", "open");
    expect((await backend.buddy.shares()).map((s) => s.questionId)).toEqual(["hometown"]);
    await backend.answers.clear("hometown");
    expect(await backend.buddy.shares()).toEqual([]);
    const hint = await backend.buddy.draftHint("how_we_met_mine");
    expect(hint.source).toBe("fallback");
    expect(hint.hint).not.toContain("Trivia night");
  });
});

describe("projects and money in the demo", () => {
  it("starts with Thomas's ranked projects and reorders them", async () => {
    const list = await backend.projects.list();
    expect(list.map((p) => p.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(list[0]!.title).toMatch(/baby's room/);
    expect(list[1]!.title).toBe("Finish the garage");
    const moved = await backend.projects.move(list[4]!.id, "up");
    expect(moved[3]!.title).toBe("Save up for a vacation");
    await expect(backend.projects.add({ title: "  ", kind: "home" })).rejects.toThrow();
  });

  it("keeps personal goals private unless shared, and read-only for the partner", async () => {
    const alexView = await backend.money.list();
    expect(alexView.map((g) => g.title)).not.toContain("Private sample goal Sam keeps to themself");
    const camera = alexView.find((g) => g.title === "New camera")!;
    await expect(backend.money.addSaved(camera.id, 100)).rejects.toThrow(/Only its owner/);
    const vacation = alexView.find((g) => g.title === "Vacation fund")!;
    expect((await backend.money.addSaved(vacation.id, 20000)).savedCents).toBe(102000);
    await expect(backend.money.addSaved(vacation.id, -999999999)).rejects.toThrow(/more than this goal/);
    const context = await contextFor(DEMO_ALEX);
    expect(context.money.find((g) => g.title === "New camera")?.whose).toBe("partner");
    expect(JSON.stringify(context.money)).not.toContain("Private sample goal");
  });
});
