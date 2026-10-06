/**
 * Live "Our Story" backend against an in-memory fake of the Supabase query
 * builder and storage module. Checks the column mapping, the couple scoping,
 * and the photo lifecycle: upload before the row write, delete the old file
 * only after the row write succeeds, clean up the new file when it fails.
 */
import type { StoryInput } from "@/lib/backend/types";

const h = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  const state = {
    rows: [] as Row[],
    events: [] as string[],
    payloads: [] as Row[],
    filters: [] as Array<Array<[string, unknown]>>,
    orders: [] as Array<{ col: string; ascending: boolean; nullsFirst: boolean | undefined }>,
    failOn: null as null | "select" | "insert" | "update" | "delete",
    afterRead: null as null | (() => void),
    uid: "user-a",
    coupleId: "couple-1",
    uploads: 0,
    clock: Date.parse("2026-10-01T12:00:00Z"),
  };

  class Query implements PromiseLike<{ data: unknown; error: unknown }> {
    private op: "select" | "insert" | "update" | "delete" = "select";
    private payload: Row | null = null;
    private filters: Array<[string, unknown]> = [];
    private mode: "many" | "single" | "maybe" = "many";
    private cols: string[] | null = null;
    constructor(private table: string) {}
    select(cols: string) {
      this.cols = cols.split(",").map((c) => c.trim());
      return this;
    }
    insert(p: Row) {
      this.op = "insert";
      this.payload = p;
      return this;
    }
    update(p: Row) {
      this.op = "update";
      this.payload = p;
      return this;
    }
    delete() {
      this.op = "delete";
      return this;
    }
    eq(col: string, value: unknown) {
      this.filters.push([col, value]);
      return this;
    }
    is(col: string, value: unknown) {
      this.filters.push([col, value]);
      return this;
    }
    order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) {
      state.orders.push({ col, ascending: opts?.ascending ?? true, nullsFirst: opts?.nullsFirst });
      return this;
    }
    single() {
      this.mode = "single";
      return this;
    }
    maybeSingle() {
      this.mode = "maybe";
      return this;
    }
    then<A = { data: unknown; error: unknown }, B = never>(
      resolve?: ((v: { data: unknown; error: unknown }) => A | PromiseLike<A>) | null,
      reject?: ((e: unknown) => B | PromiseLike<B>) | null,
    ): PromiseLike<A | B> {
      return Promise.resolve()
        .then(() => this.run())
        .then(resolve, reject);
    }
    private run(): { data: unknown; error: unknown } {
      state.events.push(`${this.op} ${this.table}`);
      if (this.payload) state.payloads.push({ ...this.payload });
      state.filters.push([...this.filters]);
      if (state.failOn === this.op) return { data: null, error: { code: "XX000", message: "boom" } };
      const match = (r: Row) => this.filters.every(([c, v]) => r[c] === v);
      let out: Row[];
      if (this.op === "insert") {
        state.clock += 1000;
        const row: Row = {
          id: `id-${state.rows.length + 1}`,
          created_at: new Date(state.clock).toISOString(),
          happened_on: null,
          body: null,
          photo_path: null,
          remind_yearly: false,
          ...this.payload,
        };
        state.rows.push(row);
        out = [row];
      } else if (this.op === "update") {
        out = state.rows.filter(match);
        out.forEach((r) => Object.assign(r, this.payload));
      } else if (this.op === "delete") {
        out = state.rows.filter(match);
        state.rows = state.rows.filter((r) => !match(r));
      } else {
        out = state.rows.filter(match);
      }
      const project = (r: Row) => (this.cols ? Object.fromEntries(this.cols.map((c) => [c, r[c]])) : { ...r });
      const projected = out.map(project);
      if (this.op === "select" && state.afterRead) {
        const hook = state.afterRead;
        state.afterRead = null;
        hook();
      }
      if (this.mode === "single") {
        return projected.length === 1 ? { data: projected[0], error: null } : { data: null, error: { code: "PGRST116", message: "no rows" } };
      }
      if (this.mode === "maybe") return { data: projected[0] ?? null, error: null };
      return { data: projected, error: null };
    }
  }

  return { state, Query };
});

vi.mock("@/lib/backend/live/client", async () => {
  const { UserFacingError } = await import("@/lib/backend/types");
  return {
    supabase: () => ({ from: (table: string) => new h.Query(table) }),
    requireUserId: async () => h.state.uid,
    requireCoupleId: async () => h.state.coupleId,
    fail: (_error: unknown, fallback: string): never => {
      throw new UserFacingError(fallback);
    },
  };
});

