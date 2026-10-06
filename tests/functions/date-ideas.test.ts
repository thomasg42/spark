/**
 * Date idea generator: pure logic (schema, repeats, parsing, fallback, finalize)
 * and the Edge Function handler with an in-memory repo and a fake Claude.
 */
import type { UserContext } from "@shared/http.ts";
import { HttpError } from "@shared/http.ts";
import type { JsonGenerator, JsonRequest, JsonResult } from "@shared/llm.ts";
import {
  buildIdeaInput,
  buildIdeasPrompt,
  CANDIDATES_REQUESTED,
  FALLBACK_IDEAS,
  fallbackIdeas,
  finalizeIdeas,
  IDEA_CATEGORIES,
  IDEAS_SCHEMA,
  isRepeat,
  normalizeTitle,
  parseIdeas,
  type IdeaCandidate,
  type IdeaInput,
} from "@shared/date-ideas.ts";
import {
  createDateIdeasHandler,
  NOTICES,
  RATE_LIMIT_MESSAGE,
  type DateIdeasRepo,
  type GenerateResponse,
  type IdeaRow,
  type NewIdeaRow,
} from "@shared/date-ideas-handler.ts";

const baseInput = (over: Partial<IdeaInput> = {}): IdeaInput => ({
  city: "Bozeman, MT",
  month: 10,
  topActivities: [{ title: "Hot springs day", category: "outdoors", avgRating: 5 }],
  recentCategories: ["food", "chill"],
  pastTitles: ["Hot springs day", "Thai cooking night", "Movie marathon", "Farmers market + picnic"],
  existingIdeaTitles: [],
  ...over,
});

const candidate = (title: string, over: Partial<IdeaCandidate> = {}): IdeaCandidate => ({
  title,
  description: `Do ${title.toLowerCase()} together.`,
  category: "creative",
  budget: "$",
  duration: "evening",
  timeOfDay: "evening",
  weather: "indoor",
  why: "Fits your vibe.",
  ...over,
});

const raw = (title: string, over: Record<string, unknown> = {}) => ({
  title,
  description: `Do ${title.toLowerCase()} together.`,
  category: "social",
  budget: "$$",
  duration: "evening",
  time_of_day: "evening",
  weather: "indoor",
  why: "You both love a good night out.",
  ...over,
});

