/**
 * Live "Our Story": the couple's shared timeline in public.story_entries.
 * RLS limits every read and write to the signed-in user's own couple; both
 * partners may edit or remove any entry, and author_id keeps who added it.
 * Photos live in the couple's private storage folder under "story/".
 */
import { cleanStoryInput, sortStory } from "@/components/story/rules";
import { UserFacingError, type Backend, type StoryEntry } from "../types";
import { fail, requireCoupleId, requireUserId, supabase } from "./client";
import { media } from "./media";

type Row = {
  id: string;
  kind: StoryEntry["kind"];
  title: string;
  happened_on: string | null;
  body: string | null;
  photo_path: string | null;
  remind_yearly: boolean;
  author_id: string | null;
  created_at: string;
};

const TABLE = "story_entries";
const COLUMNS = "id, kind, title, happened_on, body, photo_path, remind_yearly, author_id, created_at";
const CHANGED = "This moment was changed or removed while you were editing. Reload and try again.";

export const toStoryEntry = (r: Row): StoryEntry => ({
  id: r.id,
  kind: r.kind,
  title: r.title,
  happenedOn: r.happened_on,
  body: r.body,
  photoPath: r.photo_path,
  remindYearly: r.remind_yearly,
  authorId: r.author_id,
  createdAt: r.created_at,
});

/** Best-effort removal of a stored photo; never blocks the user's action. */
async function discard(path: string | null | undefined) {
  if (!path) return;
  try {
    await media.remove(path);
  } catch {
    // An orphaned file in the couple's own folder is harmless.
  }
}

export const story: Backend["story"] = {
  async list() {
    const coupleId = await requireCoupleId();
    const { data, error } = await supabase()
      .from(TABLE)
      .select(COLUMNS)
      .eq("couple_id", coupleId)
      .order("happened_on", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });
    if (error) fail(error, "Could not load your story.");
    return sortStory(((data ?? []) as Row[]).map(toStoryEntry));
  },

  async add(input) {
    const fields = cleanStoryInput(input);
    const uid = await requireUserId();
    const coupleId = await requireCoupleId();
    const photoPath = input.photo ? await media.upload(input.photo, "story") : null;
    const { data, error } = await supabase()
      .from(TABLE)
      .insert({
        couple_id: coupleId,
        author_id: uid,
        kind: fields.kind,
        title: fields.title,
        happened_on: fields.happenedOn,
        body: fields.body,
        photo_path: photoPath,
        remind_yearly: fields.remindYearly,
      })
      .select(COLUMNS)
      .single();
    if (error || !data) {
      await discard(photoPath);
      fail(error, "Could not save this moment.");
    }
    return toStoryEntry(data as Row);
  },

  async update(id, input) {
    const fields = cleanStoryInput(input);
    const coupleId = await requireCoupleId();
    const { data: current, error: readError } = await supabase()
      .from(TABLE)
      .select("photo_path")
      .eq("id", id)
      .eq("couple_id", coupleId)
      .maybeSingle();
    if (readError) fail(readError, "Could not load that moment.");
    if (!current) throw new UserFacingError("This moment isn't in your story anymore.");
    const oldPath = (current as Pick<Row, "photo_path">).photo_path;

    const uploaded = input.photo ? await media.upload(input.photo, "story") : null;
    const changingPhoto = Boolean(uploaded) || Boolean(input.removePhoto);
    const row: Record<string, unknown> = {
      kind: fields.kind,
      title: fields.title,
      happened_on: fields.happenedOn,
      body: fields.body,
      remind_yearly: fields.remindYearly,
    };
    // photo_path is only written when the photo actually changes, so a stale
    // copy of the form can never undo a photo the partner just added.
    if (changingPhoto) row.photo_path = uploaded;

    let query = supabase().from(TABLE).update(row).eq("id", id).eq("couple_id", coupleId);
    // Swap the photo only if nobody else changed it since we read it.
    if (changingPhoto) query = oldPath ? query.eq("photo_path", oldPath) : query.is("photo_path", null);
    const { data, error } = await query.select(COLUMNS).maybeSingle();
    if (error) {
      await discard(uploaded);
      fail(error, "Could not save your changes.");
    }
    if (!data) {
      await discard(uploaded);
      throw new UserFacingError(CHANGED);
    }
    const saved = toStoryEntry(data as Row);
    // Only after the row points at the new photo (or none) is the old file removed.
    if (changingPhoto && oldPath && oldPath !== saved.photoPath) await discard(oldPath);
    return saved;
  },

  async remove(id) {
    const coupleId = await requireCoupleId();
    const { data, error } = await supabase().from(TABLE).delete().eq("id", id).eq("couple_id", coupleId).select("photo_path");
    if (error) fail(error, "Could not remove this moment.");
    for (const row of (data ?? []) as Array<Pick<Row, "photo_path">>) await discard(row.photo_path);
  },
};
