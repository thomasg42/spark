import { CHECKIN_QUESTIONS, normalizeCheckinAnswers, type CheckinAnswers } from "@shared/checkin-questions.ts";
import { fallbackSummary } from "@shared/checkin-summary.ts";
import { UserFacingError, type Backend, type CheckinView } from "../types";
import { assertCheckinPeriod, type CheckinHistoryEntry } from "../live/checkins";
import { demoStore, me, myCouple, newId, partnerOf, tick, type DemoCheckin, type DemoState } from "./store";

/**
 * Demo monthly check-in (in this browser only). Same rules as the database and the
 * Edge Function: answers are final once submitted, the partner's answers are never
 * returned until BOTH submitted, and the summary is created once at reveal. The demo
 * never calls an AI service, so its summary is the labelled non-AI fallback.
 */

const copyAnswers = (a: CheckinAnswers | undefined | null): CheckinAnswers | null => (a ? { ...a } : null);

function nameIn(s: DemoState, userId: string): string {
  const p = s.profiles[userId];
  return p?.nickname || p?.displayName || "Your partner";
}

/**
 * Like ensure_checkin(): opens the couple's check-in for a period if needed. Writes
 * (and so notifies listeners) only when it is missing, so reads stay side-effect free.
 */
function ensure(period: string): DemoCheckin {
  const existing = demoStore.get().checkins.find((c) => c.period === period);
  if (existing) return existing;
  return demoStore.update((s) => {
    let found = s.checkins.find((c) => c.period === period);
    if (!found) {
      found = { id: newId(), period, responses: {}, summary: null };
      s.checkins.push(found);
    }
    return found;
  });
}

function buildView(period: string): CheckinView {
  const uid = me();
  myCouple();
  const partner = partnerOf(uid);
  const checkin = ensure(period);
  const mine = checkin.responses[uid];
  const theirs = partner ? checkin.responses[partner] : undefined;
  const revealed = !!mine && !!theirs;

  if (revealed && !checkin.summary && partner) {
    // Stable order by user id, like the Edge Function. First writer wins.
    demoStore.update((s) => {
      const target = s.checkins.find((c) => c.id === checkin.id);
      if (!target || target.summary) return;
      const [a, b] = [uid, partner].sort();
      target.summary = fallbackSummary(CHECKIN_QUESTIONS, nameIn(s, a!), target.responses[a!]!, nameIn(s, b!), target.responses[b!]!);
    });
  }
  const summary = revealed ? (demoStore.get().checkins.find((c) => c.id === checkin.id)?.summary ?? null) : null;

  return {
    period,
    checkinId: checkin.id,
    iSubmitted: !!mine,
    partnerSubmitted: !!theirs,
    revealed,
    mine: copyAnswers(mine),
    partner: revealed ? copyAnswers(theirs) : null,
    summary: summary ? { ...summary, overlaps: [...summary.overlaps], gaps: [...summary.gaps] } : null,
  };
}

export const checkins: Backend["checkins"] = {
  async get(period) {
    await tick(100);
    assertCheckinPeriod(period);
    return buildView(period);
  },

  async submit(period, answers) {
    await tick();
    assertCheckinPeriod(period);
    let clean: CheckinAnswers;
    try {
      clean = normalizeCheckinAnswers(answers);
    } catch (error) {
      throw new UserFacingError(error instanceof Error ? error.message : "Check your answers and try again.");
    }
    const uid = me();
    myCouple();
    const checkin = ensure(period);
    demoStore.update((s) => {
      const target = s.checkins.find((c) => c.id === checkin.id)!;
      if (target.responses[uid]) throw new UserFacingError("You already submitted this month.");
      target.responses[uid] = clean;
    });
    return buildView(period);
  },
};

/** Demo counterpart of live checkinHistory(): months with a check-in, newest first. */
export async function checkinHistory(limit = 12): Promise<CheckinHistoryEntry[]> {
  await tick(60);
  const uid = me();
  myCouple();
  const partner = partnerOf(uid);
  return [...demoStore.get().checkins]
    .sort((a, b) => (a.period < b.period ? 1 : a.period > b.period ? -1 : 0))
    .slice(0, limit)
    .map((c) => {
      const mine = !!c.responses[uid];
      return { period: c.period, iSubmitted: mine, revealed: mine && !!partner && !!c.responses[partner] };
    });
}