vi.mock("@/lib/backend/live/media", async () => {
  const { checkUpload } = await import("@/lib/media-rules");
  const { UserFacingError } = await import("@/lib/backend/types");
  return {
    media: {
      upload: async (file: File, folder: string) => {
        const problem = checkUpload(file, "photo");
        if (problem) throw new UserFacingError(problem);
        const path = `${h.state.coupleId}/${folder}/${++h.state.uploads}.jpg`;
        h.state.events.push(`upload ${path}`);
        return path;
      },
      url: async () => null,
      remove: async (path: string) => {
        h.state.events.push(`remove ${path}`);
      },
    },
  };
});

const { story } = await import("@/lib/backend/live/story");

const photo = (type = "image/jpeg") => new File([new Uint8Array([1, 2, 3])], "p", { type });
const input = (over: Partial<StoryInput> = {}): StoryInput => ({
  kind: "first_date",
  title: "Tacos",
  happenedOn: "2024-03-14",
  body: "A long walk.",
  remindYearly: false,
  ...over,
});

function seedRow(over: Record<string, unknown>) {
  h.state.clock += 1000;
  const row = {
    id: `seed-${h.state.rows.length + 1}`,
    couple_id: h.state.coupleId,
    author_id: "user-a",
    kind: "other",
    title: "Seed",
    happened_on: null,
    body: null,
    photo_path: null,
    remind_yearly: false,
    created_at: new Date(h.state.clock).toISOString(),
    ...over,
  };
  h.state.rows.push(row);
  return row;
}

beforeEach(() => {
  h.state.rows = [];
  h.state.events = [];
  h.state.payloads = [];
  h.state.filters = [];
  h.state.orders = [];
  h.state.failOn = null;
  h.state.afterRead = null;
  h.state.uid = "user-a";
  h.state.coupleId = "couple-1";
  h.state.uploads = 0;
});

describe("live story: list", () => {
  it("maps rows to entries for this couple only, oldest first and undated last", async () => {
    seedRow({ id: "undated", title: "Someday" });
    seedRow({ id: "late", happened_on: "2025-01-01", title: "Later" });
    seedRow({ id: "early", happened_on: "2023-06-01", title: "Earlier", remind_yearly: true, photo_path: "couple-1/story/a.jpg", body: "Notes" });
    seedRow({ id: "other-couple", couple_id: "couple-2", happened_on: "2020-01-01" });

    const list = await story.list();
    expect(list.map((e) => e.id)).toEqual(["early", "late", "undated"]);
    expect(list[0]).toEqual({
      id: "early",
      kind: "other",
      title: "Earlier",
      happenedOn: "2023-06-01",
      body: "Notes",
      photoPath: "couple-1/story/a.jpg",
      remindYearly: true,
      authorId: "user-a",
      createdAt: expect.any(String),
    });
    expect(h.state.orders).toEqual([
      { col: "happened_on", ascending: true, nullsFirst: false },
      { col: "created_at", ascending: true, nullsFirst: undefined },
    ]);
  });

  it("turns a database error into a friendly message", async () => {
    h.state.failOn = "select";
    await expect(story.list()).rejects.toThrow("Could not load your story.");
  });
});

describe("live story: add", () => {
  it("inserts cleaned fields with the couple and author", async () => {
    const added = await story.add(input({ title: "  Tacos  ", body: "  ", remindYearly: true }));
    expect(h.state.payloads[0]).toEqual({
      couple_id: "couple-1",
      author_id: "user-a",
      kind: "first_date",
      title: "Tacos",
      happened_on: "2024-03-14",
      body: null,
      photo_path: null,
      remind_yearly: true,
    });
    expect(added).toMatchObject({ title: "Tacos", body: null, remindYearly: true, authorId: "user-a", photoPath: null });
  });

  it("uploads the photo to the story folder before inserting", async () => {
    const added = await story.add(input({ photo: photo() }));
    expect(h.state.events).toEqual(["upload couple-1/story/1.jpg", "insert story_entries"]);
    expect(added.photoPath).toBe("couple-1/story/1.jpg");
  });

  it("removes the uploaded photo when the insert fails", async () => {
    h.state.failOn = "insert";
    await expect(story.add(input({ photo: photo() }))).rejects.toThrow("Could not save this moment.");
    expect(h.state.events).toEqual(["upload couple-1/story/1.jpg", "insert story_entries", "remove couple-1/story/1.jpg"]);
  });

  it("validates before touching storage or the database", async () => {
    await expect(story.add(input({ title: " " }))).rejects.toThrow(/title/i);
    await expect(story.add(input({ body: "x".repeat(4001) }))).rejects.toThrow(/4,000/);
    await expect(story.add(input({ photo: photo("video/mp4") }))).rejects.toThrow(/photo/i);
    expect(h.state.events).toEqual([]);
  });
});

