import {
  acceptAgreement,
  assertSavable,
  canAck,
  canReadBoundary,
  nextBoundaryStatus,
  onBoundaryShared,
  reviewBoundary,
  unseenBoundaryIds,
  type AgreementRecord,
  type BoundaryRecord,
} from "@shared/boundaries.ts";
import { UserFacingError, type Backend } from "../types";
import { demoStore, me, myCouple, newId, nowIso, tick } from "./store";

function guard<T>(fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    throw new UserFacingError(error instanceof Error ? error.message : "Could not save that.");
  }
}

function viewAgreements(rows: AgreementRecord[]): AgreementRecord[] {
  return rows.map((row) => ({ ...row, versions: row.versions.map((version) => ({ ...version })), acceptedBy: [...row.acceptedBy] }));
}

function bundle(): ReturnType<Backend["boundaries"]["list"]> extends Promise<infer T> ? T : never {
  const uid = me();
  const couple = myCouple();
  const state = demoStore.get();
  const visible = state.boundaries.filter((row) => row.coupleId === couple.id && canReadBoundary(row, uid));
  return {
    mine: visible.filter((row) => row.authorId === uid).map((row) => ({ ...row })),
    partner: visible.filter((row) => row.authorId !== uid).map((row) => ({ ...row })),
    agreements: viewAgreements(state.agreements.filter((row) => row.coupleId === couple.id)),
    unseenIds: unseenBoundaryIds(visible, uid, state.boundarySeen[uid] ?? null),
    acks: state.boundaryAcks.filter((ack) => visible.some((row) => row.id === ack.boundaryId)).map((ack) => ({ ...ack })),
  };
}

export const boundaries: Backend["boundaries"] = {
  async list() {
    await tick(40);
    return bundle();
  },
  review(text, myAction) {
    return reviewBoundary(text, myAction);
  },
  async save(input) {
    await tick();
    const uid = me();
    const couple = myCouple();
    return guard(() => {
      const clean = assertSavable(input.text, input.myAction);
      return demoStore.update((state) => {
        const existing = input.id ? state.boundaries.find((row) => row.id === input.id) : undefined;
        if (existing) {
          if (existing.authorId !== uid) throw new Error("Only the author can edit this boundary.");
          existing.category = input.category;
          existing.text = clean.text;
          existing.myAction = clean.myAction;
          existing.updatedAt = nowIso();
          return { ...existing };
        }
        const row: BoundaryRecord = {
          id: newId(),
          coupleId: couple.id,
          authorId: uid,
          category: input.category,
          text: clean.text,
          myAction: clean.myAction,
          status: "draft",
          createdAt: nowIso(),
          updatedAt: nowIso(),
        };
        state.boundaries.push(row);
        return { ...row };
      });
    });
  },
  async setStatus(id, status) {
    await tick();
    const uid = me();
    myCouple();
    return guard(() =>
      demoStore.update((state) => {
        const row = state.boundaries.find((item) => item.id === id && item.authorId === uid);
        if (!row) throw new Error("That boundary is not yours to change.");
        row.status = nextBoundaryStatus(row.status, status);
        row.updatedAt = nowIso();
        if (status === "shared") onBoundaryShared();
        return { ...row };
      }),
    );
  },
  async removeDraft(id) {
    await tick(40);
    const uid = me();
    demoStore.update((state) => {
      const row = state.boundaries.find((item) => item.id === id);
      if (!row || row.authorId !== uid || row.status !== "draft") throw new UserFacingError("Only a draft you wrote can be deleted.");
      state.boundaries = state.boundaries.filter((item) => item.id !== id);
    });
  },
  async ack(id, response) {
    await tick();
    const uid = me();
    guard(() => {
      const row = demoStore.get().boundaries.find((item) => item.id === id);
      if (!row || !canReadBoundary(row, uid) || !canAck(row, uid)) throw new Error("You can respond only to a boundary your partner shared.");
      demoStore.update((state) => {
        const existing = state.boundaryAcks.find((ack) => ack.boundaryId === id && ack.userId === uid);
        if (existing) {
          existing.response = response;
          existing.createdAt = nowIso();
        } else state.boundaryAcks.push({ boundaryId: id, userId: uid, response, createdAt: nowIso() });
      });
    });
  },
  async markSeen() {
    const uid = me();
    demoStore.update((state) => {
      state.boundarySeen[uid] = nowIso();
    });
  },
  async propose(body) {
    await tick();
    const uid = me();
    const couple = myCouple();
    const text = body.trim();
    if (!text || text.length > 500) throw new UserFacingError("Write the agreement in 500 characters or fewer.");
    const row: AgreementRecord = {
      id: newId(),
      coupleId: couple.id,
      status: "proposed",
      createdBy: uid,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      versions: [{ version: 1, body: text, createdBy: uid, createdAt: nowIso() }],
      acceptedBy: [uid],
    };
    demoStore.update((state) => {
      state.agreements.push(row);
    });
    return { ...row, versions: [...row.versions], acceptedBy: [...row.acceptedBy] };
  },
  async accept(id) {
    await tick();
    const uid = me();
    const couple = myCouple();
    return guard(() =>
      demoStore.update((state) => {
        const row = state.agreements.find((item) => item.id === id && item.coupleId === couple.id);
        if (!row) throw new Error("That agreement is not in your couple.");
        const next = acceptAgreement(row, uid, couple.memberIds);
        Object.assign(row, next);
        return { ...row, versions: [...row.versions], acceptedBy: [...row.acceptedBy] };
      }),
    );
  },
  async revise(id, body) {
    await tick();
    const uid = me();
    const couple = myCouple();
    const text = body.trim();
    if (!text || text.length > 500) throw new UserFacingError("Write the agreement in 500 characters or fewer.");
    return demoStore.update((state) => {
      const row = state.agreements.find((item) => item.id === id && item.coupleId === couple.id);
      if (!row || row.status === "left" || row.status === "archived") throw new UserFacingError("This agreement is closed. Its history is still here.");
      const version = (row.versions[row.versions.length - 1]?.version ?? 0) + 1;
      row.versions.push({ version, body: text, createdBy: uid, createdAt: nowIso() });
      row.acceptedBy = [uid];
      row.status = "proposed";
      row.updatedAt = nowIso();
      return { ...row, versions: [...row.versions], acceptedBy: [...row.acceptedBy] };
    });
  },
  async leave(id) {
    await tick();
    const uid = me();
    const couple = myCouple();
    return demoStore.update((state) => {
      const row = state.agreements.find((item) => item.id === id && item.coupleId === couple.id);
      if (!row) throw new UserFacingError("That agreement is not in your couple.");
      if (!couple.memberIds.includes(uid)) throw new UserFacingError("That agreement is not in your couple.");
      row.status = "left";
      row.updatedAt = nowIso();
      return { ...row, versions: [...row.versions], acceptedBy: [...row.acceptedBy] };
    });
  },
};
