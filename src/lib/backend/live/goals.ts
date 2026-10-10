import { cleanLine, type GoalCard, type GoalType } from "@shared/our-goals.ts";
import { UserFacingError, type Backend } from "../types";
import { fail, requireCoupleId, requireUserId, supabase } from "./client";

async function load(): Promise<GoalCard[]> {
  const uid = await requireUserId();
  const coupleId = await requireCoupleId();
  const members = await supabase().from("couple_members").select("user_id").eq("couple_id", coupleId);
  if (members.error) fail(members.error, "Could not load your couple.");
  const memberIds = ((members.data ?? []) as Array<{ user_id: string }>).map((row) => row.user_id);
  const partnerId = memberIds.find((id) => id !== uid) ?? null;
  const goals = await supabase().from("our_goals").select("id, goal_type, title, status, created_at, updated_at").eq("couple_id", coupleId).order("created_at", { ascending: true });
  if (goals.error) fail(goals.error, "Could not load goals.");
  const ids = ((goals.data ?? []) as Array<{ id: string }>).map((row) => row.id);
  if (!ids.length) return [];
  const [drafts, milestones, parts, events, checkins] = await Promise.all([
    supabase().from("our_goal_drafts").select("goal_id, author_id, version_text, why, submitted_at").in("goal_id", ids),
    supabase().from("our_goal_milestones").select("id, goal_id, title, done").in("goal_id", ids),
    supabase().from("our_goal_parts").select("milestone_id, user_id, body"),
    supabase().from("our_goal_events").select("id, goal_id, actor_id, note, created_at").in("goal_id", ids),
    supabase().from("our_goal_checkins").select("goal_id, user_id, week, win, my_part, need, blocker").in("goal_id", ids),
  ]);
  for (const result of [drafts, milestones, parts, events, checkins]) if (result.error) fail(result.error, "Could not load goals.");
  const partRows = (parts.data ?? []) as Array<{ milestone_id: string; user_id: string; body: string }>;
  return (goals.data as Array<{ id: string; goal_type: GoalType; title: string; status: GoalCard["status"]; created_at: string; updated_at: string }>).map((goal) => {
    const goalDrafts = ((drafts.data ?? []) as Array<{ goal_id: string; author_id: string; version_text: string; why: string; submitted_at: string | null }>).filter((row) => row.goal_id === goal.id);
    const revealed = memberIds.every((id) => goalDrafts.some((row) => row.author_id === id && row.submitted_at));
    const mine = goalDrafts.find((row) => row.author_id === uid);
    const partner = revealed && partnerId ? goalDrafts.find((row) => row.author_id === partnerId) : undefined;
    const stones = ((milestones.data ?? []) as Array<{ id: string; goal_id: string; title: string; done: boolean }>).filter((row) => row.goal_id === goal.id);
    const mapped = goal.status === "drafting" ? [] : stones.map((stone) => ({
      id: stone.id,
      title: stone.title,
      done: stone.done,
      myPart: partRows.find((part) => part.milestone_id === stone.id && part.user_id === uid)?.body ?? "",
      partnerPart: partnerId ? partRows.find((part) => part.milestone_id === stone.id && part.user_id === partnerId)?.body ?? "" : "",
    }));
    return {
      id: goal.id,
      type: goal.goal_type,
      title: goal.title,
      status: goal.status,
      mine: mine ? { version: mine.version_text, why: mine.why } : null,
      partner: partner ? { version: partner.version_text, why: partner.why } : null,
      bothSubmitted: revealed,
      milestones: mapped,
      progress: mapped.length ? Math.round((mapped.filter((item) => item.done).length / mapped.length) * 100) : 0,
      history: goal.status === "drafting" ? [] : ((events.data ?? []) as Array<{ id: string; goal_id: string; actor_id: string; note: string; created_at: string }>).filter((row) => row.goal_id === goal.id).map((row) => ({ id: row.id, goalId: row.goal_id, actorId: row.actor_id, note: row.note, at: row.created_at })),
      checkins: ((checkins.data ?? []) as Array<{ goal_id: string; user_id: string; week: string; win: string; my_part: string; need: string; blocker: string }>).filter((row) => row.goal_id === goal.id).map((row) => ({ goalId: row.goal_id, userId: row.user_id, week: row.week, win: row.win, myPart: row.my_part, need: row.need, blocker: row.blocker })),
    };
  });
}

async function one(id: string): Promise<GoalCard> {
  const card = (await load()).find((item) => item.id === id);
  if (!card) throw new UserFacingError("That goal is not in your couple.");
  return card;
}

function line(value: string, label: string, max?: number): string {
  try {
    return cleanLine(value, label, max);
  } catch (error) {
    throw new UserFacingError(error instanceof Error ? error.message : "Could not save that.");
  }
}

