import { UserFacingError, type AttentionSignal, type Backend } from "../types";
import { demoStore, me, myCouple, newId, nowIso, tick } from "./store";

const unavailable = () => new UserFacingError("That attention request is not available.");

function viewer() {
  const userId = me();
  const couple = myCouple();
  if (couple.memberIds.length !== 2) throw new UserFacingError("Pair with your partner first.");
  return { userId, coupleId: couple.id };
}

function stillViewing(expected: ReturnType<typeof viewer>) {
  const current = viewer();
  if (current.userId !== expected.userId || current.coupleId !== expected.coupleId) {
    throw new UserFacingError("Your account changed. Please try again.");
  }
}

function mutationViewer(expectedViewerId: string) {
  const current = viewer();
  if (current.userId !== expectedViewerId) throw new UserFacingError("Your account changed. Please try again.");
  return current;
}

export const attention: Backend["attention"] = {
  async list() {
    const current = viewer();
    await tick(60);
    stillViewing(current);
    return demoStore.get().attentionSignals
      .filter((signal) => signal.coupleId === current.coupleId && signal.resolvedAt === null)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
      .map((signal) => ({ ...signal }));
  },
  async raise(subject, expectedViewerId) {
    if (subject !== "self" && subject !== "partner") throw new UserFacingError("Choose yourself or your partner.");
    const current = mutationViewer(expectedViewerId);
    await tick();
    stillViewing(current);
    const exists = demoStore.get().attentionSignals.some((signal) => signal.coupleId === current.coupleId
      && signal.authorId === current.userId && signal.subject === subject && signal.resolvedAt === null);
    if (exists) return;
    const signal: AttentionSignal = {
      id: newId(), coupleId: current.coupleId, authorId: current.userId, subject,
      createdAt: nowIso(), acknowledgedAt: null, resolvedAt: null,
    };
    demoStore.update((state) => { state.attentionSignals.push(signal); });
  },
  async acknowledge(id, expectedViewerId) {
    const current = mutationViewer(expectedViewerId);
    await tick();
    stillViewing(current);
    const signal = demoStore.get().attentionSignals.find((item) => item.id === id && item.coupleId === current.coupleId);
    if (!signal || signal.authorId === current.userId || signal.resolvedAt !== null) throw unavailable();
    if (signal.acknowledgedAt !== null) return;
    demoStore.update(() => { signal.acknowledgedAt = nowIso(); });
  },
  async resolve(id, expectedViewerId) {
    const current = mutationViewer(expectedViewerId);
    await tick();
    stillViewing(current);
    const signal = demoStore.get().attentionSignals.find((item) => item.id === id && item.coupleId === current.coupleId);
    if (!signal || signal.authorId !== current.userId) throw unavailable();
    if (signal.resolvedAt !== null) return;
    demoStore.update(() => { signal.resolvedAt = nowIso(); });
  },
  subscribe(onChange) {
    return demoStore.subscribe(onChange);
  },
};
