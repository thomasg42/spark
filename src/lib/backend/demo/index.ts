import type { Backend } from "../types";
import { activities } from "./activities";
import { answers } from "./answers";
import { auth } from "./auth";
import { buddy } from "./buddy";
import { checkins } from "./checkins";
import { couple } from "./couple";
import { datePlans } from "./date-plans";
import { dateRules, lifeChanges } from "./rhythm-breaker";
import { distanceFlags } from "./hints";
import { ideas } from "./ideas";
import { media } from "./media";
import { moments } from "./moments";
import { money } from "./money";
import { notes } from "./notes";
import { profiles } from "./profiles";
import { projects } from "./projects";
import { pulse } from "./pulse";
import { demoStore } from "./store";
import { story } from "./story";

export function createDemoBackend(): Backend {
  return {
    mode: "demo",
    demo: {
      get personas() {
        return demoStore.get().personas.map((p) => ({ id: p.id, name: demoStore.get().profiles[p.id]?.displayName ?? p.name }));
      },
      actingAs: () => demoStore.get().actingAs,
      actAs: (userId: string) =>
        demoStore.update((s) => {
          s.actingAs = userId;
          s.signedIn = true;
        }),
      reset: (fresh: boolean) => demoStore.reset(fresh),
    },
    auth,
    profiles,
    couple,
    media,
    story,
    answers,
    pulse,
    checkins,
    notes,
    activities,
    ideas,
    moments,
    buddy,
    datePlans,
    dateRules,
    lifeChanges,
    distanceFlags,
    projects,
    money,
  };
}
