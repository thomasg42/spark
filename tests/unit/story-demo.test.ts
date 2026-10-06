/**
 * Demo "Our Story" backend: same behavior as live, in memory (no localStorage
 * or IndexedDB in the node test environment).
 */
import { story } from "@/lib/backend/demo/story";
import { media } from "@/lib/backend/demo/media";
import { DEMO_ALEX, DEMO_SAM, demoStore } from "@/lib/backend/demo/store";
import type { StoryInput } from "@/lib/backend/types";

const actAs = (userId: string) =>
  demoStore.update((s) => {
    s.signedIn = true;
    s.actingAs = userId;
  });

const photo = (name = "us.jpg", type = "image/jpeg") => new File([new Uint8Array([1, 2, 3, 4])], name, { type });

const input = (over: Partial<StoryInput> = {}): StoryInput => ({
  kind: "trip",
  title: "Glacier weekend",
  happenedOn: "2025-07-04",
  body: "Mountain goats everywhere.",
  remindYearly: false,
  ...over,
});

const coupleId = () => demoStore.get().couple!.id;

beforeEach(() => {
  demoStore.reset(false);
  actAs(DEMO_ALEX);
});

describe("demo story: list", () => {
  it("returns the seed timeline oldest first", async () => {
    const list = await story.list();
    expect(list.map((e) => e.id)).toEqual(["seed-story-1", "seed-story-2", "seed-story-3"]);
    expect(list[2]!.remindYearly).toBe(true);
  });

  it("puts undated entries last and orders same-day entries by when they were added", async () => {
    const undated = await story.add(input({ title: "Someday", happenedOn: null }));
    const first = await story.add(input({ title: "Same day A", happenedOn: "2025-07-04" }));
    await new Promise((r) => setTimeout(r, 5));
    const second = await story.add(input({ title: "Same day B", happenedOn: "2025-07-04" }));
    const ids = (await story.list()).map((e) => e.id);
    expect(ids.at(-1)).toBe(undated.id);
    expect(ids.indexOf(first.id)).toBeLessThan(ids.indexOf(second.id));
  });

  it("hands out copies, so callers cannot change the store by accident", async () => {
    const [entry] = await story.list();
    entry!.title = "changed outside";
    expect((await story.list())[0]!.title).not.toBe("changed outside");
  });

  it("is only available to a paired, signed-in member", async () => {
    demoStore.reset(true);
    actAs(DEMO_ALEX);
    await expect(story.list()).rejects.toThrow(/pair/i);
    demoStore.update((s) => {
      s.signedIn = false;
    });
    await expect(story.list()).rejects.toThrow(/demo partner/i);
  });
});

describe("demo story: add", () => {
  it("records the author and cleans the input", async () => {
    const added = await story.add(input({ title: "  Glacier weekend  ", body: "  " }));
    expect(added).toMatchObject({ kind: "trip", title: "Glacier weekend", body: null, authorId: DEMO_ALEX, photoPath: null });
    expect(added.id).toBeTruthy();
    expect((await story.list()).some((e) => e.id === added.id)).toBe(true);
  });

  it("uploads a photo into the couple's story folder", async () => {
    const added = await story.add(input({ photo: photo() }));
    expect(added.photoPath).toMatch(new RegExp(`^${coupleId()}/story/`));
    expect(await media.url(added.photoPath!)).toBeTruthy();
  });

  it("validates before uploading anything", async () => {
    const before = demoStore.get().story.length;
    await expect(story.add(input({ title: "" }))).rejects.toThrow(/title/i);
    await expect(story.add(input({ title: "x".repeat(121) }))).rejects.toThrow(/120/);
    await expect(story.add(input({ body: "x".repeat(4001) }))).rejects.toThrow(/4,000/);
    await expect(story.add(input({ photo: photo("clip.mp4", "video/mp4") }))).rejects.toThrow(/photo/i);
    await expect(story.add(input({ photo: photo("doc.pdf", "application/pdf") }))).rejects.toThrow(/file type/i);
    expect(demoStore.get().story.length).toBe(before);
  });
});