function walkObjects(node: unknown, visit: (obj: Record<string, unknown>) => void) {
  if (!node || typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  if (obj.type === "object") visit(obj);
  for (const value of Object.values(obj)) walkObjects(value, visit);
}

describe("IDEAS_SCHEMA", () => {
  it("is a strict object schema: every object closed and every field required", () => {
    let objects = 0;
    walkObjects(IDEAS_SCHEMA, (obj) => {
      objects++;
      expect(obj.additionalProperties).toBe(false);
      const props = Object.keys(obj.properties as Record<string, unknown>);
      expect([...(obj.required as string[])].sort()).toEqual(props.sort());
    });
    expect(objects).toBe(2);
  });

  it("uses the exact tag enums the database accepts", () => {
    const item = IDEAS_SCHEMA.properties.ideas.items.properties;
    expect(item.category.enum).toEqual([...IDEA_CATEGORIES]);
    expect(item.budget.enum).toEqual(["free", "$", "$$", "$$$"]);
    expect(item.duration.enum).toEqual(["quick", "evening", "half_day", "full_day"]);
    expect(item.time_of_day.enum).toEqual(["morning", "afternoon", "evening", "any"]);
    expect(item.weather.enum).toEqual(["indoor", "outdoor", "either"]);
  });

  it("avoids keywords structured outputs does not support", () => {
    const text = JSON.stringify(IDEAS_SCHEMA);
    for (const keyword of ["minItems", "maxItems", "maxLength", "minLength", "minimum", "maximum"]) expect(text).not.toContain(keyword);
  });
});

describe("repeat detection", () => {
  it("normalizes case, accents, punctuation and spacing", () => {
    expect(normalizeTitle("  Café  Crawl!! ")).toBe("cafe crawl");
    expect(normalizeTitle("Farmers market + picnic")).toBe("farmers market picnic");
    expect(normalizeTitle("Sushi & Sake")).toBe("sushi and sake");
    expect(normalizeTitle("温泉の日")).not.toBe("");
  });

  it("flags exact and near-exact repeats", () => {
    expect(isRepeat("HOT SPRINGS DAY!", ["Hot springs day"])).toBe(true);
    expect(isRepeat("Hot springs soak", ["Hot springs day"])).toBe(true);
    expect(isRepeat("A movie marathon night", ["Movie marathon"])).toBe(true);
    expect(isRepeat("Farmers market and a picnic", ["Farmers market + picnic"])).toBe(true);
    expect(isRepeat("Bowling", ["Bowling"])).toBe(true);
    expect(isRepeat("Cosmic bowling", ["Bowling"])).toBe(true);
  });

  it("lets genuinely new ideas through, even in the same vibe", () => {
    expect(isRepeat("Italian cooking class", ["Thai cooking night"])).toBe(false);
    expect(isRepeat("Outdoor movie in the park", ["Movie marathon"])).toBe(false);
    expect(isRepeat("Golden-hour picnic in a new park", ["Farmers market + picnic"])).toBe(false);
    expect(isRepeat("Pottery wheel class", [])).toBe(false);
    expect(isRepeat("", ["Anything"])).toBe(false);
  });
});

describe("parseIdeas", () => {
  it("maps snake_case output to candidates", () => {
    const [idea] = parseIdeas({ ideas: [raw("Jazz brunch")] });
    expect(idea).toEqual({
      title: "Jazz brunch",
      description: "Do jazz brunch together.",
      category: "social",
      budget: "$$",
      duration: "evening",
      timeOfDay: "evening",
      weather: "indoor",
      why: "You both love a good night out.",
    });
  });

  it("drops invalid items instead of failing the whole batch", () => {
    const parsed = parseIdeas({
      ideas: [
        raw("Valid one"),
        raw("Bad category", { category: "nightlife" }),
        raw("Bad budget", { budget: "$$$$" }),
        raw("", {}),
        { title: 42 },
        null,
        "a string",
        raw("Missing time", { time_of_day: undefined }),
        raw("Valid two", { why: 7 }),
      ],
    });
    expect(parsed.map((p) => p.title)).toEqual(["Valid one", "Valid two"]);
    expect(parsed[1]!.why).toBeNull();
  });

  it("returns nothing for junk", () => {
    for (const junk of [null, undefined, 3, "ideas", [], {}, { ideas: "nope" }, { ideas: [1, 2] }]) expect(parseIdeas(junk)).toEqual([]);
  });

  it("clamps lengths to the database limits and removes em dashes", () => {
    const [idea] = parseIdeas({
      ideas: [raw("T".repeat(300), { description: "D".repeat(900), why: `Cozy — and ${"W".repeat(400)}` })],
    });
    expect(Array.from(idea!.title)).toHaveLength(120);
    expect(Array.from(idea!.description)).toHaveLength(600);
    expect(Array.from(idea!.why!).length).toBeLessThanOrEqual(300);
    expect(idea!.why).not.toContain("—");
  });

  it("counts characters like Postgres (emoji are one character)", () => {
    const [idea] = parseIdeas({ ideas: [raw("🌮".repeat(130))] });
    expect(Array.from(idea!.title)).toHaveLength(120);
  });
});

describe("buildIdeaInput", () => {
  const activities = [
    { title: "Farmers market + picnic", category: "food", happenedOn: "2026-10-03", ratings: [4] },
    { title: "Movie marathon", category: "chill", happenedOn: "2026-09-26", ratings: [3, 4] },
    { title: "Thai cooking night", category: "food", happenedOn: "2026-09-19", ratings: [4, 5] },
    { title: "Hot springs day", category: "outdoors", happenedOn: "2026-09-12", ratings: [5, 5] },
    { title: "Unrated hike", category: "active", happenedOn: "2026-08-01", ratings: [] },
  ];

  it("keeps favorites rated 4+ best first, recent categories, and every title", () => {
    const input = buildIdeaInput({ city: " Bozeman, MT ", month: 10, today: "2026-10-06", activities, ideaTitles: ["Old idea", "old idea!"] });
    expect(input.city).toBe("Bozeman, MT");
    expect(input.topActivities).toEqual([
      { title: "Hot springs day", category: "outdoors", avgRating: 5 },
      { title: "Thai cooking night", category: "food", avgRating: 4.5 },
      { title: "Farmers market + picnic", category: "food", avgRating: 4 },
    ]);
    // 21 days back from Oct 6 is Sep 15: Sep 19, Sep 26 and Oct 3 count.
    expect(input.recentCategories).toEqual(["food", "chill"]);
    expect(input.pastTitles).toHaveLength(5);
    expect(input.existingIdeaTitles).toEqual(["Old idea"]);
  });

  it("caps favorites at eight and never copies extra fields such as notes", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      title: `Fave ${i}`,
      category: "creative",
      happenedOn: `2026-0${(i % 9) + 1}-10`,
      ratings: [5],
      note: "SECRET NOTE",
    }));
    const input = buildIdeaInput({ city: null, month: 3, today: "2026-10-06", activities: many, ideaTitles: [] });
    expect(input.topActivities).toHaveLength(8);
    expect(JSON.stringify(input)).not.toContain("SECRET NOTE");
  });

  it("rejects an invalid month", () => {
    expect(() => buildIdeaInput({ city: null, month: 13, today: "2026-10-06", activities: [], ideaTitles: [] })).toThrow();
  });
});

