/**
 * Spark Buddy pure logic (Thomas's 2026-10-06 request): the share levels, the
 * 20-question interview and answer interpretation, the go-between replies that
 * use ONLY the partner's opt-in shares, action validation, projects and money,
 * plus the astrology and numerology math.
 */
import { chartFor, chineseZodiac, couplePairing, lifePath, personalYear, reduceNumber, sunSign } from "@shared/astro.ts";
import {
  answerToText,
  buildBuddyPrompt,
  fallbackHint,
  fallbackReply,
  interpretAnswer,
  INTERVIEW_ORDER,
  nextInterviewQuestion,
  parseBuddyJson,
  parseDay,
  parseTime,
  sanitizeClientContext,
  sharedTextFor,
  STARTER_QUESTIONS,
  suggestDay,
  validateAction,
  type BuddyClientContext,
  type BuddyRequest,
  type PartnerShare,
} from "@shared/buddy.ts";
import { findQuestion } from "@shared/questionnaires.ts";

const q = (id: string) => findQuestion(id)!.question;

const TODAY = "2026-10-06"; // a Tuesday

const baseContext = (over: Partial<BuddyClientContext> = {}): BuddyClientContext => ({
  today: TODAY,
  me: { name: "Thomas", birthday: "1994-05-17" },
  partner: { name: "Amy", birthday: "1993-11-02" },
  city: "Bozeman, MT",
  togetherSince: "2023-06-01",
  myAnswers: [],
  checkins: [
    {
      period: "2026-09",
      mine: { best: "Hot springs", closest: "Cooking", distant: "Busy week", more_of: "Sleeping in", talk_about: "" },
      partner: { best: "Hot springs", closest: "The drive", distant: "When our plans kept getting moved for work.", more_of: "Date nights that are just us.", talk_about: "" },
      summary: null,
    },
  ],
  pulses: [
    { who: "partner", weekStart: "2026-09-21", excitement: 4, connection: 5 },
    { who: "partner", weekStart: "2026-09-28", excitement: 3, connection: 3 },
  ],
  activities: [{ title: "Movie night", happenedOn: "2026-09-10", category: "chill", myRating: 4, partnerRating: 5 }],
  plans: [],
  projects: [
    { id: "p1", title: "Paint the baby's room", kind: "family", status: "active", rank: 1, targetDate: "2026-11-05", budgetCents: 25000 },
    { id: "p2", title: "Finish the garage", kind: "home", status: "planned", rank: 2, targetDate: null, budgetCents: null },
  ],
  money: [
    { id: "g1", title: "Vacation fund", whose: "joint", savedCents: 82000, targetCents: 300000, targetDate: "2027-06-01" },
    { id: "g2", title: "My savings", whose: "mine", savedCents: 265000, targetCents: null, targetDate: null },
    { id: "g3", title: "New camera", whose: "partner", savedCents: 34000, targetCents: 90000, targetDate: null },
  ],
  ...over,
});

const SHARES: PartnerShare[] = [
  { questionId: "conflict_tendency", level: "open", text: "Pull away to think" },
  { questionId: "feel_close_when", level: "hint", text: "Unhurried evenings with phones put away go a long way with them." },
];

const request = (text: string, over: Partial<BuddyRequest> = {}): BuddyRequest => ({
  text,
  interviewQuestionId: null,
  context: baseContext(),
  partnerShares: SHARES,
  history: [],
  ...over,
});

