import { checkGoal, MONEY_MAX_CENTS } from "@/lib/domain/plans-rules";
import { UserFacingError, type Backend, type MoneyGoal, type MoneyGoalInput } from "../types";
import { fail, requireCoupleId, requireUserId, supabase } from "./client";

/**
 * Savings goals. RLS decides visibility: joint goals for both, "mine" goals for
 * their owner only, unless the owner made one visible (read-only for the partner).
 */

type Row = {
  id: string;
  owner_id: string | null;
  scope: "mine" | "joint";
  title: string;
  saved_cents: number | string;
  target_cents: number | string | null;
  target_date: string | null;
  visible_to_partner: boolean;
  created_at: string;
  updated_at: string;
};
const COLUMNS = "id, owner_id, scope, title, saved_cents, target_cents, target_date, visible_to_partner, created_at, updated_at";

const toGoal = (r: Row): MoneyGoal => ({
  id: r.id,
  ownerId: r.owner_id,
  scope: r.scope,
  title: r.title,
  savedCents: Number(r.saved_cents),
  targetCents: r.target_cents === null ? null : Number(r.target_cents),
  targetDate: r.target_date,
  visibleToPartner: r.visible_to_partner,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

function toColumns(g: Partial<MoneyGoalInput>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (g.scope !== undefined) out.scope = g.scope;
  if (g.title !== undefined) out.title = g.title;
  if (g.savedCents !== undefined) out.saved_cents = g.savedCents;
  if (g.targetCents !== undefined) out.target_cents = g.targetCents;
  if (g.targetDate !== undefined) out.target_date = g.targetDate;
  if (g.visibleToPartner !== undefined) out.visible_to_partner = g.visibleToPartner;
  return out;
}

async function getOne(id: string): Promise<MoneyGoal> {
  const { data, error } = await supabase().from("money_goals").select(COLUMNS).eq("id", id).maybeSingle();
  if (error) fail(error, "Could not load that goal.");
  if (!data) throw new UserFacingError("That goal no longer exists.");
  return toGoal(data as Row);
}

async function update(id: string, patch: Partial<Omit<MoneyGoalInput, "scope">>): Promise<MoneyGoal> {
  const clean = checkGoal(patch, true);
  const uid = await requireUserId();
  const current = await getOne(id);
  if (current.scope === "mine" && current.ownerId !== uid) throw new UserFacingError("Only its owner can change this goal.");
  const { data, error } = await supabase().from("money_goals").update(toColumns(clean)).eq("id", id).select(COLUMNS).maybeSingle();
  if (error) fail(error, "Could not update that goal.");
  if (!data) throw new UserFacingError("Only its owner can change this goal.");
  return toGoal(data as Row);
}

export const money: Backend["money"] = {
  async list() {
    const coupleId = await requireCoupleId();
    const { data, error } = await supabase().from("money_goals").select(COLUMNS).eq("couple_id", coupleId).order("created_at", { ascending: true }).limit(200);
    if (error) fail(error, "Could not load your savings.");
    return ((data ?? []) as Row[]).map(toGoal);
  },
  async add(input) {
    const clean = checkGoal(input);
    const uid = await requireUserId();
    const coupleId = await requireCoupleId();
    const { data, error } = await supabase()
      .from("money_goals")
      .insert({ couple_id: coupleId, owner_id: uid, ...toColumns(clean) })
      .select(COLUMNS)
      .single();
    if (error) fail(error, "Could not add that goal.");
    return toGoal(data as Row);
  },
  update,
  async addSaved(id, cents) {
    if (!Number.isInteger(cents) || cents === 0) throw new UserFacingError("Enter an amount.");
    const current = await getOne(id);
    const next = current.savedCents + cents;
    if (next < 0) throw new UserFacingError("That's more than this goal has saved.");
    if (next > MONEY_MAX_CENTS) throw new UserFacingError("That amount is too large.");
    return update(id, { savedCents: next });
  },
  async remove(id) {
    await requireUserId();
    const { data, error } = await supabase().from("money_goals").delete().eq("id", id).select("id");
    if (error) fail(error, "Could not remove that goal.");
    if (!data || data.length === 0) throw new UserFacingError("Only the person who made this goal can remove it.");
  },
};