describe("buildIdeasPrompt", () => {
  it("asks for seven candidates and includes only allowed context", () => {
    const input = buildIdeaInput({
      city: "Bozeman, MT",
      month: 10,
      today: "2026-10-06",
      activities: [{ title: "Hot springs day", category: "outdoors", happenedOn: "2026-10-01", ratings: [5, 5], note: "SECRET NOTE about us" } as never],
      ideaTitles: ["Pottery wheel class"],
    });
    const { system, user } = buildIdeasPrompt(input);
    expect(system).toContain(`exactly ${CANDIDATES_REQUESTED}`);
    expect(system).toMatch(/not repeat|Never repeat/i);
    expect(system).toMatch(/at least 2 ideas/);
    expect(system).toMatch(/tracking, monitoring/);
    expect(system).toMatch(/consensual/);
    expect(user).toContain("Bozeman, MT");
    expect(user).toContain("October");
    expect(user).toContain("Hot springs day");
    expect(user).toContain("Pottery wheel class");
    expect(`${system}${user}`).not.toContain("SECRET NOTE");
    const details = JSON.parse(user.slice(user.indexOf("{"), user.lastIndexOf("}") + 1));
    expect(Object.keys(details).sort()).toEqual(["already_done", "already_suggested", "city", "done_recently", "favorites", "month", "not_done_recently"]);
    expect(details.not_done_recently).not.toContain("outdoors");
  });

  it("says the city is unknown rather than guessing", () => {
    const { user } = buildIdeasPrompt(baseInput({ city: null }));
    expect(user).toContain('"city": "unknown"');
  });
});

describe("fallback bank", () => {
  it("has at least 35 complete ideas covering all seven categories", () => {
    expect(FALLBACK_IDEAS.length).toBeGreaterThanOrEqual(35);
    for (const category of IDEA_CATEGORIES) expect(FALLBACK_IDEAS.filter((i) => i.category === category).length).toBeGreaterThanOrEqual(5);
    for (const i of FALLBACK_IDEAS) {
      expect(i.title.length).toBeGreaterThan(0);
      expect(i.title.length).toBeLessThanOrEqual(120);
      expect(i.description.length).toBeLessThanOrEqual(600);
      expect(i.why && i.why.length <= 300).toBe(true);
      expect(i.description).not.toContain("—");
      if (i.weather === "outdoor") expect(i.months?.length).toBeGreaterThan(0);
    }
  });

  it("contains no two ideas that count as repeats of each other", () => {
    FALLBACK_IDEAS.forEach((a, i) => {
      const others = FALLBACK_IDEAS.filter((_, j) => j !== i).map((b) => b.title);
      expect(isRepeat(a.title, others), a.title).toBe(false);
    });
  });
});

