/**
 * Demo backends for Module D must enforce the same privacy rules as the database:
 * partner pulse scores and check-in answers stay hidden until both submitted.
 */
import { checkins, checkinHistory } from "@/lib/backend/demo/checkins";
import { notes } from "@/lib/backend/demo/notes";
import { pulse } from "@/lib/backend/demo/pulse";
import { DEMO_ALEX, DEMO_SAM, demoStore } from "@/lib/backend/demo/store";
import { addDays, periodOf, previousPeriod, previousWeekStart, toISODate, weekStartOf } from "@/lib/domain/dates";
import type { CheckinAnswers } from "@shared/checkin-questions.ts";

const actAs = (userId: string) =>
  demoStore.update((s) => {
    s.signedIn = true;
    s.actingAs = userId;
  });

const today = new Date();
const thisWeek = weekStartOf(today);
const thisMonth = periodOf(today);

const answers = (overrides: Partial<CheckinAnswers>): CheckinAnswers => ({
  best: "",
  closest: "",
  distant: "",
  more_of: "",
  talk_about: "",
  ...overrides,
});

beforeEach(() => {
  demoStore.reset(false);
  actAs(DEMO_ALEX);
});

describe("demo pulse", () => {
  it("shows both partners' seeded weeks (both submitted those weeks)", async () => {
    const history = await pulse.history(8);
    expect(history.filter((p) => p.userId === DEMO_ALEX)).toHaveLength(6);
    expect(history.filter((p) => p.userId === DEMO_SAM)).toHaveLength(6);
    expect(history.every((p) => p.weekStart >= previousWeekStart(thisWeek, 7))).toBe(true);
  });

  it("hides the partner's score for a week until both submitted it", async () => {
    actAs(DEMO_SAM);
    await pulse.submit(thisWeek, 2, 3);
    actAs(DEMO_ALEX);
    expect(await pulse.status(thisWeek)).toEqual({ iSubmitted: false, partnerSubmitted: true });
    const before = await pulse.history(8);
    expect(before.some((p) => p.userId === DEMO_SAM && p.weekStart === thisWeek)).toBe(false);

    await pulse.submit(thisWeek, 4, 4);
    const after = await pulse.history(8);
    expect(after.find((p) => p.userId === DEMO_SAM && p.weekStart === thisWeek)).toMatchObject({ excitement: 2, connection: 3 });
    expect(await pulse.status(thisWeek)).toEqual({ iSubmitted: true, partnerSubmitted: true });
  });

  it("updates rather than duplicates a week's own entry", async () => {
    await pulse.submit(thisWeek, 3, 3);
    await pulse.submit(thisWeek, 5, 4);
    const mine = (await pulse.history(1)).filter((p) => p.userId === DEMO_ALEX);
    expect(mine).toEqual([{ updatedAt: expect.any(String), userId: DEMO_ALEX, weekStart: thisWeek, excitement: 5, connection: 4 }]);
  });

  it("validates scores and weeks", async () => {
    await expect(pulse.submit(thisWeek, 0, 3)).rejects.toThrow(/1 to 5/);
    await expect(pulse.submit(thisWeek, 3, 6)).rejects.toThrow(/1 to 5/);
    await expect(pulse.submit(thisWeek, 2.5, 3)).rejects.toThrow(/1 to 5/);
    await expect(pulse.submit(toISODate(addDays(new Date(thisWeek + "T00:00:00"), 1)), 3, 3)).rejects.toThrow(/Monday/);
    await expect(pulse.submit(toISODate(addDays(new Date(thisWeek + "T00:00:00"), 7)), 3, 3)).rejects.toThrow(/hasn't started/);
    await expect(pulse.status("not-a-date")).rejects.toThrow(/valid week/);
  });

  it("needs a couple", async () => {
    demoStore.reset(true);
    actAs(DEMO_ALEX);
    await expect(pulse.history(8)).rejects.toThrow(/Pair with your partner/);
  });
});

describe("demo monthly check-in", () => {
  it("keeps the partner's answers hidden until both submitted, then reveals with a labelled summary", async () => {
    actAs(DEMO_SAM);
    await checkins.submit(thisMonth, answers({ best: "Our secret picnic spot", more_of: "Dancing in the kitchen" }));

    actAs(DEMO_ALEX);
    const before = await checkins.get(thisMonth);
    expect(before).toMatchObject({ iSubmitted: false, partnerSubmitted: true, revealed: false, mine: null, partner: null, summary: null });
    expect(JSON.stringify(before)).not.toContain("picnic");

    const after = await checkins.submit(thisMonth, answers({ best: "The picnic spot by the river", more_of: "Long walks" }));
    expect(after.revealed).toBe(true);
    expect(after.partner?.best).toBe("Our secret picnic spot");
    expect(after.mine?.best).toBe("The picnic spot by the river");
    expect(after.summary?.source).toBe("fallback");
    expect(after.summary?.overlaps[0]).toContain("picnic spot");

    actAs(DEMO_SAM);
    const samView = await checkins.get(thisMonth);
    expect(samView.partner?.best).toBe("The picnic spot by the river");
    expect(samView.summary).toEqual(after.summary); // created once, shared
  });

  it("the submitter sees their own answers while waiting", async () => {
    const view = await checkins.submit(thisMonth, answers({ closest: "Sunday pancakes" }));
    expect(view).toMatchObject({ iSubmitted: true, partnerSubmitted: false, revealed: false, partner: null, summary: null });
    expect(view.mine?.closest).toBe("Sunday pancakes");
  });

  it("answers are final once submitted", async () => {
    await checkins.submit(thisMonth, answers({ best: "first" }));
    await expect(checkins.submit(thisMonth, answers({ best: "second" }))).rejects.toThrow("You already submitted this month.");
    expect((await checkins.get(thisMonth)).mine?.best).toBe("first");
  });

  it("validates answers and periods", async () => {
    await expect(checkins.submit(thisMonth, answers({}))).rejects.toThrow("Answer at least one question.");
    await expect(checkins.get("2026-13")).rejects.toThrow(/valid month/);
    const next = periodOf(new Date(today.getFullYear(), today.getMonth() + 1, 1));
    await expect(checkins.get(next)).rejects.toThrow(/hasn't started/);
  });

  it("shows last month's seeded check-in revealed with its summary", async () => {
    const view = await checkins.get(previousPeriod(thisMonth));
    expect(view.revealed).toBe(true);
    expect(view.mine?.best).toBe("The hot springs weekend.");
    expect(view.partner?.best).toBe("Hot springs, obviously.");
    expect(view.summary?.source).toBe("fallback");
  });

  it("reading an existing check-in does not write to the store", async () => {
    await checkins.get(previousPeriod(thisMonth));
    let writes = 0;
    const stop = demoStore.subscribe(() => writes++);
    await checkins.get(previousPeriod(thisMonth));
    stop();
    expect(writes).toBe(0);
  });

  it("lists check-in months newest first with each partner's own status", async () => {
    await checkins.submit(thisMonth, answers({ best: "x" }));
    const history = await checkinHistory();
    expect(history.map((h) => h.period)).toEqual([thisMonth, previousPeriod(thisMonth)]);
    expect(history[0]).toEqual({ period: thisMonth, iSubmitted: true, revealed: false });
    expect(history[1]).toEqual({ period: previousPeriod(thisMonth), iSubmitted: true, revealed: true });
  });
});

describe("demo appreciation notes", () => {
  it("lists the couple's notes newest first", async () => {
    const list = await notes.list();
    expect(list.map((n) => n.id)).toEqual(["seed-note-1", "seed-note-2"]);
  });

  it("sends trimmed one-liners and enforces 1 to 280 characters (emoji count once)", async () => {
    const sent = await notes.send("  You make mornings better.  ");
    expect(sent.body).toBe("You make mornings better.");
    expect((await notes.list())[0]!.id).toBe(sent.id);
    await expect(notes.send("   ")).rejects.toThrow(/few words/);
    await expect(notes.send("x".repeat(281))).rejects.toThrow(/280/);
    await expect(notes.send("❤️".repeat(140))).resolves.toBeTruthy(); // 280 code points
  });

  it("only the author can delete a note", async () => {
    await expect(notes.remove("seed-note-1")).rejects.toThrow(/only delete notes you wrote/); // Sam's note
    await notes.remove("seed-note-2"); // Alex's own
    expect((await notes.list()).map((n) => n.id)).toEqual(["seed-note-1"]);
  });
});
