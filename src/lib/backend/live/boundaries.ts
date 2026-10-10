import {
  assertSavable,
  onBoundaryShared,
  reviewBoundary,
  unseenBoundaryIds,
  type AgreementRecord,
  type AgreementVersion,
  type BoundaryAck,
  type BoundaryCategory,
  type BoundaryRecord,
  type BoundaryStatus,
} from "@shared/boundaries.ts";
import { UserFacingError, type Backend } from "../types";
import { fail, requireCoupleId, requireUserId, supabase } from "./client";

type BoundaryRow = {
  id: string;
  couple_id: string;
  author_id: string;
  category: BoundaryCategory;
  text: string;
  my_action: string;
  status: BoundaryStatus;
  created_at: string;
  updated_at: string;
};

const toBoundary = (row: BoundaryRow): BoundaryRecord => ({
  id: row.id,
  coupleId: row.couple_id,
  authorId: row.author_id,
  category: row.category,
  text: row.text,
  myAction: row.my_action,
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

async function loadAgreements(coupleId: string): Promise<AgreementRecord[]> {
  const { data, error } = await supabase().from("couple_agreements").select("id, couple_id, status, created_by, created_at, updated_at").eq("couple_id", coupleId).order("created_at", { ascending: true });
  if (error) fail(error, "Could not load agreements.");
  const ids = ((data ?? []) as Array<{ id: string }>).map((row) => row.id);
  if (!ids.length) return [];
  const versions = await supabase().from("agreement_versions").select("agreement_id, version, body, created_by, created_at").in("agreement_id", ids).order("version", { ascending: true });
  if (versions.error) fail(versions.error, "Could not load agreement history.");
  const accepts = await supabase().from("agreement_acceptances").select("agreement_id, version, user_id").in("agreement_id", ids);
  if (accepts.error) fail(accepts.error, "Could not load agreement responses.");
  return (data as Array<{ id: string; couple_id: string; status: AgreementRecord["status"]; created_by: string; created_at: string; updated_at: string }>).map((row) => {
    const history = ((versions.data ?? []) as Array<{ agreement_id: string; version: number; body: string; created_by: string; created_at: string }>).filter((item) => item.agreement_id === row.id);
    const latest = history[history.length - 1]?.version ?? 0;
    const acceptedBy = ((accepts.data ?? []) as Array<{ agreement_id: string; version: number; user_id: string }>)
      .filter((item) => item.agreement_id === row.id && item.version === latest)
      .map((item) => item.user_id);
    const mapped: AgreementVersion[] = history.map((item) => ({ version: item.version, body: item.body, createdBy: item.created_by, createdAt: item.created_at }));
    return { id: row.id, coupleId: row.couple_id, status: row.status, createdBy: row.created_by, createdAt: row.created_at, updatedAt: row.updated_at, versions: mapped, acceptedBy };
  });
}

async function oneAgreement(id: string): Promise<AgreementRecord> {
  const coupleId = await requireCoupleId();
  const rows = await loadAgreements(coupleId);
  const row = rows.find((item) => item.id === id);
  if (!row) throw new UserFacingError("That agreement is not in your couple.");
  return row;
}

export const boundaries: Backend["boundaries"] = {
  review(text, myAction) {
    return reviewBoundary(text, myAction);
  },
  async list() {
    const uid = await requireUserId();
    const coupleId = await requireCoupleId();
    const { data, error } = await supabase().from("boundaries").select("id, couple_id, author_id, category, text, my_action, status, created_at, updated_at").eq("couple_id", coupleId);
    if (error) fail(error, "Could not load boundaries.");
    const rows = ((data ?? []) as BoundaryRow[]).map(toBoundary);
    const acks = await supabase().from("boundary_acks").select("boundary_id, user_id, response, created_at");
    if (acks.error) fail(acks.error, "Could not load responses.");
    const seen = await supabase().from("boundary_seen").select("seen_at").eq("user_id", uid).maybeSingle();
    if (seen.error) fail(seen.error, "Could not load what you've already opened.");
    const ackRows: BoundaryAck[] = ((acks.data ?? []) as Array<{ boundary_id: string; user_id: string; response: BoundaryAck["response"]; created_at: string }>).map((row) => ({
      boundaryId: row.boundary_id,
      userId: row.user_id,
      response: row.response,
      createdAt: row.created_at,
    }));
    return {
      mine: rows.filter((row) => row.authorId === uid),
      partner: rows.filter((row) => row.authorId !== uid),
      agreements: await loadAgreements(coupleId),
      unseenIds: unseenBoundaryIds(rows, uid, (seen.data?.seen_at as string | undefined) ?? null),
      acks: ackRows,
    };
  },
  async save(input) {
    const uid = await requireUserId();
    const coupleId = await requireCoupleId();
    let clean: { text: string; myAction: string };
    try {
      clean = assertSavable(input.text, input.myAction);
    } catch (error) {
      throw new UserFacingError(error instanceof Error ? error.message : "Could not save that.");
    }
    if (input.id) {
      const { data, error } = await supabase().from("boundaries").update({ category: input.category, text: clean.text, my_action: clean.myAction }).eq("id", input.id).eq("author_id", uid).select("id, couple_id, author_id, category, text, my_action, status, created_at, updated_at").maybeSingle();
      if (error) fail(error, "Could not update that boundary.");
      if (!data) throw new UserFacingError("Only the author can edit this boundary.");
      return toBoundary(data as BoundaryRow);
    }
    const { data, error } = await supabase().from("boundaries").insert({ couple_id: coupleId, author_id: uid, category: input.category, text: clean.text, my_action: clean.myAction, status: "draft" }).select("id, couple_id, author_id, category, text, my_action, status, created_at, updated_at").single();
    if (error) fail(error, "Could not save that boundary.");
    return toBoundary(data as BoundaryRow);
  },
  async setStatus(id, status) {
    const uid = await requireUserId();
    const current = await supabase().from("boundaries").select("status").eq("id", id).eq("author_id", uid).maybeSingle();
    if (current.error) fail(current.error, "Could not update that boundary.");
    if (!current.data) throw new UserFacingError("That boundary is not yours to change.");
    let next: BoundaryStatus;
    try {
      next = status === "shared" || status === "archived" ? status : status;
      if ((current.data.status as BoundaryStatus) === "draft" && status === "archived") throw new Error("A draft can be deleted or shared. Archive is for something already shared.");
    } catch (error) {
      throw new UserFacingError(error instanceof Error ? error.message : "Could not update that boundary.");
    }
    const { data, error } = await supabase().from("boundaries").update({ status: next }).eq("id", id).select("id, couple_id, author_id, category, text, my_action, status, created_at, updated_at").maybeSingle();
    if (error) fail(error, "Could not update that boundary.");
    if (!data) throw new UserFacingError("Could not update that boundary.");
    if (status === "shared") onBoundaryShared();
    return toBoundary(data as BoundaryRow);
  },
  async removeDraft(id) {
    const { data, error } = await supabase().from("boundaries").delete().eq("id", id).eq("status", "draft").select("id");
    if (error) fail(error, "Could not delete that draft.");
    if (!data?.length) throw new UserFacingError("Only a draft you wrote can be deleted.");
  },
  async ack(id, response) {
    const uid = await requireUserId();
    const { error } = await supabase().from("boundary_acks").upsert({ boundary_id: id, user_id: uid, response }, { onConflict: "boundary_id,user_id" });
    if (error) fail(error, "Could not save your response.");
  },
  async markSeen() {
    const uid = await requireUserId();
    const { error } = await supabase().from("boundary_seen").upsert({ user_id: uid, seen_at: new Date().toISOString() });
    if (error) fail(error, "Could not mark these as seen.");
  },
  async propose(body) {
    const uid = await requireUserId();
    const coupleId = await requireCoupleId();
    const text = body.trim();
    if (!text || text.length > 500) throw new UserFacingError("Write the agreement in 500 characters or fewer.");
    const created = await supabase().from("couple_agreements").insert({ couple_id: coupleId, created_by: uid, status: "proposed" }).select("id").single();
    if (created.error) fail(created.error, "Could not propose that agreement.");
    const id = created.data.id as string;
    const version = await supabase().from("agreement_versions").insert({ agreement_id: id, version: 1, body: text, created_by: uid });
    if (version.error) fail(version.error, "Could not save that wording.");
    const accept = await supabase().from("agreement_acceptances").insert({ agreement_id: id, version: 1, user_id: uid });
    if (accept.error) fail(accept.error, "Could not record your acceptance.");
    return oneAgreement(id);
  },
  async accept(id) {
    const uid = await requireUserId();
    const current = await oneAgreement(id);
    const version = current.versions[current.versions.length - 1]?.version;
    if (!version) throw new UserFacingError("This agreement has no wording yet.");
    const { error } = await supabase().from("agreement_acceptances").insert({ agreement_id: id, version, user_id: uid });
    if (error) fail(error, "Could not accept that agreement.");
    return oneAgreement(id);
  },
  async revise(id, body) {
    const uid = await requireUserId();
    const text = body.trim();
    if (!text || text.length > 500) throw new UserFacingError("Write the agreement in 500 characters or fewer.");
    const current = await oneAgreement(id);
    const version = (current.versions[current.versions.length - 1]?.version ?? 0) + 1;
    const inserted = await supabase().from("agreement_versions").insert({ agreement_id: id, version, body: text, created_by: uid });
    if (inserted.error) fail(inserted.error, "Could not save the new version.");
    const status = await supabase().from("couple_agreements").update({ status: "proposed" }).eq("id", id);
    if (status.error) fail(status.error, "Could not open the new version.");
    const accept = await supabase().from("agreement_acceptances").insert({ agreement_id: id, version, user_id: uid });
    if (accept.error) fail(accept.error, "Could not record your acceptance.");
    return oneAgreement(id);
  },
  async leave(id) {
    const { error } = await supabase().from("couple_agreements").update({ status: "left" }).eq("id", id);
    if (error) fail(error, "Could not leave that agreement.");
    return oneAgreement(id);
  },
};
