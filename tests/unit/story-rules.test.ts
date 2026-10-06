import { UserFacingError, type StoryEntry, type StoryInput } from "@/lib/backend/types";
import {
  cleanStoryInput,
  groupByYear,
  isRealDate,
  missingFirsts,
  remindsByDefault,
  sortStory,
  upsertStory,
} from "@/components/story/rules";

const input = (over: Partial<StoryInput> = {}): StoryInput => ({
  kind: "first_date",
  title: "Tacos",
  happenedOn: "2024-05-01",
  body: null,
  remindYearly: false,
  ...over,
});

const entry = (id: string, happenedOn: string | null, createdAt: string, over: Partial<StoryEntry> = {}): StoryEntry => ({
  id,
  kind: "other",
  title: id,
  happenedOn,
  body: null,
  photoPath: null,
  remindYearly: false,
  authorId: null,
  createdAt,
  ...over,
});

describe("story input cleaning", () => {
  it("trims text and turns blanks into nulls", () => {
    expect(cleanStoryInput(input({ title: "  Tacos  ", body: "   ", happenedOn: "" }))).toEqual({
      kind: "first_date",
      title: "Tacos",
      happenedOn: null,
      body: null,
      remindYearly: false,
    });
    expect(cleanStoryInput(input({ body: "  We walked.\nTwice.  " })).body).toBe("We walked.\nTwice.");
  });

  it("requires a title of 1 to 120 characters", () => {
    expect(() => cleanStoryInput(input({ title: "   " }))).toThrow(UserFacingError);
    expect(() => cleanStoryInput(input({ title: "x".repeat(121) }))).toThrow(/120/);
    expect(cleanStoryInput(input({ title: "x".repeat(120) })).title).toHaveLength(120);
  });

  it("caps notes at 4000 characters", () => {
    expect(() => cleanStoryInput(input({ body: "x".repeat(4001) }))).toThrow(/4,000/);
    expect(cleanStoryInput(input({ body: "x".repeat(4000) })).body).toHaveLength(4000);
  });

  it("rejects unknown kinds and impossible dates", () => {
    expect(() => cleanStoryInput(input({ kind: "stalking" as never }))).toThrow(UserFacingError);
    expect(() => cleanStoryInput(input({ happenedOn: "2026-02-31" }))).toThrow(/date/);
    expect(() => cleanStoryInput(input({ happenedOn: "05/01/2024" }))).toThrow(/date/);
  });

  it("knows real calendar dates, including leap days", () => {
    expect(isRealDate("2024-02-29")).toBe(true);
    expect(isRealDate("2025-02-29")).toBe(false);
    expect(isRealDate("1899-12-31")).toBe(false);
    expect(isRealDate("2026-10-06")).toBe(true);
  });

  it("turns yearly reminders on by default only for together and anniversary", () => {
    expect(remindsByDefault("together")).toBe(true);
    expect(remindsByDefault("anniversary")).toBe(true);
    expect(remindsByDefault("first_date")).toBe(false);
    expect(remindsByDefault("first_kiss")).toBe(false);
  });
});

describe("timeline order", () => {
  it("sorts by date ascending, undated last, then by when added", () => {
    const sorted = sortStory([
      entry("undated-new", null, "2026-01-03T00:00:00Z"),
      entry("b", "2024-06-01", "2026-01-01T00:00:00Z"),
      entry("undated-old", null, "2026-01-01T00:00:00Z"),
      entry("a-later", "2023-01-01", "2026-01-05T00:00:00Z"),
      entry("a-earlier", "2023-01-01", "2026-01-02T00:00:00Z"),
    ]);
    expect(sorted.map((e) => e.id)).toEqual(["a-earlier", "a-later", "b", "undated-old", "undated-new"]);
  });

  it("compares Postgres and JavaScript timestamps by instant", () => {
    const sorted = sortStory([
      entry("js", "2024-01-01", "2026-01-01T10:00:00.000Z"),
      entry("pg", "2024-01-01", "2026-01-01T09:00:00.123456+00:00"),
    ]);
    expect(sorted.map((e) => e.id)).toEqual(["pg", "js"]);
  });

  it("does not mutate the input and upserts in order", () => {
    const list = [entry("b", "2024-01-01", "2026-01-01T00:00:00Z"), entry("a", "2020-01-01", "2026-01-01T00:00:00Z")];
    const sorted = sortStory(list);
    expect(list[0]!.id).toBe("b");
    const replaced = upsertStory(sorted, entry("b", "2019-01-01", "2026-01-01T00:00:00Z", { title: "moved" }));
    expect(replaced.map((e) => e.id)).toEqual(["b", "a"]);
    expect(replaced[0]!.title).toBe("moved");
    expect(upsertStory(sorted, entry("c", null, "2026-02-01T00:00:00Z")).map((e) => e.id)).toEqual(["a", "b", "c"]);
  });

  it("groups by year with undated entries last", () => {
    const groups = groupByYear(
      sortStory([
        entry("x", null, "2026-01-01T00:00:00Z"),
        entry("a", "2023-04-01", "2026-01-01T00:00:00Z"),
        entry("b", "2023-09-01", "2026-01-01T00:00:00Z"),
        entry("c", "2024-01-01", "2026-01-01T00:00:00Z"),
      ]),
    );
    expect(groups.map((g) => [g.label, g.entries.map((e) => e.id)])).toEqual([
      ["2023", ["a", "b"]],
      ["2024", ["c"]],
      ["No date yet", ["x"]],
    ]);
  });

  it("lists the classic firsts not added yet", () => {
    expect(missingFirsts([{ kind: "how_we_met" }, { kind: "trip" }, { kind: "together" }])).toEqual(["first_date", "first_kiss", "met_family"]);
  });
});
