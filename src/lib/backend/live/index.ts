import type { Backend } from "../types";
import { activities } from "./activities";
import { answers } from "./answers";
import { auth } from "./auth";
import { buddy } from "./buddy";
import { checkins } from "./checkins";
import { couple } from "./couple";
import { datePlans } from "./date-plans";
import { dateRules, lifeChanges } from "./rhythm-breaker";
import { ideas } from "./ideas";
import { media } from "./media";
import { moments } from "./moments";
import { money } from "./money";
import { notes } from "./notes";
import { profiles } from "./profiles";
import { projects } from "./projects";
import { pulse } from "./pulse";
import { story } from "./story";

export function createLiveBackend(): Backend {
  return { mode: "live", auth, profiles, couple, media, story, answers, pulse, checkins, notes, activities, ideas, moments, buddy, datePlans, dateRules, lifeChanges, projects, money };
}