describe("fallbackIdeas", () => {
  it("is deterministic for the same input and seed", () => {
    expect(fallbackIdeas(baseInput(), 5, "seed-1")).toEqual(fallbackIdeas(baseInput(), 5, "seed-1"));
  });

  it("varies with the seed", () => {
    const titles = new Set(["a", "b", "c", "d", "e", "f"].map((s) => fallbackIdeas(baseInput(), 5, s).map((i) => i.title).join("|")));
    expect(titles.size).toBeGreaterThan(1);
  });

  it("never repeats past activities, existing ideas, or itself", () => {
    const input = baseInput({ existingIdeaTitles: FALLBACK_IDEAS.slice(0, 10).map((i) => i.title) });
    for (const seed of [1, 2, 3, 4, 5, "x", "y"]) {
      const out = fallbackIdeas(input, 5, seed);
      expect(out).toHaveLength(5);
      const titles = out.map((i) => i.title);
      expect(new Set(titles.map(normalizeTitle)).size).toBe(5);
      for (const t of titles) {
        expect(isRepeat(t, input.pastTitles)).toBe(false);
        expect(isRepeat(t, input.existingIdeaTitles)).toBe(false);
      }
    }
  });

  it("only suggests outdoor ideas in months they fit", () => {
    for (let month = 1; month <= 12; month++) {
      for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
        for (const idea of fallbackIdeas(baseInput({ month, recentCategories: [] }), 5, seed)) {
          const bank = FALLBACK_IDEAS.find((b) => b.title === idea.title)!;
          if (bank.months) expect(bank.months, `${idea.title} in month ${month}`).toContain(month);
        }
      }
    }
    const january = Array.from({ length: 20 }, (_, s) => fallbackIdeas(baseInput({ month: 1 }), 5, s)).flat();
    expect(january.some((i) => i.title === "Golden-hour picnic in a new park")).toBe(false);
    const july = Array.from({ length: 20 }, (_, s) => fallbackIdeas(baseInput({ month: 7 }), 5, s)).flat();
    expect(july.some((i) => i.title === "Ice skating under the lights")).toBe(false);
  });

  it("prefers categories the couple hasn't done recently and spreads across categories", () => {
    const out = fallbackIdeas(baseInput({ recentCategories: ["food", "chill"] }), 5, 42);
    expect(new Set(out.map((i) => i.category)).size).toBe(5);
    expect(out.some((i) => i.category === "food" || i.category === "chill")).toBe(false);
  });

  it("still returns enough ideas when the couple has done everything", () => {
    const input = baseInput({ pastTitles: FALLBACK_IDEAS.map((i) => i.title), existingIdeaTitles: FALLBACK_IDEAS.map((i) => i.title) });
    const out = fallbackIdeas(input, 5, 9);
    expect(out).toHaveLength(5);
    expect(new Set(out.map((i) => i.title)).size).toBe(5);
  });

  it("personalizes the why line from favorites without blaming anyone", () => {
    const out = fallbackIdeas(baseInput({ recentCategories: [] }), 7, 3);
    const outdoors = out.find((i) => i.category === "outdoors");
    if (outdoors) expect(outdoors.why).toContain("Hot springs day");
  });
});

