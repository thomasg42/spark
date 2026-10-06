import { previousWeekStart, weekStartOf } from "@/lib/domain/dates";
import type { Backend, PulseEntry } from "../types";
import { assertPulseWeek, assertScore, clampWeeks } from "../live/pulse";
import { demoStore, me, myCouple, partnerOf, tick } from "./store";

/**
 * Demo weekly pulse (in this browser only). Same rule as the database: the
 * partner's scores for a week appear only once BOTH partners submitted that week.
 */

const copy = (p: PulseEntry): PulseEntry => ({ ...p });

export const pulse: Backend["pulse"] = {
  async history(weeks) {
    await tick(80);
    const uid = me();
    myCouple();
    const partner = partnerOf(uid);
    const since = previousWeekStart(weekStartOf(new Date()), clampWeeks(weeks) - 1);
    const all = demoStore.get().pulses.filter((p) => p.weekStart >= since);
    const mine = all.filter((p) => p.userId === uid);
    const myWeeks = new Set(mine.map((p) => p.weekStart));
    const theirs = partner ? all.filter((p) => p.userId === partner && myWeeks.has(p.weekStart)) : [];
    return [...mine, ...theirs]
      .sort((a, b) => (a.weekStart === b.weekStart ? (a.userId < b.userId ? -1 : 1) : a.weekStart < b.weekStart ? -1 : 1))
      .map(copy);
  },

  async status(weekStart) {
    await tick(60);
    assertPulseWeek(weekStart);
    const uid = me();
    myCouple();
    const partner = partnerOf(uid);
    const pulses = demoStore.get().pulses;
    return {
      iSubmitted: pulses.some((p) => p.userId === uid && p.weekStart === weekStart),
      partnerSubmitted: !!partner && pulses.some((p) => p.userId === partner && p.weekStart === weekStart),
    };
  },

  async submit(weekStart, excitement, connection) {
    await tick();
    assertPulseWeek(weekStart);
    assertScore(excitement, "excitement");
    assertScore(connection, "connection");
    const uid = me();
    myCouple();
    return demoStore.update((s) => {
      const entry: PulseEntry = { userId: uid, weekStart, excitement, connection };
      const index = s.pulses.findIndex((p) => p.userId === uid && p.weekStart === weekStart);
      if (index >= 0) s.pulses[index] = entry;
      else s.pulses.push(entry);
      return copy(entry);
    });
  },
};
