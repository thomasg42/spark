/**
 * Moments (demo): the same private shared feed, kept in this browser.
 * Mirrors the database rules: only couple members can read or add, only the
 * author can delete a moment, and each person can only set their own reaction.
 * Photos and clips go to demo media (IndexedDB on this device, never uploaded).
 */
import { isReaction, prepareMoment } from "@/components/moments/moment-rules";
import { UserFacingError, type Backend, type Moment } from "../types";
import { media } from "./media";
import { demoStore, me, myCouple, newId, tick, type DemoState } from "./store";

const INLINE_PREFIX = "demo/inline/";

const copy = (m: Moment): Moment => ({ ...m, reactions: { ...m.reactions } });

/** Newest first; ties broken by id so the order is stable. */
const newestFirst = (a: Moment, b: Moment) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);

/** A timestamp strictly after every existing moment, so quick back-to-back sends keep their order. */
function nextTimestamp(s: DemoState): string {
  let t = Date.now();
  for (const m of s.moments) {
    const at = Date.parse(m.createdAt);
    if (Number.isFinite(at) && at >= t) t = at + 1;
  }
  return new Date(t).toISOString();
}

export const moments: Backend["moments"] = {
  async list() {
    await tick(80);
    me();
    myCouple();
    return [...demoStore.get().moments].sort(newestFirst).map(copy);
  },

  async add(input) {
    await tick();
    const uid = me();
    myCouple();
    const prepared = prepareMoment(input);

    let uploaded: string | null = null;
    if (prepared.kind === "photo" || prepared.kind === "video") {
      uploaded = await media.upload(prepared.file, "moments");
    }

    try {
      return demoStore.update((s) => {
        const moment: Moment = {
          id: newId(),
          authorId: uid,
          kind: prepared.kind,
          caption: prepared.caption,
          mediaPath: uploaded,
          mediaMime: prepared.kind === "photo" || prepared.kind === "video" ? prepared.mime : null,
          linkUrl: prepared.kind === "link" ? prepared.linkUrl : null,
          createdAt: nextTimestamp(s),
          reactions: {},
        };
        s.moments.unshift(moment);
        return copy(moment);
      });
    } catch (e) {
      if (uploaded) await media.remove(uploaded);
      throw e;
    }
  },

  async react(momentId, reaction) {
    await tick(40);
    if (reaction !== null && !isReaction(reaction)) throw new UserFacingError("That reaction isn't available.");
    const uid = me();
    myCouple();
    demoStore.update((s) => {
      const moment = s.moments.find((m) => m.id === momentId);
      if (!moment) throw new UserFacingError("That moment was deleted.");
      // Only ever the acting person's own reaction.
      if (reaction === null) delete moment.reactions[uid];
      else moment.reactions[uid] = reaction;
    });
  },

  async remove(momentId) {
    await tick();
    const uid = me();
    myCouple();
    const removed = demoStore.update((s) => {
      const index = s.moments.findIndex((m) => m.id === momentId);
      const moment = s.moments[index];
      if (!moment) throw new UserFacingError("That moment was already deleted.");
      if (moment.authorId !== uid) throw new UserFacingError("Only the person who shared a moment can delete it.");
      s.moments.splice(index, 1);
      return moment;
    });
    if (removed.mediaPath && !removed.mediaPath.startsWith(INLINE_PREFIX)) {
      try {
        await media.remove(removed.mediaPath);
      } catch {
        // ignore: the row is gone, a leftover local file is harmless
      }
    }
  },
};
