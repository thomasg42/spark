/**
 * Sample couple for demo mode, dated relative to "today" so it always looks current.
 * Alex and Sam are fictional. No real personal data belongs here.
 */
import { addDays, periodOf, previousPeriod, previousWeekStart, toISODate, weekStartOf } from "@/lib/domain/dates";
import type { DemoState } from "./store";

export const DEMO_ALEX = "00000000-0000-4000-8000-00000000a1e7";
export const DEMO_SAM = "00000000-0000-4000-8000-0000000005a3";
const COUPLE = "00000000-0000-4000-8000-00000000c0c0";

const personas = [
  { id: DEMO_ALEX, name: "Alex", email: "alex@demo.spark" },
  { id: DEMO_SAM, name: "Sam", email: "sam@demo.spark" },
];

/** Two demo accounts, no profiles, no couple: walk through pairing from scratch. */
export function freshState(): DemoState {
  return {
    version: 4,
    signedIn: false,
    actingAs: DEMO_ALEX,
    personas,
    profiles: {},
    couple: null,
    story: [],
    answers: {},
    pulses: [],
    checkins: [],
    notes: [],
    activities: [],
    ideas: [],
    moments: [],
    buddyShares: {},
    buddyChats: {},
    datePlans: [],
    dateRules: [],
    lifeChanges: [],
    distanceFlags: [],
    projects: [],
    money: [],
  };
}

const iso = (d: Date) => d.toISOString();

