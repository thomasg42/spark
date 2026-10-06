import { sanitizeSchema } from "@shared/llm.ts";

describe("structured output schema sanitizer", () => {
  const schema = {
    type: "object",
    properties: {
      overlaps: { type: "array", minItems: 1, maxItems: 3, items: { type: "string", maxLength: 300 } },
      ideas: { type: "array", minItems: 5, uniqueItems: true, items: { type: "object", properties: { budget: { type: "string", enum: ["free", "$"] }, score: { type: "integer", minimum: 1, maximum: 5 } }, required: ["budget", "score"] } },
      title: { type: "string", pattern: "^[A-Z]" },
    },
    required: ["overlaps", "ideas", "title"],
  };
  const clean = sanitizeSchema(schema) as any;

  it("removes keywords structured outputs reject", () => {
    const text = JSON.stringify(clean);
    for (const key of ["maxItems", "maxLength", "uniqueItems", "minimum", "maximum", "pattern"]) expect(text).not.toContain(`"${key}"`);
  });
  it("keeps minItems only as 0 or 1", () => {
    expect(clean.properties.overlaps.minItems).toBe(1);
    expect(clean.properties.ideas.minItems).toBe(1);
  });
  it("forces additionalProperties false on every object and keeps enums and required", () => {
    expect(clean.additionalProperties).toBe(false);
    expect(clean.properties.ideas.items.additionalProperties).toBe(false);
    expect(clean.properties.ideas.items.properties.budget.enum).toEqual(["free", "$"]);
    expect(clean.required).toEqual(["overlaps", "ideas", "title"]);
  });
  it("never drops a property whose NAME looks like a keyword", () => {
    const c = sanitizeSchema({ type: "object", properties: { pattern: { type: "string" }, minimum: { type: "number" } }, required: ["pattern", "minimum"] }) as any;
    expect(Object.keys(c.properties)).toEqual(["pattern", "minimum"]);
  });
  it("does not mutate the input", () => {
    expect(schema.properties.overlaps.maxItems).toBe(3);
  });
});
