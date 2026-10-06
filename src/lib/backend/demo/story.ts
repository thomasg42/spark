/**
 * Demo "Our Story": the couple's shared timeline, kept in this browser.
 * Mirrors the database rules: only a member of the couple can read or change
 * it, both partners may edit any entry, and the original author is kept.
 */
import { cleanStoryInput, sortStory } from "@/components/story/rules";
import { UserFacingError, type Backend, type StoryEntry } from "../types";
import { media } from "./media";
import { demoStore, me, myCouple, newId, nowIso, tick } from "./store";

const GONE = "This moment isn't in your story anymore.";

const copy = (entry: StoryEntry): StoryEntry => ({ ...entry });

/** Seed illustrations ("demo/inline/...") are shared with other sample data and never deleted. */
const isSeedArt = (path: string) => path.startsWith("demo/");

async function discard(path: string | null | undefined) {
  if (!path || isSeedArt(path)) return;
  try {
    await media.remove(path);
  } catch {
    // Best effort: a leftover local file is harmless.
  }
}

/** The acting persona, only once they are paired (throws otherwise). */
function member(): string {
  const uid = me();
  myCouple();
  return uid;
}

export const story: Backend["story"] = {
  async list() {
    await tick(80);
    member();
    return sortStory(demoStore.get().story).map(copy);
  },

  async add(input) {
    await tick();
    const uid = member();
    const fields = cleanStoryInput(input);
    const photoPath = input.photo ? await media.upload(input.photo, "story") : null;
    const entry: StoryEntry = { id: newId(), ...fields, photoPath, authorId: uid, createdAt: nowIso() };
    demoStore.update((s) => {
      s.story.push(entry);
    });
    return copy(entry);
  },

  async update(id, input) {
    await tick();
    member();
    const fields = cleanStoryInput(input);
    if (!demoStore.get().story.some((e) => e.id === id)) throw new UserFacingError(GONE);
    const uploaded = input.photo ? await media.upload(input.photo, "story") : null;
    const changingPhoto = Boolean(uploaded) || Boolean(input.removePhoto);
    let result: { saved: StoryEntry; oldPath: string | null };
    try {
      result = demoStore.update((s) => {
        const target = s.story.find((e) => e.id === id);
        if (!target) throw new UserFacingError(GONE);
        const oldPath = target.photoPath;
        Object.assign(target, fields);
        if (changingPhoto) target.photoPath = uploaded;
        return { saved: copy(target), oldPath };
      });
    } catch (error) {
      await discard(uploaded);
      throw error;
    }
    // Only after the entry points at the new photo (or none) is the old file removed.
    const { saved, oldPath } = result;
    if (changingPhoto && oldPath && oldPath !== saved.photoPath) await discard(oldPath);
    return saved;
  },

  async remove(id) {
    await tick();
    member();
    const removed = demoStore.update((s) => {
      const index = s.story.findIndex((e) => e.id === id);
      return index === -1 ? null : (s.story.splice(index, 1)[0] ?? null);
    });
    await discard(removed?.photoPath);
  },
};