describe("astrology and numerology", () => {
  it("finds Sun signs, including across New Year and at boundaries", () => {
    expect(sunSign("1994-05-17")!.sign.name).toBe("Taurus");
    expect(sunSign("1993-11-02")!.sign.name).toBe("Scorpio");
    expect(sunSign("1990-01-05")!.sign.name).toBe("Capricorn");
    expect(sunSign("1990-12-25")!.sign.name).toBe("Capricorn");
    expect(sunSign("1990-03-21")!.sign.name).toBe("Aries");
    expect(sunSign("1990-03-20")!.sign.name).toBe("Pisces");
    expect(sunSign("1990-03-20")!.cusp).toBe(true);
    expect(sunSign("1990-04-05")!.cusp).toBe(false);
    expect(sunSign("not a date")).toBeNull();
  });

  it("computes the Chinese zodiac and flags the Lunar New Year window", () => {
    expect(chineseZodiac("2020-06-01")!.animal).toBe("Rat");
    expect(chineseZodiac("1994-05-17")!.animal).toBe("Dog");
    expect(chineseZodiac("1994-01-10")!.animal).toBe("Rooster"); // before any Lunar New Year: previous year
    const window = chineseZodiac("1994-02-05")!;
    expect(window.uncertain).toBe(true);
    expect(window.alternate).toBe("Rooster");
  });

  it("computes Life Path and Personal Year, keeping master numbers", () => {
    // 1994-05-17: 5 + (1+7=8) + (1+9+9+4=23 -> 5) = 18 -> 9
    expect(lifePath("1994-05-17")).toBe(9);
    // 1993-11-02: 11 (master) + 2 + (22 master) = 35 -> 8
    expect(lifePath("1993-11-02")).toBe(8);
    expect(reduceNumber(29)).toBe(11);
    expect(reduceNumber(29, false)).toBe(2);
    expect(personalYear("1994-05-17", 2026)).toBe(reduceNumber(5 + 8 + 1, false));
  });

  it("gives every element pairing a strength, a watch-out and a way to keep it fresh", () => {
    const signs = ["1994-04-01", "1994-05-01", "1994-06-01", "1994-07-01"]; // Aries fire, Taurus earth, Gemini air, Cancer water
    const today = new Date("2026-10-06T12:00:00Z");
    for (const a of signs) {
      for (const b of signs) {
        const pairing = couplePairing(chartFor(a, today)!, chartFor(b, today)!);
        expect(pairing.elements.strength.length).toBeGreaterThan(10);
        expect(pairing.watchOuts[0]!.length).toBeGreaterThan(10);
        expect(pairing.keepItFresh.length).toBe(2);
      }
    }
  });
});

describe("the onboarding interview", () => {
  it("asks 20 starter questions first, then every other question once", () => {
    expect(STARTER_QUESTIONS).toHaveLength(20);
    for (const id of STARTER_QUESTIONS) expect(findQuestion(id)).toBeTruthy();
    expect(new Set(INTERVIEW_ORDER).size).toBe(INTERVIEW_ORDER.length);
    expect(nextInterviewQuestion(new Set())!.id).toBe("raised_by");
    expect(nextInterviewQuestion(new Set(INTERVIEW_ORDER))).toBeNull();
  });

  it("understands spoken answers like Thomas's examples", () => {
    expect(interpretAnswer(q("raised_by"), "I was raised in a single home, no house.")).toBe("single_parent");
    expect(interpretAnswer(q("raised_by"), "My mom and dad, both parents")).toBe("both_parents");
    expect(interpretAnswer(q("siblings"), "I have a brother and sister")).toBe("two");
    expect(interpretAnswer(q("siblings"), "I'm an only child")).toBe("none");
    expect(interpretAnswer(q("siblings"), "three brothers and two sisters")).toBe("three_plus");
    expect(interpretAnswer(q("wanted_more_time"), "Um, super outgoing, and I love the energy.")).toBe("super outgoing, and I love the energy.");
    expect(interpretAnswer(q("love_language"), "Quality time and hugs")).toEqual(["time", "touch"]);
    expect(interpretAnswer(q("family_close"), "pretty close")).toBe(4);
    expect(interpretAnswer(q("family_close"), "4")).toBe(4);
    expect(interpretAnswer(q("conflict_tendency"), "I usually go quiet")).toBe("shut_down");
    expect(interpretAnswer(q("contact_needs"), "banana")).toBeNull();
  });

  it("proposes the save in interview mode, and skips on request", () => {
    const saved = fallbackReply(request("I grew up in Billings", { interviewQuestionId: "hometown" }));
    expect(saved.actions).toEqual([{ type: "save_answer", questionId: "hometown", value: "I grew up in Billings" }]);
    const skipped = fallbackReply(request("skip", { interviewQuestionId: "leave_behind" }));
    expect(skipped.actions).toEqual([{ type: "skip_question", questionId: "leave_behind" }]);
    const unsure = fallbackReply(request("banana", { interviewQuestionId: "contact_needs" }));
    expect(unsure.actions).toEqual([]);
    expect(unsure.reply).toMatch(/Tap the option/);
    expect(fallbackReply(request("Let's fill out my onboarding")).startInterview).toBe(true);
    // A question asked mid-interview is chat, never saved as the answer.
    const aside = fallbackReply(request("What projects are we working on?", { interviewQuestionId: "hometown" }));
    expect(aside.actions.some((a) => a.type === "save_answer")).toBe(false);
    expect(aside.reply).toContain("Paint the baby's room");
  });
});

