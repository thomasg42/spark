/**
 * Moments (live): a private shared feed for the two partners. RLS does the
 * real enforcement: both members read the couple's moments and reactions,
 * only the author can delete a moment, and each person can only write their
 * own reaction. Media lives in the private couple-media bucket, folder "moments".
 */
import { isReaction, prepareMoment } from "@/components/moments/moment-rules";
import { UserFacingError, type Backend, type Moment, type MomentKind, type Reaction } from "../types";
import { fail, requireCoupleId, requireUserId, supabase } from "./client";
import { media } from "./media";

const COLUMNS = "id, author_id, kind, caption, media_path, media_mime, link_url, created_at";

type ReactionRow = { user_id: string; reaction: string };

type Row = {
  id: string;
  author_id: string | null;
  kind: MomentKind;
  caption: string | null;
  media_path: string | null;
  media_mime: string | null;
  link_url: string | null;
  created_at: string;
  moment_reactions?: ReactionRow[] | null;
};

function toMoment(row: Row): Moment {
  const reactions: Record<string, Reaction> = {};
  for (const r of row.moment_reactions ?? []) {
    if (isReaction(r.reaction)) reactions[r.user_id] = r.reaction;
  }
  return {
    id: row.id,
    authorId: row.author_id,
    kind: row.kind,
    caption: row.caption,
    mediaPath: row.media_path,
    mediaMime: row.media_mime,
    linkUrl: row.link_url,
    createdAt: row.created_at,
    reactions,
  };
}

/** Storage cleanup never blocks the user: a leftover file is invisible and harmless. */
async function removeQuietly(path: string | null | undefined) {
  if (!path) return;
  try {
    await media.remove(path);
  } catch {
    // ignore
  }
}

export const moments: Backend["moments"] = {
  async list() {
    const coupleId = await requireCoupleId();
    const { data, error } = await supabase()
      .from("moments")
      .select(`${COLUMNS}, moment_reactions(user_id, reaction)`)
      .eq("couple_id", coupleId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });
    if (error) fail(error, "Could not load your moments.");
    return ((data ?? []) as Row[]).map(toMoment);
  },

  async add(input) {
    const prepared = prepareMoment(input);
    const [userId, coupleId] = await Promise.all([requireUserId(), requireCoupleId()]);
    const row: Record<string, unknown> = {
      couple_id: coupleId,
      author_id: userId,
      kind: prepared.kind,
      caption: prepared.caption,
      media_path: null,
      media_mime: null,
      link_url: null,
    };

    let uploaded: string | null = null;
    if (prepared.kind === "photo" || prepared.kind === "video") {
      uploaded = await media.upload(prepared.file, "moments");
      row.media_path = uploaded;
      row.media_mime = prepared.mime;
    } else if (prepared.kind === "link") {
      row.link_url = prepared.linkUrl;
    }

    const { data, error } = await supabase().from("moments").insert(row).select(COLUMNS).single();
    if (error || !data) {
      await removeQuietly(uploaded);
      fail(error, "Could not share that. Please try again.");
    }
    return toMoment({ ...(data as Row), moment_reactions: [] });
  },

  async react(momentId, reaction) {
    if (reaction !== null && !isReaction(reaction)) throw new UserFacingError("That reaction isn't available.");
    const userId = await requireUserId();

    if (reaction === null) {
      const { error } = await supabase().from("moment_reactions").delete().eq("moment_id", momentId).eq("user_id", userId);
      if (error) fail(error, "Could not update your reaction.");
      return;
    }

    const coupleId = await requireCoupleId();
    const { error } = await supabase()
      .from("moment_reactions")
      .upsert({ moment_id: momentId, couple_id: coupleId, user_id: userId, reaction }, { onConflict: "moment_id,user_id" });
    if (error) {
      // 23503: the moment (in this couple) no longer exists.
      if (error.code === "23503") throw new UserFacingError("That moment was deleted.");
      fail(error, "Could not save your reaction.");
    }
  },

  async remove(momentId) {
    const userId = await requireUserId();
    const { data: existing, error: findError } = await supabase().from("moments").select("id, author_id").eq("id", momentId).maybeSingle();
    if (findError) fail(findError, "Could not delete that.");
    if (!existing) throw new UserFacingError("That moment was already deleted.");
    if ((existing as { author_id: string | null }).author_id !== userId) {
      throw new UserFacingError("Only the person who shared a moment can delete it.");
    }

    const { data, error } = await supabase().from("moments").delete().eq("id", momentId).eq("author_id", userId).select("media_path");
    if (error) fail(error, "Could not delete that.");
    const deleted = (data ?? []) as Array<{ media_path: string | null }>;
    if (deleted.length === 0) throw new UserFacingError("Could not delete that. Please try again.");
    // Only after the row is gone, so a failed delete never leaves a moment without its media.
    for (const r of deleted) await removeQuietly(r.media_path);
  },
};
