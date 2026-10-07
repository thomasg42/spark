import { checkGoal, MONEY_MAX_CENTS } from "@/lib/domain/plans-rules";
import { UserFacingError, type Backend, type MoneyGoal } from "../types";
import { demoStore, me, myCouple, newId, nowIso, tick } from "./store";

/**
 * Demo savings goals, same rules as the database: joint goals for both; "mine"
 * goals only for their owner unless made visible, and then read-only for the partner.
 */

function canSee(goal: MoneyGoal, uid: string) {
  return goal.scope === "joint" || goal.ownerId === uid || goal.visibleToPartner;
}
function canChange(goal: MoneyGoal, uid: string) {
  return goal.scope === "joint" || goal.ownerId === uid;
}

export const money: Backend["money"] = {
  async list() {
    await tick(60);
    const uid = me();
    myCouple();
    return demoStore.get().money.filter((g) => canSee(g, uid)).map((g) => ({ ...g }));
  },
  async add(input) {
    await tick();
    const clean = checkGoal(input);
    const uid = me();
    myCouple();
    const goal: MoneyGoal = {
      id: newId(),
      ownerId: uid,
      scope: clean.scope!,
      title: clean.title!,
      savedCents: clean.savedCents ?? 0,
      targetCents: clean.targetCents ?? null,
      targetDate: clean.targetDate ?? null,
      visibleToPartner: clean.scope === "joint" ? true : (clean.visibleToPartner ?? false),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    demoStore.update((s) => {
      s.money.push(goal);
    });
    return { ...goal };
  },
  async update(id, patch) {
    await tick();
    const clean = checkGoal(patch, true);
    const uid = me();
    myCouple();
    return demoStore.update((s) => {
      const g = s.money.find((x) => x.id === id);
      if (!g || !canSee(g, uid)) throw new UserFacingError("That goal no longer exists.");
      if (!canChange(g, uid)) throw new UserFacingError("Only its owner can change this goal.");
      Object.assign(g, clean, { updatedAt: nowIso() });
      return { ...g };
    });
  },
  async addSaved(id, cents) {
    if (!Number.isInteger(cents) || cents === 0) throw new UserFacingError("Enter an amount.");
    const uid = me();
    const g = demoStore.get().money.find((x) => x.id === id);
    if (!g || !canSee(g, uid)) throw new UserFacingError("That goal no longer exists.");
    const next = g.savedCents + cents;
    if (next < 0) throw new UserFacingError("That's more than this goal has saved.");
    if (next > MONEY_MAX_CENTS) throw new UserFacingError("That amount is too large.");
    return money.update(id, { savedCents: next });
  },
  async remove(id) {
    await tick(60);
    const uid = me();
    myCouple();
    demoStore.update((s) => {
      const i = s.money.findIndex((g) => g.id === id);
      if (i < 0 || s.money[i]!.ownerId !== uid) throw new UserFacingError("Only the person who made this goal can remove it.");
      s.money.splice(i, 1);
    });
  },
};
