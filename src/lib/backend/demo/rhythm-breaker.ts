import { checkDateRule, MAX_RULES } from "@/lib/domain/date-rules";
import { checkLifeChange } from "@/lib/domain/rhythm-breaker";
import { UserFacingError, type Backend, type DateRule, type LifeChangeEntry } from "../types";
import { demoStore, me, myCouple, newId, nowIso, tick } from "./store";

/**
 * Demo standing dates and life changes (Module E). Same rules as the database:
 * both partners see everything; only the person who set or logged an entry can
 * change, pause or remove it; at most five standing dates.
 */

const copyRule = (r: DateRule): DateRule => ({ ...r });
const copyChange = (c: LifeChangeEntry): LifeChangeEntry => ({ ...c });

export const dateRules: Backend["dateRules"] = {
  async list() {
    await tick(60);
    myCouple();
    return [...demoStore.get().dateRules].sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime)).map(copyRule);
  },
  async add(input) {
    await tick();
    const clean = checkDateRule(input);
    const uid = me();
    myCouple();
    if (demoStore.get().dateRules.length >= MAX_RULES) throw new UserFacingError(`You already have ${MAX_RULES} standing dates. Remove one first.`);
    const rule: DateRule = { id: newId(), ...clean, active: true, createdBy: uid, createdAt: nowIso() };
    demoStore.update((s) => {
      s.dateRules.push(rule);
    });
    return copyRule(rule);
  },
  async update(id, patch) {
    await tick();
    const uid = me();
    myCouple();
    return demoStore.update((s) => {
      const rule = s.dateRules.find((r) => r.id === id);
      if (!rule || rule.createdBy !== uid) throw new UserFacingError("Only the person who set a standing date can change it.");
      const clean = checkDateRule({ ...rule, ...patch });
      Object.assign(rule, clean, patch.active === undefined ? {} : { active: patch.active === true });
      return copyRule(rule);
    });
  },
  async remove(id) {
    await tick(60);
    const uid = me();
    myCouple();
    demoStore.update((s) => {
      const i = s.dateRules.findIndex((r) => r.id === id);
      if (i < 0 || s.dateRules[i]!.createdBy !== uid) throw new UserFacingError("Only the person who set a standing date can remove it.");
      s.dateRules.splice(i, 1);
    });
  },
};

export const lifeChanges: Backend["lifeChanges"] = {
  async list() {
    await tick(60);
    myCouple();
    return [...demoStore.get().lifeChanges].sort((a, b) => b.happenedOn.localeCompare(a.happenedOn)).map(copyChange);
  },
  async add(input) {
    await tick();
    const clean = checkLifeChange(input, new Date());
    const uid = me();
    myCouple();
    const entry: LifeChangeEntry = { id: newId(), ...clean, createdBy: uid, createdAt: nowIso() };
    demoStore.update((s) => {
      s.lifeChanges.push(entry);
    });
    return copyChange(entry);
  },
  async remove(id) {
    await tick(60);
    const uid = me();
    myCouple();
    demoStore.update((s) => {
      const i = s.lifeChanges.findIndex((c) => c.id === id);
      if (i < 0 || s.lifeChanges[i]!.createdBy !== uid) throw new UserFacingError("Only the person who logged a change can remove it.");
      s.lifeChanges.splice(i, 1);
    });
  },
};
