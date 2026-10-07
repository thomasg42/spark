import { checkProject } from "@/lib/domain/plans-rules";
import { UserFacingError, type Backend, type Project, type ProjectInput } from "../types";
import { fail, requireCoupleId, requireUserId, supabase } from "./client";

/** Shared, ranked couple projects (RLS: the couple only). */

type Row = {
  id: string;
  title: string;
  kind: Project["kind"];
  status: Project["status"];
  rank: number;
  target_date: string | null;
  budget_cents: number | string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};
const COLUMNS = "id, title, kind, status, rank, target_date, budget_cents, note, created_by, created_at, updated_at";

const toProject = (r: Row): Project => ({
  id: r.id,
  title: r.title,
  kind: r.kind,
  status: r.status,
  rank: Number(r.rank),
  targetDate: r.target_date,
  budgetCents: r.budget_cents === null ? null : Number(r.budget_cents),
  note: r.note,
  createdBy: r.created_by,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

function toColumns(p: Partial<ProjectInput>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (p.title !== undefined) out.title = p.title;
  if (p.kind !== undefined) out.kind = p.kind;
  if (p.status !== undefined) out.status = p.status;
  if (p.targetDate !== undefined) out.target_date = p.targetDate;
  if (p.budgetCents !== undefined) out.budget_cents = p.budgetCents;
  if (p.note !== undefined) out.note = p.note;
  return out;
}

async function list(): Promise<Project[]> {
  const coupleId = await requireCoupleId();
  const { data, error } = await supabase()
    .from("projects")
    .select(COLUMNS)
    .eq("couple_id", coupleId)
    .order("rank", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) fail(error, "Could not load your projects.");
  return ((data ?? []) as Row[]).map(toProject);
}

export const projects: Backend["projects"] = {
  list,
  async add(input) {
    const clean = checkProject(input);
    const uid = await requireUserId();
    const coupleId = await requireCoupleId();
    const { data, error } = await supabase()
      .from("projects")
      .insert({ couple_id: coupleId, created_by: uid, ...toColumns(clean) })
      .select(COLUMNS)
      .single();
    if (error) fail(error, "Could not add that project.");
    return toProject(data as Row);
  },
  async update(id, patch) {
    const clean = checkProject(patch, true);
    await requireCoupleId();
    const { data, error } = await supabase().from("projects").update(toColumns(clean)).eq("id", id).select(COLUMNS).maybeSingle();
    if (error) fail(error, "Could not update that project.");
    if (!data) throw new UserFacingError("That project no longer exists.");
    return toProject(data as Row);
  },
  async move(id, direction) {
    await requireCoupleId();
    const { error } = await supabase().rpc("move_project", { p_id: id, p_direction: direction });
    if (error) fail(error, "Could not reorder your projects.");
    return list();
  },
  async remove(id) {
    await requireCoupleId();
    const { data, error } = await supabase().from("projects").delete().eq("id", id).select("id");
    if (error) fail(error, "Could not remove that project.");
    if (!data || data.length === 0) throw new UserFacingError("That project no longer exists.");
  },
};