describe("finalizeIdeas", () => {
  const input = baseInput({ existingIdeaTitles: ["Pottery wheel class"] });

  it("returns Claude's ideas when there are enough good ones", () => {
    const seven = ["Jazz brunch", "Climbing gym intro", "Night market stroll", "Candle making", "Stargazing drive", "Ceramic painting", "Lake paddle"].map(
      (t, i) => candidate(t, { category: IDEA_CATEGORIES[i % 7]! }),
    );
    const { ideas, usedFallback } = finalizeIdeas(seven, input, "s");
    expect(ideas).toHaveLength(5);
    expect(usedFallback).toBe(false);
    expect(ideas.every((i) => i.source === "claude")).toBe(true);
  });

  it("keeps at least two ideas from categories not done recently when Claude offers them", () => {
    const list = [
      candidate("Ramen crawl", { category: "food" }),
      candidate("Dumpling class", { category: "food" }),
      candidate("Tea tasting", { category: "food" }),
      candidate("Board game cafe", { category: "chill" }),
      candidate("Wine-free mocktail night", { category: "chill" }),
      candidate("Bouldering intro", { category: "active" }),
      candidate("Open mic night", { category: "social" }),
    ];
    const { ideas } = finalizeIdeas(list, baseInput({ recentCategories: ["food", "chill"] }), "s");
    expect(ideas.filter((i) => i.category !== "food" && i.category !== "chill").length).toBeGreaterThanOrEqual(2);
    expect(ideas).toHaveLength(5);
  });

  const scenarios: Array<[string, IdeaCandidate[]]> = [
    ["nothing", []],
    ["junk", parseIdeas({ ideas: ["junk", 1, null, { title: "" }] })],
    ["fewer than five", [candidate("Jazz brunch"), candidate("Night market stroll")]],
    ["duplicates", [candidate("Jazz brunch"), candidate("jazz brunch!"), candidate("JAZZ BRUNCH"), candidate("Jazz  brunch")]],
    ["repeats of past activities and ideas", [candidate("Hot springs soak"), candidate("Thai cooking night"), candidate("A movie marathon"), candidate("Pottery wheel class")]],
    ["seven repeats", Array.from({ length: 7 }, () => candidate("Hot Springs Day"))],
  ];

  it.each(scenarios)("always returns exactly 5 non-repeating ideas (%s)", (_name, candidates) => {
    const { ideas, usedFallback } = finalizeIdeas(candidates, input, "seed");
    expect(ideas).toHaveLength(5);
    expect(usedFallback).toBe(true);
    const titles = ideas.map((i) => i.title);
    titles.forEach((t, i) => {
      expect(isRepeat(t, input.pastTitles)).toBe(false);
      expect(isRepeat(t, input.existingIdeaTitles)).toBe(false);
      expect(isRepeat(t, titles.filter((_, j) => j !== i))).toBe(false);
    });
    expect(ideas.filter((i) => i.source === "fallback").length).toBeGreaterThan(0);
  });

  it("labels the source of every idea", () => {
    const { ideas } = finalizeIdeas([candidate("Jazz brunch"), candidate("Night market stroll")], input, "s");
    expect(ideas.map((i) => i.source)).toEqual(["claude", "claude", "fallback", "fallback", "fallback"]);
  });
});

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
const COUPLE = "couple-1";
const USER = "user-alex";

function makeRepo(opts: { city?: string | null; batchesToday?: number; paired?: boolean } = {}) {
  const inserted: Array<NewIdeaRow & { couple_id: string }> = [];
  let counter = 0;
  const repo: DateIdeasRepo = {
    async couple() {
      return opts.paired === false ? null : { id: COUPLE, city: opts.city === undefined ? "Bozeman, MT" : opts.city };
    },
    async activityFacts() {
      // Extra fields (note, photo, user ids) must never reach Claude.
      const rows = [
        { title: "Hot springs day", category: "outdoors", happenedOn: "2026-09-12", ratings: [5, 5], note: "SECRET NOTE", photoPath: "c/activities/x.jpg", createdBy: USER },
        { title: "Thai cooking night", category: "food", happenedOn: "2026-09-19", ratings: [4, 5], note: "another secret note" },
      ];
      return rows;
    },
    async ideaTitles() {
      return ["Pottery wheel class"];
    },
    async batchesSince() {
      return opts.batchesToday ?? 0;
    },
    async insertIdeas(coupleId, rows) {
      inserted.push(...rows.map((r) => ({ ...r, couple_id: coupleId })));
      return rows.map(
        (r): IdeaRow => ({ ...r, id: `idea-${++counter}`, status: "new", created_at: "2026-10-06T18:00:00.000Z" }),
      );
    },
  };
  return { repo, inserted };
}

