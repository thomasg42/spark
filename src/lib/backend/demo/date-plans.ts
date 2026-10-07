import { checkDatePlan } from "@/lib/domain/plans-rules";
import { UserFacingError, type Backend, type DatePlan } from "../types";
import { demoStore, me, myCouple, newId, nowIso, tick } from "./store";

/** Demo shared calendar: both partners see it; only the creator can remove a plan. */

const soonest = (a: DatePlan, b: DatePlan) => a.plannedFor.localeCompare(b.plannedFor) || (a.time ?? "99").localeCompare(b.time ?? "99");

export const datePlans: Backend["datePlans"] = {
  async list() {
    await tick(60);
    myCouple();
    return [...demoStore.get().datePlans].sort(soonest).map((p) => ({ ...p }));
  },
  async add(input) {
    await tick();
    const clean = checkDatePlan(input);
    const uid = me();
    myCouple();
    const plan: DatePlan = { id: newId(), title: clean.title, plannedFor: clean.plannedFor, time: clean.time, note: clean.note, createdBy: uid, createdAt: nowIso() };
    demoStore.update((s) => {
      s.datePlans.push(plan);
    });
    return { ...plan };
  },
  async remove(id) {
    await tick(60);
    const uid = me();
    myCouple();
    demoStore.update((s) => {
      const i = s.datePlans.findIndex((p) => p.id === id);
      if (i < 0 || s.datePlans[i]!.createdBy !== uid) throw new UserFacingError("Only the person who added a plan can remove it.");
      s.datePlans.splice(i, 1);
    });
  },
};