describe("demo story: update", () => {
  it("lets either partner edit any entry and keeps the original author", async () => {
    actAs(DEMO_SAM);
    const updated = await story.update("seed-story-1", input({ kind: "how_we_met", title: "Trivia night, right team" }));
    expect(updated.title).toBe("Trivia night, right team");
    expect(updated.authorId).toBe(DEMO_ALEX);
    expect(updated.createdAt).toBe(demoStore.get().story.find((e) => e.id === "seed-story-1")!.createdAt);
  });

  it("keeps the existing photo when no photo change is asked for", async () => {
    const added = await story.add(input({ photo: photo() }));
    const updated = await story.update(added.id, input({ title: "Renamed" }));
    expect(updated.photoPath).toBe(added.photoPath);
    expect(await media.url(added.photoPath!)).toBeTruthy();
  });

  it("replaces a photo and only then deletes the old file", async () => {
    const added = await story.add(input({ photo: photo("old.jpg") }));
    const updated = await story.update(added.id, input({ photo: photo("new.png", "image/png") }));
    expect(updated.photoPath).not.toBe(added.photoPath);
    expect(updated.photoPath).toMatch(new RegExp(`^${coupleId()}/story/`));
    expect(await media.url(added.photoPath!)).toBeNull();
    expect(await media.url(updated.photoPath!)).toBeTruthy();
  });

  it("removes a photo when asked", async () => {
    const added = await story.add(input({ photo: photo() }));
    const updated = await story.update(added.id, input({ removePhoto: true }));
    expect(updated.photoPath).toBeNull();
    expect(await media.url(added.photoPath!)).toBeNull();
  });

  it("never deletes the shared seed illustrations", async () => {
    const remove = vi.spyOn(media, "remove");
    try {
      const updated = await story.update("seed-story-3", input({ kind: "together", removePhoto: true }));
      expect(updated.photoPath).toBeNull();
      await story.remove("seed-story-1");
      expect(remove).not.toHaveBeenCalled();
    } finally {
      remove.mockRestore();
    }
    // The same illustration is used by a seed moment, so it must still resolve.
    expect(await media.url("demo/inline/sunset.svg")).toMatch(/^data:image\/svg\+xml/);
  });

  it("deletes the replaced file only after the entry already points at the new one", async () => {
    const added = await story.add(input({ photo: photo("old.jpg") }));
    const seenAtRemoval: Array<string | null> = [];
    const remove = vi.spyOn(media, "remove").mockImplementation(async () => {
      seenAtRemoval.push(demoStore.get().story.find((e) => e.id === added.id)!.photoPath);
    });
    try {
      const updated = await story.update(added.id, input({ photo: photo("new.jpg") }));
      expect(remove).toHaveBeenCalledWith(added.photoPath);
      expect(seenAtRemoval).toEqual([updated.photoPath]);
    } finally {
      remove.mockRestore();
    }
  });

  it("rejects an invalid change without touching the entry or uploading", async () => {
    const before = { ...demoStore.get().story.find((e) => e.id === "seed-story-2")! };
    await expect(story.update("seed-story-2", input({ title: " ", photo: photo() }))).rejects.toThrow(/title/i);
    expect(demoStore.get().story.find((e) => e.id === "seed-story-2")).toEqual(before);
  });

  it("explains when the entry no longer exists", async () => {
    await expect(story.update("nope", input())).rejects.toThrow(/anymore/);
  });
});

describe("demo story: remove", () => {
  it("removes the entry and its photo for both partners", async () => {
    const added = await story.add(input({ photo: photo() }));
    actAs(DEMO_SAM);
    await story.remove(added.id);
    expect((await story.list()).some((e) => e.id === added.id)).toBe(false);
    actAs(DEMO_ALEX);
    expect((await story.list()).some((e) => e.id === added.id)).toBe(false);
    expect(await media.url(added.photoPath!)).toBeNull();
  });

  it("is a no-op for an entry that is already gone", async () => {
    await expect(story.remove("nope")).resolves.toBeUndefined();
    expect((await story.list()).length).toBe(3);
  });
});
