/**
 * Demo mode store: everything lives in this browser (localStorage for data,
 * IndexedDB for uploaded photos/clips). Nothing is sent anywhere. Used for the
 * public preview so the app can be explored before a Supabase project exists.
 *
 * Every demo module must enforce the SAME privacy rules as the database:
 *   - private answers: only returned to their author
 *   - check-in answers and pulse scores: partner's hidden until both submitted
 */
import {
  UserFacingError,
  type Activity,
  type AppreciationNote,
  type CheckinAnswers,
  type CheckinSummary,
  type Couple,
  type BuddyShare,
  type BuddyTurn,
  type DateIdea,
  type DatePlan,
  type DateRule,
  type LifeChangeEntry,
  type Moment,
  type MoneyGoal,
  type Project,
  type Profile,
  type PulseEntry,
  type SavedAnswer,
  type StoryEntry,
} from "../types";
import { buildSeed, DEMO_ALEX, DEMO_SAM, freshState } from "./seed";

export interface DemoCheckin {
  id: string;
  period: string;
  responses: Record<string, CheckinAnswers>;
  summary: CheckinSummary | null;
}

export interface DemoState {
  version: 4;
  signedIn: boolean;
  actingAs: string;
  personas: Array<{ id: string; name: string; email: string }>;
  profiles: Record<string, Profile>;
  couple: Couple | null;
  story: StoryEntry[];
  answers: Record<string, SavedAnswer[]>;
  pulses: PulseEntry[];
  checkins: DemoCheckin[];
  notes: AppreciationNote[];
  activities: Activity[];
  ideas: DateIdea[];
  moments: Moment[];
  /** Per person: what their partner's Buddy may see (hint/open only). */
  buddyShares: Record<string, BuddyShare[]>;
  /** Per person: their private conversation with their own Buddy. */
  buddyChats: Record<string, BuddyTurn[]>;
  datePlans: DatePlan[];
  /** Standing date nights (Module E). */
  dateRules: DateRule[];
  /** Big life changes (Module E). */
  lifeChanges: LifeChangeEntry[];
  projects: Project[];
  money: MoneyGoal[];
}

const STORAGE_KEY = "spark-demo-v4";
let state: DemoState | null = null;
const listeners = new Set<() => void>();

function load(): DemoState {
  if (state) return state;
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw) as DemoState;
      if (parsed && parsed.version === 4) {
        // Added 2026-10-08 (Module E): older saved demos simply start with none.
        parsed.dateRules ??= [];
        parsed.lifeChanges ??= [];
        state = parsed;
        return state;
      }
    }
  } catch {
    // Private mode or blocked storage: fall through to an in-memory seed.
  }
  state = buildSeed(new Date());
  persist();
  return state;
}

function persist() {
  try {
    if (state && typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Quota or blocked storage: the demo keeps working in memory.
  }
}

export const demoStore = {
  get(): DemoState {
    return load();
  },
  /** Applies a mutation, persists, and notifies listeners. */
  update<T>(mutate: (s: DemoState) => T): T {
    const s = load();
    const result = mutate(s);
    persist();
    listeners.forEach((l) => l());
    return result;
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  reset(fresh: boolean) {
    state = fresh ? freshState() : buildSeed(new Date());
    persist();
    listeners.forEach((l) => l());
  },
};

/** The demo persona currently "signed in". */
export function me(): string {
  const s = load();
  if (!s.signedIn) throw new UserFacingError("Choose a demo partner to continue.");
  return s.actingAs;
}

export function partnerOf(userId: string): string | null {
  const c = load().couple;
  if (!c || !c.memberIds.includes(userId)) return null;
  return c.memberIds.find((id) => id !== userId) ?? null;
}

/** The couple of the acting persona, only once both partners have joined. */
export function myCouple(): Couple {
  const s = load();
  const uid = me();
  if (!s.couple || !s.couple.memberIds.includes(uid)) throw new UserFacingError("Pair with your partner first.");
  return s.couple;
}

export function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export const nowIso = () => new Date().toISOString();

/** Simulates a network round trip so loading states are exercised in the demo. */
export const tick = (ms = 120) => new Promise((resolve) => setTimeout(resolve, ms));

export { DEMO_ALEX, DEMO_SAM };
