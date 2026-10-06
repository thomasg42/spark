import { UserFacingError, type AppreciationNote, type Backend } from "../types";
import { fail, requireCoupleId, requireUserId, supabase } from "./client";

type Row = { id: string; author_id: string | null; body: string; created_at: string };

const COLUMNS = "id, author_id, body, created_at";
export const NOTE_MAX = 280;

const toNote = (r: Row): AppreciationNote => ({ id: r.id, authorId: r.author_id, body: r.body, createdAt: r.created_at });

/** Characters as people count them (and as Postgres char_length does): emoji count once. */
export const noteLength = (text: string) => Array.from(text).length;

/** Trims and checks a note is 1 to 280 characters. */
export function cleanNote(body: string): string {
  const text = (body ?? "").trim();
  if (!text) throw new UserFacingError("Write a few words first.");
  if (noteLength(text) > NOTE_MAX) throw new UserFacingError(`Keep it to ${NOTE_MAX} characters.`);
  return text;
}

export const notes: Backend["notes"] = {
  async list() {
    await requireUserId();
    // RLS returns only this couple's notes.
    const { data, error } = await supabase().from("appreciation_notes").select(COLUMNS).order("created_at", { ascending: false }).limit(200);
    if (error) fail(error, "Could not load your notes.");
    return ((data ?? []) as Row[]).map(toNote);
  },

  async send(body) {
    const text = cleanNote(body);
    const uid = await requireUserId();
    const coupleId = await requireCoupleId();
    const { data, error } = await supabase()
      .from("appreciation_notes")
      .insert({ couple_id: coupleId, author_id: uid, body: text })
      .select(COLUMNS)
      .single();
    if (error) fail(error, "Could not send your note.");
    return toNote(data as Row);
  },

  async remove(id) {
    const uid = await requireUserId();
    // RLS only lets the author delete; the author filter makes intent explicit.
    const { data, error } = await supabase().from("appreciation_notes").delete().eq("id", id).eq("author_id", uid).select("id");
    if (error) fail(error, "Could not delete that note.");
    if (!data || data.length === 0) throw new UserFacingError("You can only delete notes you wrote.");
  },
};