describe("live story: update", () => {
  it("leaves photo_path out of the write when the photo is unchanged", async () => {
    seedRow({ id: "e1", photo_path: "couple-1/story/keep.jpg", author_id: "user-b" });
    const saved = await story.update("e1", input({ title: "Renamed" }));
    const write = h.state.payloads.at(-1)!;
    expect("photo_path" in write).toBe(false);
    expect(saved.photoPath).toBe("couple-1/story/keep.jpg");
    expect(saved.authorId).toBe("user-b");
    expect(h.state.events.some((e) => e.startsWith("remove"))).toBe(false);
  });

  it("swaps the photo, guarded on the old path, and deletes the old file last", async () => {
    seedRow({ id: "e1", photo_path: "couple-1/story/old.jpg" });
    const saved = await story.update("e1", input({ photo: photo() }));
    expect(saved.photoPath).toBe("couple-1/story/1.jpg");
    expect(h.state.events).toEqual([
      "select story_entries",
      "upload couple-1/story/1.jpg",
      "update story_entries",
      "remove couple-1/story/old.jpg",
    ]);
    expect(h.state.filters.at(-1)).toEqual([
      ["id", "e1"],
      ["couple_id", "couple-1"],
      ["photo_path", "couple-1/story/old.jpg"],
    ]);
  });

  it("removes the photo when asked, then deletes the file", async () => {
    seedRow({ id: "e1", photo_path: "couple-1/story/old.jpg" });
    const saved = await story.update("e1", input({ removePhoto: true }));
    expect(saved.photoPath).toBeNull();
    expect(h.state.payloads.at(-1)!.photo_path).toBeNull();
    expect(h.state.events.at(-1)).toBe("remove couple-1/story/old.jpg");
  });

  it("keeps the old photo and cleans up the new upload when the update fails", async () => {
    seedRow({ id: "e1", photo_path: "couple-1/story/old.jpg", title: "Original" });
    h.state.failOn = "update";
    await expect(story.update("e1", input({ photo: photo() }))).rejects.toThrow("Could not save your changes.");
    expect(h.state.events.at(-1)).toBe("remove couple-1/story/1.jpg");
    expect(h.state.events).not.toContain("remove couple-1/story/old.jpg");
    expect(h.state.rows[0]!.photo_path).toBe("couple-1/story/old.jpg");
  });

  it("does not overwrite a photo the partner changed mid-edit", async () => {
    seedRow({ id: "e1", photo_path: "couple-1/story/old.jpg" });
    h.state.afterRead = () => {
      h.state.rows[0]!.photo_path = "couple-1/story/partner.jpg";
    };
    await expect(story.update("e1", input({ photo: photo() }))).rejects.toThrow(/changed or removed/);
    expect(h.state.rows[0]!.photo_path).toBe("couple-1/story/partner.jpg");
    expect(h.state.events.at(-1)).toBe("remove couple-1/story/1.jpg");
    expect(h.state.events).not.toContain("remove couple-1/story/partner.jpg");
  });

  it("explains when the entry is gone, without uploading", async () => {
    await expect(story.update("missing", input({ photo: photo() }))).rejects.toThrow(/anymore/);
    expect(h.state.events).toEqual(["select story_entries"]);
  });

  it("cannot reach another couple's entry", async () => {
    seedRow({ id: "theirs", couple_id: "couple-2" });
    await expect(story.update("theirs", input())).rejects.toThrow(/anymore/);
  });
});

describe("live story: remove", () => {
  it("deletes the row, then its photo", async () => {
    seedRow({ id: "e1", photo_path: "couple-1/story/old.jpg" });
    await story.remove("e1");
    expect(h.state.rows).toHaveLength(0);
    expect(h.state.events).toEqual(["delete story_entries", "remove couple-1/story/old.jpg"]);
  });

  it("keeps the photo when the delete fails", async () => {
    seedRow({ id: "e1", photo_path: "couple-1/story/old.jpg" });
    h.state.failOn = "delete";
    await expect(story.remove("e1")).rejects.toThrow("Could not remove this moment.");
    expect(h.state.events).toEqual(["delete story_entries"]);
  });
});