export function buildSeed(today: Date): DemoState {
  const day = (n: number) => toISODate(addDays(today, n));
  const at = (n: number, hour = 19) => {
    const d = addDays(today, n);
    d.setHours(hour, 15, 0, 0);
    return iso(d);
  };
  const thisWeek = weekStartOf(today);
  const lastMonth = previousPeriod(periodOf(today));
  // An anniversary 12 days from now, two years ago, so the reminder card shows.
  const anniversary = addDays(today, 12);
  anniversary.setFullYear(anniversary.getFullYear() - 2);

  const pulsesFor = (userId: string, scores: Array<[number, number]>) =>
    scores.map(([excitement, connection], i) => ({
      userId,
      weekStart: previousWeekStart(thisWeek, scores.length - i),
      excitement,
      connection,
    }));

  return {
    version: 4,
    signedIn: true,
    actingAs: DEMO_ALEX,
    personas,
    profiles: {
      [DEMO_ALEX]: {
        userId: DEMO_ALEX,
        displayName: "Alex",
        nickname: "Al",
        birthday: "1994-05-17",
        birthTime: null,
        birthPlace: null,
        accentTheme: "rose",
        colorMode: "system",
        preferredCadence: "weekly",
        socialSharing: "milestones",
      },
      [DEMO_SAM]: {
        userId: DEMO_SAM,
        displayName: "Sam",
        nickname: null,
        birthday: "1993-11-02",
        birthTime: null,
        birthPlace: null,
        accentTheme: "ocean",
        colorMode: "system",
        preferredCadence: "monthly",
        socialSharing: "status_only",
      },
    },
    couple: {
      id: COUPLE,
      createdBy: DEMO_ALEX,
      city: "Bozeman, MT",
      togetherSince: toISODate(anniversary),
      cadenceReviewedAt: iso(addDays(today, -40)),
      inviteCode: null,
      inviteExpiresAt: null,
      memberIds: [DEMO_ALEX, DEMO_SAM],
    },
    story: [
      {
        id: "seed-story-1",
        kind: "how_we_met",
        title: "Trivia night, wrong team",
        happenedOn: toISODate(addDays(anniversary, -45)),
        body: "Sam sat at our table by mistake and knew every geography answer. We let Sam stay.",
        photoPath: "demo/inline/trivia.svg",
        remindYearly: false,
        authorId: DEMO_ALEX,
        createdAt: at(-60),
      },
      {
        id: "seed-story-2",
        kind: "first_date",
        title: "Tacos and a very long walk",
        happenedOn: toISODate(addDays(anniversary, -30)),
        body: "The taco place closed early, so we walked the whole Main Street twice.",
        photoPath: null,
        remindYearly: false,
        authorId: DEMO_SAM,
        createdAt: at(-59),
      },
      {
        id: "seed-story-3",
        kind: "together",
        title: "Made it official",
        happenedOn: toISODate(anniversary),
        body: "On the drive back from Big Sky. Alex asked at a red light.",
        photoPath: "demo/inline/sunset.svg",
        remindYearly: true,
        authorId: DEMO_ALEX,
        createdAt: at(-58),
      },
    ],
    answers: {
      [DEMO_ALEX]: [
        { questionId: "what_attracted_you", section: "beginnings", value: "How Sam laughed at their own jokes before the punchline.", skipped: false, updatedAt: at(-20) },
        { questionId: "how_we_met_mine", section: "beginnings", value: "Trivia night. I thought Sam was on the wrong team on purpose.", skipped: false, updatedAt: at(-20) },
        // Answer to unlock (Module H): Alex answered three of the four questions Sam shared on.
        // trust_hurts is left unanswered so the demo shows a locked hint waiting.
        { questionId: "love_language", section: "roots", value: ["touch", "time"], skipped: false, updatedAt: at(-5) },
        { questionId: "conflict_tendency", section: "attachment", value: "pursue", skipped: false, updatedAt: at(-5) },
        { questionId: "feel_close_when", section: "closeness_trust", value: "Cooking on a Sunday with nowhere to be.", skipped: false, updatedAt: at(-5) },
        { questionId: "dont_take_personally", section: "attachment", value: "When I go quiet I'm working out what to say, not keeping score.", skipped: false, updatedAt: at(-5) },
      ],
      [DEMO_SAM]: [
        { questionId: "what_attracted_you", section: "beginnings", value: "Alex was kind to the bartender when it got busy.", skipped: false, updatedAt: at(-19) },
        { questionId: "trust_level", section: "closeness_trust", value: 4, skipped: false, updatedAt: at(-19) },
        { questionId: "love_language", section: "roots", value: ["time", "words"], skipped: false, updatedAt: at(-6) },
        { questionId: "conflict_tendency", section: "attachment", value: "pull_away", skipped: false, updatedAt: at(-6) },
        { questionId: "dont_take_personally", section: "attachment", value: "It usually means I'm overwhelmed and sorting my thoughts. It doesn't mean I'm done with us.", skipped: false, updatedAt: at(-6) },
        { questionId: "feel_close_when", section: "closeness_trust", value: "When Alex puts the phone away and we just talk, no plans, no rush.", skipped: false, updatedAt: at(-6) },
        { questionId: "trust_hurts", section: "closeness_trust", value: "When plans with me get cancelled for work again and again, I start to feel like an afterthought.", skipped: false, updatedAt: at(-6) },
        { questionId: "leave_behind", section: "roots", value: "Private sample answer that Sam kept off the table.", skipped: false, updatedAt: at(-6) },
      ],
    },
    pulses: [
      ...pulsesFor(DEMO_ALEX, [[4, 4], [4, 5], [3, 4], [4, 4], [5, 5], [4, 4]]),
      ...pulsesFor(DEMO_SAM, [[4, 4], [3, 4], [3, 3], [4, 4], [4, 5], [5, 4]]),
    ],
    checkins: [
      {
        id: "seed-checkin-1",
        period: lastMonth,
        responses: {
          [DEMO_ALEX]: {
            best: "The hot springs weekend.",
            closest: "Cooking together on Sunday.",
            distant: "When work got busy midweek.",
            more_of: "Lazy Saturday mornings.",
            talk_about: "Planning a trip for spring.",
          },
          [DEMO_SAM]: {
            best: "Hot springs, obviously.",
            closest: "The long drive home talking about everything.",
            distant: "When our plans kept getting moved for work.",
            more_of: "Date nights that are just us, no phones.",
            talk_about: "Spring trip ideas!",
          },
        },
        summary: {
          overlaps: ["You both named the hot springs weekend as the best part of the month.", "You're both excited to plan a spring trip."],
          gaps: ["You both felt a little distant when work got busy. Sam would love more date nights that are just the two of you."],
          conversationStarter: "What would make a busy week feel more connected for each of you?",
          safetyFlag: false,
          source: "fallback",
        },
      },
    ],
    notes: [
      { id: "seed-note-1", authorId: DEMO_SAM, body: "Thank you for warming up the car this morning.", createdAt: at(-2, 8) },
      { id: "seed-note-2", authorId: DEMO_ALEX, body: "You made Tuesday so much better.", createdAt: at(-5, 21) },
    ],
    activities: [
      { id: "seed-act-1", title: "Hot springs day", happenedOn: day(-24), category: "outdoors", note: "Bring more snacks next time.", photoPath: null, createdBy: DEMO_SAM, sourceIdeaId: null, ratings: { [DEMO_ALEX]: 5, [DEMO_SAM]: 5 }, createdAt: at(-24) },
      { id: "seed-act-2", title: "Thai cooking night", happenedOn: day(-17), category: "food", note: null, photoPath: null, createdBy: DEMO_ALEX, sourceIdeaId: null, ratings: { [DEMO_ALEX]: 4, [DEMO_SAM]: 5 }, createdAt: at(-17) },
      { id: "seed-act-3", title: "Movie marathon", happenedOn: day(-10), category: "chill", note: null, photoPath: null, createdBy: DEMO_ALEX, sourceIdeaId: null, ratings: { [DEMO_ALEX]: 3, [DEMO_SAM]: 4 }, createdAt: at(-10) },
      { id: "seed-act-4", title: "Farmers market + picnic", happenedOn: day(-3), category: "food", note: "The peach lady remembered us.", photoPath: null, createdBy: DEMO_SAM, sourceIdeaId: null, ratings: { [DEMO_SAM]: 4 }, createdAt: at(-3) },
    ],
    ideas: [],
    moments: [
      { id: "seed-moment-1", authorId: DEMO_SAM, kind: "photo", caption: "This sunset was showing off for you", mediaPath: "demo/inline/sunset.svg", mediaMime: "image/svg+xml", linkUrl: null, createdAt: at(-1, 19), reactions: { [DEMO_ALEX]: "heart" } },
      { id: "seed-moment-2", authorId: DEMO_ALEX, kind: "link", caption: "This is literally us trying to parallel park", mediaPath: null, mediaMime: null, linkUrl: "https://example.com/parallel-parking-fails", createdAt: at(-2, 12), reactions: { [DEMO_SAM]: "laugh" } },
      { id: "seed-moment-3", authorId: DEMO_SAM, kind: "note", caption: "Saw a dog that looked exactly like your mom's dog. Same attitude.", mediaPath: null, mediaMime: null, linkUrl: null, createdAt: at(-4, 15), reactions: {} },
    ],
    // What Sam chose to let their Buddy pass on. "leave_behind" stays off the table, so it has no share.
    buddyShares: {
      [DEMO_SAM]: [
        { questionId: "love_language", level: "open", text: "Kind words and hearing it out loud; Quality time, just us", updatedAt: at(-6) },
        { questionId: "conflict_tendency", level: "open", text: "Pull away to think", updatedAt: at(-6) },
        { questionId: "dont_take_personally", level: "open", text: "It usually means I'm overwhelmed and sorting my thoughts. It doesn't mean I'm done with us.", updatedAt: at(-6) },
        { questionId: "feel_close_when", level: "hint", text: "Unhurried evenings with phones put away go a long way with them.", updatedAt: at(-6) },
        { questionId: "trust_hurts", level: "hint", text: "Plans that keep getting moved can make them feel like an afterthought. Protecting time together matters.", updatedAt: at(-6) },
      ],
      [DEMO_ALEX]: [],
    },
    buddyChats: {},
    datePlans: [],
    dateRules: [],
    lifeChanges: [],
    distanceFlags: [],
    projects: [
      { id: "seed-project-1", title: "Paint the baby's room (pick the right color first)", kind: "family", status: "active", rank: 1, targetDate: day(30), budgetCents: 25000, note: "Order three sample pots and test them on the wall in daylight.", createdBy: DEMO_SAM, createdAt: at(-14), updatedAt: at(-2) },
      { id: "seed-project-2", title: "Finish the garage", kind: "home", status: "active", rank: 2, targetDate: day(60), budgetCents: 120000, note: null, createdBy: DEMO_ALEX, createdAt: at(-13), updatedAt: at(-13) },
      { id: "seed-project-3", title: "Build up our income and essentials fund", kind: "money", status: "planned", rank: 3, targetDate: null, budgetCents: null, note: "Three months of essentials first.", createdBy: DEMO_ALEX, createdAt: at(-12), updatedAt: at(-12) },
      { id: "seed-project-4", title: "Remodel the living room", kind: "home", status: "planned", rank: 4, targetDate: null, budgetCents: 400000, note: null, createdBy: DEMO_SAM, createdAt: at(-11), updatedAt: at(-11) },
      { id: "seed-project-5", title: "Save up for a vacation", kind: "trip", status: "planned", rank: 5, targetDate: day(240), budgetCents: 300000, note: null, createdBy: DEMO_SAM, createdAt: at(-10), updatedAt: at(-10) },
    ],
    money: [
      { id: "seed-goal-joint-1", ownerId: DEMO_SAM, scope: "joint", title: "Vacation fund", savedCents: 82000, targetCents: 300000, targetDate: day(240), visibleToPartner: true, createdAt: at(-10), updatedAt: at(-1) },
      { id: "seed-goal-joint-2", ownerId: DEMO_ALEX, scope: "joint", title: "Essentials cushion", savedCents: 410000, targetCents: 900000, targetDate: null, visibleToPartner: true, createdAt: at(-12), updatedAt: at(-3) },
      { id: "seed-goal-alex-1", ownerId: DEMO_ALEX, scope: "mine", title: "My savings", savedCents: 265000, targetCents: null, targetDate: null, visibleToPartner: false, createdAt: at(-30), updatedAt: at(-4) },
      { id: "seed-goal-sam-1", ownerId: DEMO_SAM, scope: "mine", title: "New camera", savedCents: 34000, targetCents: 90000, targetDate: day(120), visibleToPartner: true, createdAt: at(-20), updatedAt: at(-5) },
      { id: "seed-goal-sam-2", ownerId: DEMO_SAM, scope: "mine", title: "Private sample goal Sam keeps to themself", savedCents: 50000, targetCents: null, targetDate: null, visibleToPartner: false, createdAt: at(-20), updatedAt: at(-5) },
    ],
  };
}