const ctx = { user: { id: USER }, supabase: {} } as unknown as UserContext;
const now = () => new Date("2026-10-06T18:00:00Z");

const claudeReturning = (result: JsonResult) => {
  const calls: JsonRequest[] = [];
  const generate: JsonGenerator = async (request) => {
    calls.push(request);
    return result;
  };
  return { generate, calls };
};

const sevenGood = {
  ideas: [
    raw("Jazz brunch", { category: "social" }),
    raw("Bouldering intro", { category: "active", budget: "$$", time_of_day: "afternoon" }),
    raw("Night market stroll", { category: "food", weather: "outdoor" }),
    raw("Candle making", { category: "creative", budget: "$" }),
    raw("Scenic gondola ride", { category: "adventure", duration: "half_day" }),
    raw("Board game cafe", { category: "chill" }),
    raw("Leaf-peeping drive", { category: "outdoors", weather: "outdoor" }),
  ],
};

describe("date-ideas handler", () => {
  it("rejects unknown actions and invalid months", async () => {
    const { repo } = makeRepo();
    const handler = createDateIdeasHandler({ repo, now });
    await expect(handler({ action: "delete" }, ctx)).rejects.toMatchObject({ status: 400 });
    await expect(handler({ action: "generate", month: 13 }, ctx)).rejects.toMatchObject({ status: 400 });
  });

  it("requires a couple", async () => {
    const { repo } = makeRepo({ paired: false });
    await expect(createDateIdeasHandler({ repo, now })({ action: "generate" }, ctx)).rejects.toBeInstanceOf(HttpError);
  });

  it("returns 429 with a friendly message after 10 batches in 24 hours, without calling Claude", async () => {
    const { repo, inserted } = makeRepo({ batchesToday: 10 });
    const { generate, calls } = claudeReturning({ ok: true, json: sevenGood });
    let error: HttpError | null = null;
    try {
      await createDateIdeasHandler({ repo, generate, now })({ action: "generate" }, ctx);
    } catch (caught: unknown) {
      error = caught as HttpError;
    }
    expect(error).toBeInstanceOf(HttpError);
    expect(error!.status).toBe(429);
    expect(error!.message).toBe(RATE_LIMIT_MESSAGE);
    expect(calls).toHaveLength(0);
    expect(inserted).toHaveLength(0);
  });

  it("allows the tenth batch", async () => {
    const { repo, inserted } = makeRepo({ batchesToday: 9 });
    await createDateIdeasHandler({ repo, now })({ action: "generate" }, ctx);
    expect(inserted).toHaveLength(5);
  });

  it("inserts exactly 5 rows sharing one new batch id and returns them as DateIdeas", async () => {
    const { repo, inserted } = makeRepo();
    const { generate } = claudeReturning({ ok: true, json: sevenGood });
    const res = (await createDateIdeasHandler({ repo, generate, now, newId: () => "batch-xyz" })({ action: "generate" }, ctx)) as GenerateResponse;
    expect(inserted).toHaveLength(5);
    expect(new Set(inserted.map((r) => r.batch_id))).toEqual(new Set(["batch-xyz"]));
    expect(inserted.every((r) => r.couple_id === COUPLE && r.source === "claude")).toBe(true);
    expect(res.ideas).toHaveLength(5);
    expect(res.notice).toBeNull();
    expect(res.ideas[0]).toMatchObject({ batchId: "batch-xyz", status: "new", source: "claude" });
    expect(Object.keys(res.ideas[0]!).sort()).toEqual(
      ["batchId", "budget", "category", "createdAt", "description", "duration", "id", "source", "status", "timeOfDay", "title", "weather", "why"].sort(),
    );
  });

  it("sends Claude only city, month, titles, categories and ratings", async () => {
    const { repo } = makeRepo();
    const { generate, calls } = claudeReturning({ ok: true, json: sevenGood });
    await createDateIdeasHandler({ repo, generate, now })({ action: "generate", month: 10 }, ctx);
    expect(calls).toHaveLength(1);
    const request = calls[0]!;
    expect(request.schema).toBe(IDEAS_SCHEMA);
    const sent = `${request.system}\n${request.user}`;
    expect(sent).not.toMatch(/secret note/i);
    expect(sent).not.toContain("c/activities/x.jpg");
    expect(sent).not.toContain(USER);
    expect(sent).not.toContain(COUPLE);
    expect(sent).toContain("Bozeman, MT");
    expect(sent).toContain("Hot springs day");
    const details = JSON.parse(request.user.slice(request.user.indexOf("{"), request.user.lastIndexOf("}") + 1));
    expect(details.favorites).toEqual([
      { title: "Hot springs day", category: "outdoors", avg_rating: 5 },
      { title: "Thai cooking night", category: "food", avg_rating: 4.5 },
    ]);
  });

  it("without an API key: fallback ideas plus a plain notice", async () => {
    const { repo, inserted } = makeRepo();
    const res = (await createDateIdeasHandler({ repo, generate: null, now })({ action: "generate" }, ctx)) as GenerateResponse;
    expect(res.ideas).toHaveLength(5);
    expect(res.notice).toBe(NOTICES.noKey);
    expect(inserted.every((r) => r.source === "fallback")).toBe(true);
  });

  it.each([
    ["refusal", NOTICES.refusal],
    ["api_error", NOTICES.unavailable],
    ["invalid_json", NOTICES.unavailable],
    ["truncated", NOTICES.unavailable],
    ["no_key", NOTICES.noKey],
  ] as const)("when Claude fails with %s: fallback ideas plus a notice", async (reason, notice) => {
    const { repo, inserted } = makeRepo();
    const { generate } = claudeReturning({ ok: false, reason });
    const res = (await createDateIdeasHandler({ repo, generate, now })({ action: "generate" }, ctx)) as GenerateResponse;
    expect(res.ideas).toHaveLength(5);
    expect(res.notice).toBe(notice);
    expect(inserted.every((r) => r.source === "fallback")).toBe(true);
  });

  it("tops up with labelled fallback ideas when Claude returns repeats or junk", async () => {
    const { repo, inserted } = makeRepo();
    const { generate } = claudeReturning({
      ok: true,
      json: { ideas: [raw("Jazz brunch"), raw("Hot springs soak", { category: "outdoors" }), raw("jazz brunch!"), raw("Pottery wheel class"), { nope: true }] },
    });
    const res = (await createDateIdeasHandler({ repo, generate, now })({ action: "generate" }, ctx)) as GenerateResponse;
    expect(res.ideas).toHaveLength(5);
    expect(res.notice).toBe(NOTICES.partial);
    expect(inserted.filter((r) => r.source === "claude").map((r) => r.title)).toEqual(["Jazz brunch"]);
    expect(inserted.filter((r) => r.source === "fallback")).toHaveLength(4);
  });

  it("treats an unusable Claude response as unavailable", async () => {
    const { repo } = makeRepo();
    const { generate } = claudeReturning({ ok: true, json: { ideas: "no" } });
    const res = (await createDateIdeasHandler({ repo, generate, now })({ action: "generate" }, ctx)) as GenerateResponse;
    expect(res.notice).toBe(NOTICES.unavailable);
    expect(res.ideas).toHaveLength(5);
  });

  it("uses the month the app sends and falls back to the server month", async () => {
    const { repo } = makeRepo();
    const { generate, calls } = claudeReturning({ ok: true, json: sevenGood });
    const handler = createDateIdeasHandler({ repo, generate, now });
    await handler({ action: "generate", month: 1 }, ctx);
    await handler({ action: "generate" }, ctx);
    expect(calls[0]!.user).toContain("January");
    expect(calls[1]!.user).toContain("October");
  });
});
