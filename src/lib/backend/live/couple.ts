import { UserFacingError, type Backend, type Couple } from "../types";
import { fail, requireUserId, resetCoupleCache, supabase } from "./client";

type Row = {
  id: string;
  created_by: string | null;
  city: string | null;
  together_since: string | null;
  cadence_reviewed_at: string;
  invite_code: string | null;
  invite_expires_at: string | null;
};

async function load(): Promise<Couple | null> {
  const uid = await requireUserId();
  const { data: member, error: mErr } = await supabase().from("couple_members").select("couple_id").eq("user_id", uid).maybeSingle();
  if (mErr) fail(mErr, "Could not load your couple.");
  if (!member) return null;
  const coupleId = member.couple_id as string;
  const [{ data: couple, error: cErr }, { data: members, error: listErr }] = await Promise.all([
    supabase().from("couples").select("id, created_by, city, together_since, cadence_reviewed_at, invite_code, invite_expires_at").eq("id", coupleId).single(),
    supabase().from("couple_members").select("user_id").eq("couple_id", coupleId),
  ]);
  if (cErr) fail(cErr, "Could not load your couple.");
  if (listErr) fail(listErr, "Could not load your couple.");
  const r = couple as Row;
  return {
    id: r.id,
    createdBy: r.created_by,
    city: r.city,
    togetherSince: r.together_since,
    cadenceReviewedAt: r.cadence_reviewed_at,
    inviteCode: r.invite_code,
    inviteExpiresAt: r.invite_expires_at,
    memberIds: (members ?? []).map((m) => m.user_id as string),
  };
}

async function loadOrThrow(): Promise<Couple> {
  const couple = await load();
  if (!couple) throw new UserFacingError("Pair with your partner first.");
  return couple;
}

export const couple: Backend["couple"] = {
  getMine: load,
  async create() {
    const { error } = await supabase().rpc("create_couple");
    if (error) fail(error, "Could not create your couple.");
    resetCoupleCache();
    return loadOrThrow();
  },
  async join(code) {
    const { error } = await supabase().rpc("join_couple", { p_code: code });
    if (error) fail(error, "Could not join with that code.");
    resetCoupleCache();
    return loadOrThrow();
  },
  async regenerateInvite() {
    const { error } = await supabase().rpc("regenerate_invite");
    if (error) fail(error, "Could not make a new code.");
    return loadOrThrow();
  },
  async update(patch) {
    const current = await loadOrThrow();
    const row: Record<string, unknown> = {};
    if (patch.city !== undefined) row.city = patch.city?.trim() || null;
    if (patch.togetherSince !== undefined) row.together_since = patch.togetherSince || null;
    const { error } = await supabase().from("couples").update(row).eq("id", current.id);
    if (error) fail(error, "Could not save.");
    return loadOrThrow();
  },
  async markCadenceReviewed() {
    const current = await loadOrThrow();
    const { error } = await supabase().from("couples").update({ cadence_reviewed_at: new Date().toISOString() }).eq("id", current.id);
    if (error) fail(error, "Could not save.");
    return loadOrThrow();
  },
};

export async function _ensureSignedIn() {
  await requireUserId();
}