describe("share levels", () => {
  it("open shares the readable answer; hint shares only the approved words", () => {
    expect(sharedTextFor("open", q("love_language"), ["time", "words"], null)).toBe("Kind words and hearing it out loud; Quality time, just us");
    expect(sharedTextFor("hint", q("trust_hurts"), "a long private story", "  Protect time together.  ")).toBe("Protect time together.");
    expect(() => sharedTextFor("hint", q("trust_hurts"), "x", "")).toThrow();
    expect(() => sharedTextFor("hint", q("trust_hurts"), "x", "a".repeat(281))).toThrow();
  });

  it("drafts starting hints that never quote free text", () => {
    const secret = "my ex cheated on me in 2019 at a wedding";
    expect(fallbackHint("trust_hurts", secret)).not.toContain("cheated");
    expect(fallbackHint("trust_level", 2)).toMatch(/extra care/);
    expect(answerToText(q("trust_level"), 4)).toContain("4 of 5");
  });
});

describe("the go-between", () => {
  it("answers 'is it something I did?' only from shares and revealed check-ins, then offers a day", () => {
    const r = fallbackReply(request("I see my wife pulling away. Is this something I did?"));
    expect(r.reply).toContain(`felt distant "when our plans kept getting moved for work"`);
    expect(r.reply).toMatch(/dipped from 5 to 3/);
    expect(r.meta?.awaiting).toBe("plan_day");
    expect(r.crisis).toBe(false);
  });

  // Thomas, 2026-10-08: "I just asked a plain simple question, 'What's my partner up to?' It told
  // me everything I could do." Buddy answers the question, offers ONE thing, and asks.
  it("answers 'what's my partner up to?' like a friend: two things shared, a read, one offer, a question", () => {
    for (const ask of ["What's my partner up to?", "What’s Amy up to?", "how is amy doing", "What's going on with her?", "Catch me up"]) {
      const r = fallbackReply(request(ask));
      expect(r.reply, ask).toMatch(/^Looking at what Amy chose to share: In your last check-in, Amy said they felt distant/);
      expect(r.reply, ask).not.toMatch(/Here's what I can do|•/);
      expect(r.reply.trim(), ask).toMatch(/Want me to do that\?$/);
    }
    const r = fallbackReply(request("What's my partner up to?"));
    expect(r.reply).toContain("Sounds like Amy could use some time with just you.");
    expect(r.reply).toContain(`date night on the calendar for Friday at 7 and send Amy a note: "Thinking of you. Can I take you out Friday night, just us?"`);
    expect(r.actions).toEqual([
      { type: "plan_date", title: "Date night, just us", date: "2026-10-09", time: "19:00", note: null },
      { type: "send_note", body: "Thinking of you. Can I take you out Friday night, just us?" },
    ]);
    expect(r.followUp).toMatch(/look at your stars to see if it's a timing thing\? Or does this feel like something deeper\?/);
    expect(r.reply.split(/\s+/).length).toBeLessThan(85); // about 30 seconds out loud, even with the partner's own words in it
  });

  it("follows up the way Thomas described: the stars, or something deeper", () => {
    const stars = fallbackReply(request("let's look at the stars, maybe it's a timing thing"));
    expect(stars.reply).toMatch(/Taurus.*Scorpio/);
    expect(stars.reply).toMatch(/not a prediction/);
    const deeper = fallbackReply(request("I think it's something deeper"));
    expect(deeper.reply).toMatch(/real conversation/);
    expect(deeper.actions).toEqual([{ type: "open", to: "checkin" }]);
  });

  it("gives the rest of what the partner shared when asked 'what else?'", () => {
    const r = fallbackReply(request("What else did Amy share?"));
    expect(r.reply).toContain("Pull away to think");
    expect(r.reply).not.toContain("felt distant"); // already said in the first answer
  });

  it("offers just a note when a date is already on the calendar", () => {
    const r = fallbackReply(request("What's Amy up to?", { context: baseContext({ plans: [{ title: "Dinner at Blackbird", plannedFor: "2026-10-10", time: "19:00" }] }) }));
    expect(r.reply).toContain(`You already have "Dinner at Blackbird" on Saturday, Oct 10.`);
    expect(r.actions).toEqual([{ type: "send_note", body: "Can't wait for dinner at blackbird on Saturday." }]);
  });

  it("answers 'what can you do?' in a sentence and asks back instead of dumping a menu for anything else", () => {
    const help = fallbackReply(request("What can you do?"));
    expect(help.reply).toMatch(/^I can catch you up on what Amy chose to share/);
    expect(help.reply).not.toContain("•");
    const unknown = fallbackReply(request("purple monkey dishwasher"));
    expect(unknown.reply).toBe("Tell me a bit more. Is this about Amy, something to plan for the two of you, or just something on your mind?");
  });

  it("picks a day itself when asked 'what should we do?', and books a named day", () => {
    const first = fallbackReply(request("I see Amy pulling away. Is it something I did?"));
    const history = [{ role: "user" as const, text: "...", at: "", meta: null }, { role: "buddy" as const, text: first.reply, at: "", meta: first.meta }];
    const picked = fallbackReply(request("Okay, what should we do?", { history }));
    expect(picked.actions[0]).toMatchObject({ type: "plan_date", date: "2026-10-09", time: "19:00" }); // the coming Friday
    const named = fallbackReply(request("Saturday at 6pm", { history }));
    expect(named.actions[0]).toMatchObject({ type: "plan_date", date: "2026-10-10", time: "18:00" });
  });

  it("says plainly when the partner hasn't shared anything", () => {
    const r = fallbackReply(request("is something off with us? she seems distant", { partnerShares: [], context: baseContext({ checkins: [] }) }));
    expect(r.reply).toMatch(/Amy hasn't shared anything with their Buddy yet, but from your check-ins: Amy's connection score dipped/);
    const nothing = fallbackReply(request("What's Amy up to?", { partnerShares: [], context: baseContext({ checkins: [], pulses: [] }) }));
    expect(nothing.reply).toMatch(/hasn't shared anything with their Buddy yet, and there's no check-in to go on/);
  });

  it("shows crisis resources first and proposes nothing", () => {
    const r = fallbackReply(request("I'm afraid of my partner, he hits me"));
    expect(r.crisis).toBe(true);
    expect(r.reply).toContain("988");
    expect(r.actions).toEqual([]);
  });

  it("lists projects in priority order and reads savings progress", () => {
    const projects = fallbackReply(request("What projects are we working on?"));
    expect(projects.reply.indexOf("Paint the baby's room")).toBeLessThan(projects.reply.indexOf("Finish the garage"));
    const money = fallbackReply(request("How are our savings doing?"));
    expect(money.reply).toContain("Vacation fund (joint): $820 of $3,000 (27%)");
    expect(money.reply).toContain("New camera (Amy's, shared with you)");
    const add = fallbackReply(request("Add $200 to the vacation fund"));
    expect(add.actions).toEqual([{ type: "log_savings", goalId: "g1", goalTitle: "Vacation fund", cents: 20000 }]);
    const newProject = fallbackReply(request("Add a project: remodel the living room"));
    expect(newProject.actions).toEqual([{ type: "add_project", title: "Remodel the living room", kind: "home" }]);
  });

  it("reads the couple's chart as a lens", () => {
    const r = fallbackReply(request("What do our zodiac signs say?"));
    expect(r.reply).toContain("Taurus");
    expect(r.reply).toContain("Scorpio");
    expect(r.reply).toMatch(/not a prediction/);
  });
});

describe("actions are validated before anyone can confirm them", () => {
  it("rejects unknown questions, invalid values, past dates and other people's goals", () => {
    const goals = baseContext().money;
    expect(validateAction({ type: "save_answer", questionId: "nope", value: "x" }, TODAY)).toBeNull();
    expect(validateAction({ type: "save_answer", questionId: "raised_by", value: "aliens" }, TODAY)).toBeNull();
    expect(validateAction({ type: "plan_date", title: "Date", date: "2026-10-01", time: null, note: null }, TODAY)).toBeNull();
    expect(validateAction({ type: "plan_date", title: "Date", date: "2026-02-30", time: null, note: null }, TODAY)).toBeNull();
    expect(validateAction({ type: "send_note", body: "x".repeat(281) }, TODAY)).toBeNull();
    expect(validateAction({ type: "log_savings", goalId: "g3", cents: 100 }, TODAY, goals)).toBeNull(); // the partner's goal
    expect(validateAction({ type: "log_savings", goalId: "g2", cents: 100 }, TODAY, goals)).toMatchObject({ goalTitle: "My savings" });
    expect(validateAction({ type: "open", to: "https://evil.example" }, TODAY)).toBeNull();
  });

  it("parses days and times", () => {
    expect(parseDay("tomorrow", TODAY)).toBe("2026-10-07");
    expect(parseDay("friday", TODAY)).toBe("2026-10-09");
    expect(parseDay("tuesday", TODAY)).toBe("2026-10-13");
    expect(parseDay("oct 31", TODAY)).toBe("2026-10-31");
    expect(parseDay("1/15", TODAY)).toBe("2027-01-15");
    expect(parseDay("whenever", TODAY)).toBeNull();
    expect(parseTime("7pm")).toBe("19:00");
    expect(parseTime("at 7:30")).toBe("19:30");
    expect(parseTime("10 am")).toBe("10:00");
    expect(suggestDay(baseContext({ plans: [{ title: "x", plannedFor: "2026-10-09", time: null }] }))).toBe("2026-10-10");
  });
});

describe("Claude prompt and parsing (live mode)", () => {
  it("only puts the partner's opt-in shares in the prompt, never anything else", () => {
    const { system, user } = buildBuddyPrompt(request("Is it something I did?"));
    expect(user).toContain("Unhurried evenings");
    expect(user).toContain("Pull away to think");
    expect(system).toMatch(/know ONLY/);
    // The demo seed's off-the-table answer for Sam is never an input, so it cannot appear.
    expect(user).not.toContain("Private sample answer");
  });

  it("keeps only valid actions, and only the current question in interview mode", () => {
    const req = request("I grew up with my grandma", { interviewQuestionId: "raised_by" });
    const parsed = parseBuddyJson(
      {
        reply: "Got it.",
        start_interview: false,
        actions: [
          { type: "save_answer", question_id: "raised_by", text: "", choices: ["family"], scale: 0, level: "", title: "", date: "", time: "", field: "", to: "", kind: "", goal_id: "", cents: 0 },
          { type: "save_answer", question_id: "hometown", text: "Sneaky", choices: [], scale: 0, level: "", title: "", date: "", time: "", field: "", to: "", kind: "", goal_id: "", cents: 0 },
          { type: "log_savings", question_id: "", text: "", choices: [], scale: 0, level: "", title: "", date: "", time: "", field: "", to: "", kind: "", goal_id: "g3", cents: 500 },
          { type: "plan_date", question_id: "", text: "", choices: [], scale: 0, level: "", title: "Dinner", date: "2026-10-09", time: "19:00", field: "", to: "", kind: "", goal_id: "", cents: 0 },
        ],
      },
      req,
    )!;
    expect(parsed.source).toBe("claude");
    expect(parsed.actions).toEqual([
      { type: "save_answer", questionId: "raised_by", value: "family" },
      { type: "plan_date", title: "Dinner", date: "2026-10-09", time: "19:00", note: null },
    ]);
    expect(parseBuddyJson({ reply: "", actions: [] }, req)).toBeNull();
  });

  it("sanitizes whatever the browser sends as context", () => {
    const clean = sanitizeClientContext({
      today: "garbage",
      me: { name: "x".repeat(500), birthday: "1990-13-45x" },
      myAnswers: [{ questionId: "raised_by", value: "aliens" }, { questionId: "hometown", value: "Bozeman" }, { questionId: "nope", value: 1 }],
      pulses: [{ who: "stranger", excitement: 9, connection: 1 }],
      money: [{ id: "g", title: "X", whose: "boss", savedCents: 5 }],
    });
    expect(clean.me.name).toHaveLength(60);
    expect(clean.me.birthday).toBeNull();
    expect(clean.myAnswers).toEqual([{ questionId: "hometown", value: "Bozeman" }]);
    expect(clean.pulses).toEqual([]);
    expect(clean.money).toEqual([]);
    expect(clean.partner).toBeNull();
  });
});
