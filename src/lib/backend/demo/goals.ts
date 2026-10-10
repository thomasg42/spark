import { cleanLine, pauseChangesOnly, projectGoal, type GoalCheckin, type GoalMilestone, type GoalRecord, type GoalType } from "@shared/our-goals.ts";
import { UserFacingError, type Backend } from "../types";
import { demoStore, me, myCouple, newId, nowIso, partnerOf, tick } from "./store";

function guard<T>(fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    throw new UserFacingError(error instanceof Error ? error.message : "Could not save that.");
  }
}

function cards(): ReturnType<typeof projectGoal>[] {
  const uid = me();
  const couple = myCouple();
  const state = demoStore.get();
  const partner = partnerOf(uid);
  return state.goals
    .filter((goal) => goal.coupleId === couple.id)
    .map((goal) =>
      projectGoal({
        goal,
        drafts: state.goalDrafts.filter((draft) => draft.goalId === goal.id),
        milestones: state.goalMilestones.filter((item) => item.goalId === goal.id),
        events: state.goalEvents.filter((item) => item.goalId === goal.id),
        checkins: state.goalCheckins.filter((item) => item.goalId === goal.id),
        uid,
        partnerId: partner,
        memberIds: couple.memberIds,
      }),
    );
}

function one(id: string) {
  const card = cards().find((item) => item.id === id);
  if (!card) throw new UserFacingError("That goal is not in your couple.");
  return card;
}

export const ourGoals: Backend["ourGoals"] = {
  async list() {
    await tick(40);
    return cards();
  },
  async start(type: GoalType) {
    await tick();
    const uid = me();
    const couple = myCouple();
    const goal: GoalRecord = { id: newId(), coupleId: couple.id, type, title: "", status: "drafting", createdAt: nowIso(), updatedAt: nowIso() };
    demoStore.update((state) => {
      state.goals.push(goal);
    });
    return one(goal.id);
  },
  async submitDraft(id, input) {
    await tick();
    const uid = me();
    myCouple();
    guard(() => {
      const version = cleanLine(input.version, "your version of this goal");
      const why = cleanLine(input.why, "why it matters to you", 400);
      demoStore.update((state) => {
        const goal = state.goals.find((item) => item.id === id);
        if (!goal || goal.status === "archived") throw new Error("That goal is not open for a private version.");
        const existing = state.goalDrafts.find((draft) => draft.goalId === id && draft.authorId === uid);
        if (existing?.submittedAt) throw new Error("You already submitted your version. You can edit the shared goal after you both submit.");
        if (existing) {
          existing.version = version;
          existing.why = why;
          existing.submittedAt = nowIso();
        } else state.goalDrafts.push({ goalId: id, authorId: uid, version, why, submittedAt: nowIso() });
      });
    });
    return one(id);
  },
  async merge(id, input) {
    await tick();
    const uid = me();
    const couple = myCouple();
    const partner = partnerOf(uid);
    guard(() => {
      const title = cleanLine(input.title, "the shared goal", 160);
      if (!input.milestones.length) throw new Error("Add at least one milestone.");
      demoStore.update((state) => {
        const goal = state.goals.find((item) => item.id === id && item.coupleId === couple.id);
        if (!goal) throw new Error("That goal is not in your couple.");
        const drafts = state.goalDrafts.filter((draft) => draft.goalId === id && draft.submittedAt);
        if (!couple.memberIds.every((member) => drafts.some((draft) => draft.authorId === member))) throw new Error("Both private versions come first.");
        goal.title = title;
        goal.status = "active";
        goal.updatedAt = nowIso();
        for (const item of input.milestones) {
          const milestone: GoalMilestone = { id: newId(), goalId: id, title: cleanLine(item.title, "the milestone", 160), done: false, parts: {} };
          milestone.parts[uid] = cleanLine(item.myPart, "your part");
          if (partner) milestone.parts[partner] = cleanLine(item.partnerPart, "your partner's part");
          state.goalMilestones.push(milestone);
        }
        state.goalEvents.push({ id: newId(), goalId: id, actorId: uid, note: "Merged both versions into one shared goal.", at: nowIso() });
      });
    });
    return one(id);
  },
  async setMilestone(goalId, milestoneId, done) {
    await tick();
    const uid = me();
    demoStore.update((state) => {
      const milestone = state.goalMilestones.find((item) => item.id === milestoneId && item.goalId === goalId);
      const goal = state.goals.find((item) => item.id === goalId);
      if (!milestone || !goal || goal.status === "drafting" || goal.status === "archived") throw new UserFacingError("That milestone is not open.");
      milestone.done = done;
      goal.updatedAt = nowIso();
      if (done) state.goalEvents.push({ id: newId(), goalId, actorId: uid, note: "Milestone complete. That is worth noticing.", at: nowIso() });
    });
    return one(goalId);
  },
  async checkin(goalId, input) {
    await tick();
    const uid = me();
    const week = input.week;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) throw new UserFacingError("Pick the week this check-in belongs to.");
    const checkin: GoalCheckin = {
      goalId,
      userId: uid,
      week,
      win: cleanLine(input.win, "one win"),
      myPart: cleanLine(input.myPart, "your part this week"),
      need: cleanLine(input.need, "what you need"),
      blocker: cleanLine(input.blocker, "one blocker"),
    };
    demoStore.update((state) => {
      const goal = state.goals.find((item) => item.id === goalId);
      if (!goal || goal.status !== "active") throw new UserFacingError("Check in on an active goal.");
      state.goalCheckins = state.goalCheckins.filter((item) => !(item.goalId === goalId && item.userId === uid && item.week === week));
      state.goalCheckins.push(checkin);
    });
    return one(goalId);
  },
  async setStatus(id, status) {
    await tick();
    const uid = me();
    demoStore.update((state) => {
      const goal = state.goals.find((item) => item.id === id);
      if (!goal || goal.status === "drafting") throw new UserFacingError("Merge the goal before pausing it.");
      if (status === "paused") {
        const next = pauseChangesOnly(state.goals, id);
        const updated = next.find((item) => item.id === id)!;
        goal.status = updated.status;
      } else goal.status = status;
      goal.updatedAt = nowIso();
      state.goalEvents.push({ id: newId(), goalId: id, actorId: uid, note: status === "paused" ? "Paused. Other goals stay as they are." : status === "active" ? "Active again." : "Archived. The history stays.", at: nowIso() });
    });
    return one(id);
  },
  async rename(id, title) {
    await tick();
    const uid = me();
    const clean = cleanLine(title, "the shared goal", 160);
    demoStore.update((state) => {
      const goal = state.goals.find((item) => item.id === id);
      if (!goal || goal.status === "drafting") throw new UserFacingError("Merge the goal before editing the shared words.");
      goal.title = clean;
      goal.updatedAt = nowIso();
      state.goalEvents.push({ id: newId(), goalId: id, actorId: uid, note: "Edited the shared words.", at: nowIso() });
    });
    return one(id);
  },
};
