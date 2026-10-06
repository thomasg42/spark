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
    version: 3,
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
    version: 3,
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
      ],
      [DEMO_SAM]: [
        { questionId: "what_attracted_you", section: "beginnings", value: "Alex was kind to the bartender when it got busy.", skipped: false, updatedAt: at(-19) },
        { questionId: "trust_level", section: "closeness_trust", value: 4, skipped: false, updatedAt: at(-19) },
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
            distant: "Not really.",
            more_of: "Trying new restaurants.",
            talk_about: "Spring trip ideas!",
          },
        },
        summary: {
          overlaps: ["You both named the hot springs weekend as the best part of the month.", "You're both excited to plan a spring trip."],
          gaps: ["Alex felt a bit distant during a busy work week; Sam didn't notice it. Worth a gentle check-in."],
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
  };
}