export const ourGoals: Backend["ourGoals"] = {
  list: load,
  async start(type) {
    const uid = await requireUserId();
    const coupleId = await requireCoupleId();
    const { data, error } = await supabase().from("our_goals").insert({ couple_id: coupleId, created_by: uid, goal_type: type, title: "", status: "drafting" }).select("id").single();
    if (error) fail(error, "Could not start that goal.");
    return one(data.id as string);
  },
  async submitDraft(id, input) {
    const uid = await requireUserId();
    const version = line(input.version, "your version of this goal");
    const why = line(input.why, "why it matters to you", 400);
    const { error } = await supabase().from("our_goal_drafts").upsert({ goal_id: id, author_id: uid, version_text: version, why, submitted_at: new Date().toISOString() }, { onConflict: "goal_id,author_id" });
    if (error) fail(error, "Could not save your private version.");
    return one(id);
  },
  async merge(id, input) {
    const uid = await requireUserId();
    const title = line(input.title, "the shared goal", 160);
    if (!input.milestones.length) throw new UserFacingError("Add at least one milestone.");
    const drafts = await supabase().from("our_goal_drafts").select("author_id, submitted_at").eq("goal_id", id);
    if (drafts.error) fail(drafts.error, "Could not check both versions.");
    if (((drafts.data ?? []) as Array<{ submitted_at: string | null }>).filter((row) => row.submitted_at).length < 2) throw new UserFacingError("Both private versions come first.");
    const opened = await supabase().from("our_goals").update({ title, status: "active" }).eq("id", id).eq("status", "drafting").select("id");
    if (opened.error) fail(opened.error, "Could not merge that goal.");
    if (!opened.data?.length) throw new UserFacingError("Both private versions come first, and the goal needs to still be open.");
    for (const item of input.milestones) {
      const created = await supabase().from("our_goal_milestones").insert({ goal_id: id, title: line(item.title, "the milestone", 160), done: false }).select("id").single();
      if (created.error) fail(created.error, "Could not add that milestone.");
      const partner = await supabase().from("couple_members").select("user_id").neq("user_id", uid);
      if (partner.error) fail(partner.error, "Could not add each person's part.");
      const partnerId = ((partner.data ?? []) as Array<{ user_id: string }>)[0]?.user_id;
      const parts = [{ milestone_id: created.data.id as string, user_id: uid, body: line(item.myPart, "your part") }];
      if (partnerId) parts.push({ milestone_id: created.data.id as string, user_id: partnerId, body: line(item.partnerPart, "your partner's part") });
      const saved = await supabase().from("our_goal_parts").insert(parts);
      if (saved.error) fail(saved.error, "Could not save each person's part.");
    }
    const event = await supabase().from("our_goal_events").insert({ goal_id: id, actor_id: uid, note: "Merged both versions into one shared goal." });
    if (event.error) fail(event.error, "Could not record that edit.");
    return one(id);
  },
  async setMilestone(goalId, milestoneId, done) {
    const uid = await requireUserId();
    const { error } = await supabase().from("our_goal_milestones").update({ done }).eq("id", milestoneId).eq("goal_id", goalId);
    if (error) fail(error, "Could not update that milestone.");
    if (done) await supabase().from("our_goal_events").insert({ goal_id: goalId, actor_id: uid, note: "Milestone complete. That is worth noticing." });
    return one(goalId);
  },
  async checkin(goalId, input) {
    const uid = await requireUserId();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.week)) throw new UserFacingError("Pick the week this check-in belongs to.");
    const { error } = await supabase().from("our_goal_checkins").upsert({
      goal_id: goalId,
      user_id: uid,
      week: input.week,
      win: line(input.win, "one win"),
      my_part: line(input.myPart, "your part this week"),
      need: line(input.need, "what you need"),
      blocker: line(input.blocker, "one blocker"),
    }, { onConflict: "goal_id,user_id,week" });
    if (error) fail(error, "Could not save this week's check-in.");
    return one(goalId);
  },
  async setStatus(id, status) {
    const uid = await requireUserId();
    const { error } = await supabase().from("our_goals").update({ status }).eq("id", id).neq("status", "drafting");
    if (error) fail(error, "Could not update that goal.");
    const note = status === "paused" ? "Paused. Other goals stay as they are." : status === "active" ? "Active again." : "Archived. The history stays.";
    await supabase().from("our_goal_events").insert({ goal_id: id, actor_id: uid, note });
    return one(id);
  },
  async rename(id, title) {
    const uid = await requireUserId();
    const { error } = await supabase().from("our_goals").update({ title: line(title, "the shared goal", 160) }).eq("id", id).neq("status", "drafting");
    if (error) fail(error, "Could not edit the shared words.");
    await supabase().from("our_goal_events").insert({ goal_id: id, actor_id: uid, note: "Edited the shared words." });
    return one(id);
  },
};
