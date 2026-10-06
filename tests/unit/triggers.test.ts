import { detectCategoryRut, detectExcitementDrop, detectLifeChange, detectLittleTime, evaluateRhythm, type ActivityLite, type PulseLite } from "@/lib/domain/triggers";

const today = new Date(2026, 9, 8); // Thursday; current week starts Mon 2026-10-05

describe("category rut (same categories for 3+ weeks)", () => {
  const sameThree: ActivityLite[] = [
    { happenedOn: "2026-09-22", category: "food" },
    { happenedOn: "2026-09-30", category: "chill" },
    { happenedOn: "2026-10-06", category: "food" },
  ];

  it("fires when three straight weeks use two or fewer categories", () => {
    const s = detectCategoryRut(sameThree, today);
    expect(s?.kind).toBe("category_rut");
    expect(s?.detail?.categories).toEqual(expect.arrayContaining(["food", "chill"]));
    expect(s?.detail?.untried).not.toContain("food");
  });

  it("does not fire when any of the three weeks is empty", () => {
    expect(detectCategoryRut(sameThree.slice(1), today)).toBeNull();
  });

  it("does not fire when the couple mixed in a third category", () => {
    expect(detectCategoryRut([...sameThree, { happenedOn: "2026-10-07", category: "outdoors" }], today)).toBeNull();
  });

  it("ignores activities older than the window", () => {
    expect(detectCategoryRut([{ happenedOn: "2026-08-01", category: "food" }], today)).toBeNull();
  });
});

describe("excitement dropping two weeks in a row", () => {
  const p = (userId: string, weekStart: string, excitement: number): PulseLite => ({ userId, weekStart, excitement, connection: 4 });

  it("fires on three consecutive strictly falling weeks for either partner", () => {
    const s = detectExcitementDrop([p("a", "2026-09-21", 5), p("a", "2026-09-28", 4), p("a", "2026-10-05", 3), p("b", "2026-10-05", 5)]);
    expect(s?.kind).toBe("excitement_drop");
  });

  it("never names the partner in the message", () => {
    const s = detectExcitementDrop([p("sam-id", "2026-09-21", 5), p("sam-id", "2026-09-28", 4), p("sam-id", "2026-10-05", 2)]);
    expect(s?.message).not.toMatch(/sam/i);
  });

  it("does not fire on a single drop, a flat week, or a gap", () => {
    expect(detectExcitementDrop([p("a", "2026-09-28", 5), p("a", "2026-10-05", 3)])).toBeNull();
    expect(detectExcitementDrop([p("a", "2026-09-21", 5), p("a", "2026-09-28", 4), p("a", "2026-10-05", 4)])).toBeNull();
    expect(detectExcitementDrop([p("a", "2026-09-14", 5), p("a", "2026-09-28", 4), p("a", "2026-10-05", 3)])).toBeNull();
  });

  it("uses only the latest three weeks", () => {
    expect(detectExcitementDrop([p("a", "2026-09-14", 5), p("a", "2026-09-21", 4), p("a", "2026-09-28", 3), p("a", "2026-10-05", 5)])).toBeNull();
  });
});

describe("little time together", () => {
  it("fires after 14 days without a logged activity", () => {
    expect(detectLittleTime([{ happenedOn: "2026-09-24", category: "food" }], today)?.kind).toBe("little_time");
  });
  it("stays quiet within 14 days, and for brand-new couples with nothing logged", () => {
    expect(detectLittleTime([{ happenedOn: "2026-09-25", category: "food" }], today)).toBeNull();
    expect(detectLittleTime([], today)).toBeNull();
  });
});

describe("life change", () => {
  it("is active for six weeks and reports when the boost ends", () => {
    const s = detectLifeChange([{ date: "2026-09-30", kind: "new_job" }], today);
    expect(s?.kind).toBe("life_change");
    expect(s?.detail?.until).toBe("2026-11-11");
    expect(detectLifeChange([{ date: "2026-08-20", kind: "move" }], today)).toBeNull();
  });
});

describe("evaluateRhythm", () => {
  it("returns no signals and no suggestions for a healthy, varied couple", () => {
    const r = evaluateRhythm({
      activities: [
        { happenedOn: "2026-09-23", category: "outdoors" },
        { happenedOn: "2026-09-30", category: "creative" },
        { happenedOn: "2026-10-06", category: "food" },
      ],
      pulses: [],
      lifeChanges: [],
      today,
    });
    expect(r.signals).toEqual([]);
    expect(r.suggestions).toEqual([]);
  });

  it("maps signals to specific, supportive suggestions", () => {
    const r = evaluateRhythm({
      activities: [{ happenedOn: "2026-09-01", category: "food" }],
      pulses: [
        { userId: "a", weekStart: "2026-09-21", excitement: 5, connection: 4 },
        { userId: "a", weekStart: "2026-09-28", excitement: 4, connection: 4 },
        { userId: "a", weekStart: "2026-10-05", excitement: 2, connection: 4 },
      ],
      lifeChanges: [{ date: "2026-10-01", kind: "new_schedule" }],
      today,
    });
    expect(r.signals.map((s) => s.kind).sort()).toEqual(["excitement_drop", "life_change", "little_time"]);
    const kinds = r.suggestions.map((s) => s.kind);
    expect(kinds).toContain("standing_date");
    expect(kinds).toContain("surprise");
    expect(kinds).toContain("tech_free_night");
    for (const s of r.suggestions) expect(`${s.title} ${s.body}`).not.toMatch(/withhold|ignore them|make them jealous|ultimatum/i);
  });
});
