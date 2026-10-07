/**
 * Gathers what the signed-in person's own app can already see, for their Buddy.
 * Nothing private to the partner can appear here: check-ins are included only
 * once revealed, partner pulses only for weeks both submitted (the backends
 * already enforce that), and money goals only as the backend returns them
 * (joint, mine, or the partner's goals they made visible). The partner's
 * opt-in shares are added on the server (live) or by the demo backend.
 */
import { loadCheckinHistory } from "@/components/checkin/history";
import type { Backend, BuddyClientContext, Couple, Profile } from "@/lib/backend/types";
import { toISODate } from "@/lib/domain/dates";

const settle = <T,>(p: Promise<T>, fallback: T) => p.then((v) => v, () => fallback);
const nameOf = (p: Profile | null) => (p ? p.nickname || p.displayName : null);

export async function buildBuddyContext(backend: Backend, args: { userId: string; profile: Profile | null; partner: Profile | null; couple: Couple | null; today?: Date }): Promise<BuddyClientContext> {
  const today = args.today ?? new Date();
  const [answers, history, pulses, activities, plans, projects, money] = await Promise.all([
    settle(backend.answers.list(), []),
    settle(loadCheckinHistory(backend, 3), []),
    settle(backend.pulse.history(8), []),
    settle(backend.activities.list(), []),
    settle(backend.datePlans.list(), []),
    settle(backend.projects.list(), []),
    settle(backend.money.list(), []),
  ]);
  const revealed = history.filter((h) => h.revealed).slice(0, 2);
  const views = await Promise.all(revealed.map((h) => settle(backend.checkins.get(h.period), null)));
  const uid = args.userId;

  return {
    today: toISODate(today),
    me: { name: nameOf(args.profile) ?? "You", birthday: args.profile?.birthday ?? null },
    partner: args.partner ? { name: nameOf(args.partner)!, birthday: args.partner.birthday } : null,
    city: args.couple?.city ?? null,
    togetherSince: args.couple?.togetherSince ?? null,
    myAnswers: answers.filter((a) => !a.skipped && a.value !== null).map((a) => ({ questionId: a.questionId, value: a.value! })),
    checkins: views.flatMap((v) => (v && v.revealed && v.mine && v.partner ? [{ period: v.period, mine: v.mine, partner: v.partner, summary: v.summary }] : [])),
    pulses: pulses.map((p) => ({ who: p.userId === uid ? ("me" as const) : ("partner" as const), weekStart: p.weekStart, excitement: p.excitement, connection: p.connection })),
    activities: activities.slice(0, 15).map((a) => ({
      title: a.title,
      happenedOn: a.happenedOn,
      category: a.category,
      myRating: a.ratings[uid] ?? null,
      partnerRating: Object.entries(a.ratings).find(([id]) => id !== uid)?.[1] ?? null,
    })),
    plans: plans.filter((p) => p.plannedFor >= toISODate(today)).slice(0, 10).map((p) => ({ title: p.title, plannedFor: p.plannedFor, time: p.time })),
    projects: projects.map((p) => ({ id: p.id, title: p.title, kind: p.kind, status: p.status, rank: p.rank, targetDate: p.targetDate, budgetCents: p.budgetCents })),
    money: money.map((g) => ({
      id: g.id,
      title: g.title,
      whose: g.scope === "joint" ? ("joint" as const) : g.ownerId === uid ? ("mine" as const) : ("partner" as const),
      savedCents: g.savedCents,
      targetCents: g.targetCents,
      targetDate: g.targetDate,
    })),
  };
}
