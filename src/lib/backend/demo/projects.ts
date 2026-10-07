import { checkProject } from "@/lib/domain/plans-rules";
import { UserFacingError, type Backend, type Project } from "../types";
import { demoStore, me, myCouple, newId, nowIso, tick } from "./store";

/** Demo shared projects: either partner can add, edit, reorder or remove. */

const byRank = (a: Project, b: Project) => a.rank - b.rank || a.createdAt.localeCompare(b.createdAt);
const sorted = () => [...demoStore.get().projects].sort(byRank).map((p) => ({ ...p }));

export const projects: Backend["projects"] = {
  async list() {
    await tick(60);
    myCouple();
    return sorted();
  },
  async add(input) {
    await tick();
    const clean = checkProject(input);
    const uid = me();
    myCouple();
    const project: Project = {
      id: newId(),
      title: clean.title!,
      kind: clean.kind!,
      status: clean.status ?? "planned",
      rank: demoStore.get().projects.reduce((max, p) => Math.max(max, p.rank), 0) + 1,
      targetDate: clean.targetDate ?? null,
      budgetCents: clean.budgetCents ?? null,
      note: clean.note ?? null,
      createdBy: uid,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    demoStore.update((s) => {
      s.projects.push(project);
    });
    return { ...project };
  },
  async update(id, patch) {
    await tick();
    const clean = checkProject(patch, true);
    myCouple();
    return demoStore.update((s) => {
      const p = s.projects.find((x) => x.id === id);
      if (!p) throw new UserFacingError("That project no longer exists.");
      Object.assign(p, clean, { updatedAt: nowIso() });
      return { ...p };
    });
  },
  async move(id, direction) {
    await tick(60);
    myCouple();
    demoStore.update((s) => {
      const list = [...s.projects].sort(byRank);
      const i = list.findIndex((p) => p.id === id);
      if (i < 0) throw new UserFacingError("That project no longer exists.");
      const j = direction === "up" ? i - 1 : i + 1;
      if (j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j]!, list[i]!];
      list.forEach((p, index) => {
        p.rank = index + 1;
      });
    });
    return sorted();
  },
  async remove(id) {
    await tick(60);
    myCouple();
    demoStore.update((s) => {
      const i = s.projects.findIndex((p) => p.id === id);
      if (i < 0) throw new UserFacingError("That project no longer exists.");
      s.projects.splice(i, 1);
    });
  },
};
