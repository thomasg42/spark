/**
 * The contract between the UI and data. Two implementations:
 *   live/  Supabase (Auth, Postgres + RLS, Storage) + Edge Functions for encryption and Claude
 *   demo/  in-browser, fake data, for the public GitHub Pages preview (nothing leaves the device)
 *
 * Both must enforce the same privacy rules: private answers are only ever returned
 * to their author; check-in answers and pulse scores are hidden from the partner
 * until both have submitted.
 */
import type { Cadence, PickableCadence } from "@/lib/domain/cadence";
import type { ActivityCategory, StoryKind } from "@/lib/domain/categories";
import type { ISODate } from "@/lib/domain/dates";
import type { SocialLevel } from "@/lib/domain/social";
import type { AnswerValue } from "@shared/questionnaires.ts";
import type { CheckinAnswers, CheckinSummary } from "@shared/checkin-questions.ts";
import type { BuddyClientContext, BuddyReply, BuddyShare, BuddyTurn, HintMoment, PartnerShare, ShareLevel, ShareTeaser } from "@shared/buddy.ts";

export type { Cadence, PickableCadence, ActivityCategory, StoryKind, ISODate, SocialLevel, AnswerValue, CheckinAnswers, CheckinSummary };
export type { BuddyClientContext, BuddyReply, BuddyShare, BuddyTurn, HintMoment, PartnerShare, ShareLevel, ShareTeaser };

export type AccentTheme = "rose" | "plum" | "ocean" | "sunset" | "forest";
export type ColorMode = "system" | "light" | "dark";

export interface SessionUser {
  id: string;
  email: string | null;
}

export interface Profile {
  userId: string;
  displayName: string;
  nickname: string | null;
  birthday: ISODate;
  birthTime: string | null; // HH:MM
  birthPlace: string | null;
  accentTheme: AccentTheme;
  colorMode: ColorMode;
  preferredCadence: PickableCadence;
  socialSharing: SocialLevel | null;
}

export type ProfileInput = Omit<Profile, "userId"> & { adultConfirmed: true };
export type ProfilePatch = Partial<Omit<Profile, "userId" | "birthday">>;

export interface Couple {
  id: string;
  createdBy: string | null;
  city: string | null;
  togetherSince: ISODate | null;
  cadenceReviewedAt: string; // ISO timestamp
  inviteCode: string | null;
  inviteExpiresAt: string | null;
  memberIds: string[];
}

export type MediaFolder = "story" | "activities" | "moments";

export interface StoryEntry {
  id: string;
  kind: StoryKind;
  title: string;
  happenedOn: ISODate | null;
  body: string | null;
  photoPath: string | null;
  remindYearly: boolean;
  authorId: string | null;
  createdAt: string;
}

export interface StoryInput {
  kind: StoryKind;
  title: string;
  happenedOn: ISODate | null;
  body: string | null;
  remindYearly: boolean;
  photo?: File | null; // new photo to upload
  removePhoto?: boolean;
}

export interface SavedAnswer {
  questionId: string;
  section: string;
  value: AnswerValue | null; // null when skipped
  skipped: boolean;
  updatedAt: string;
}

export interface PulseEntry {
  userId: string;
  weekStart: ISODate;
  excitement: number;
  connection: number;
  /** When this entry was last saved (ISO timestamp); drives the quick check-in pop-up. */
  updatedAt?: string;
}

export interface PulseWeekStatus {
  iSubmitted: boolean;
  partnerSubmitted: boolean;
}

export interface CheckinView {
  period: string; // YYYY-MM
  checkinId: string | null;
  iSubmitted: boolean;
  partnerSubmitted: boolean;
  revealed: boolean;
  mine: CheckinAnswers | null;
  partner: CheckinAnswers | null; // only ever non-null once revealed
  summary: CheckinSummary | null; // only once revealed
}

export interface AppreciationNote {
  id: string;
  authorId: string | null;
  body: string;
  createdAt: string;
}

export interface Activity {
  id: string;
  title: string;
  happenedOn: ISODate;
  category: ActivityCategory;
  note: string | null;
  photoPath: string | null;
  createdBy: string | null;
  sourceIdeaId: string | null;
  ratings: Record<string, number>; // userId -> 1..5
  createdAt: string;
}

export interface ActivityInput {
  title: string;
  happenedOn: ISODate;
  category: ActivityCategory;
  note?: string | null;
  photo?: File | null;
  sourceIdeaId?: string | null;
}

export type IdeaStatus = "new" | "saved" | "done" | "dismissed";

export interface DateIdea {
  id: string;
  batchId: string;
  title: string;
  description: string;
  category: ActivityCategory;
  budget: "free" | "$" | "$$" | "$$$";
  duration: "quick" | "evening" | "half_day" | "full_day";
  timeOfDay: "morning" | "afternoon" | "evening" | "any";
  weather: "indoor" | "outdoor" | "either";
  why: string | null;
  source: "claude" | "fallback";
  status: IdeaStatus;
  createdAt: string;
}

export interface IdeaBatch {
  ideas: DateIdea[];
  /** Plain-language note when ideas came from the non-AI fallback, else null. */
  notice: string | null;
}

export type MomentKind = "photo" | "video" | "link" | "note";
export type Reaction = "heart" | "laugh" | "fire" | "wow" | "hug";

export interface Moment {
  id: string;
  authorId: string | null;
  kind: MomentKind;
  caption: string | null;
  mediaPath: string | null;
  mediaMime: string | null;
  linkUrl: string | null;
  createdAt: string;
  reactions: Record<string, Reaction>; // userId -> reaction
}

export type MomentInput =
  | { kind: "photo" | "video"; file: File; caption?: string | null }
  | { kind: "link"; url: string; caption?: string | null }
  | { kind: "note"; caption: string };

/** A day on the couple's shared calendar (date nights and plans, usually made with Spark Buddy). */
export interface DatePlan {
  id: string;
  title: string;
  plannedFor: ISODate;
  time: string | null; // HH:MM
  note: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface DatePlanInput {
  title: string;
  plannedFor: ISODate;
  time?: string | null;
  note?: string | null;
}

/** A standing date night (Module E): the same night every week. Both partners see it. */
export interface DateRule {
  id: string;
  title: string;
  /** 0 = Sunday .. 6 = Saturday. */
  weekday: number;
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  note: string | null;
  /** Paused rules stay listed but don't come around. */
  active: boolean;
  createdBy: string | null;
  createdAt: string;
}

export interface DateRuleInput {
  title: string;
  weekday: number;
  startTime: string;
  endTime: string;
  note?: string | null;
}

/** trip / work_stretch are time apart: they let "when we're apart" hints show and don't change the rhythm. */
export type LifeChangeKind = "new_job" | "new_schedule" | "move" | "other" | "trip" | "work_stretch";

export interface DistanceFlag {
  userId: string;
  raisedAt: string;
}

/** A big life change (Module E). Shared by the couple; it raises the check-in rhythm for six weeks. */
export interface LifeChangeEntry {
  id: string;
  kind: LifeChangeKind;
  happenedOn: ISODate;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface LifeChangeInput {
  kind: LifeChangeKind;
  happenedOn: ISODate;
  note?: string | null;
}

export type ProjectKind = "home" | "family" | "money" | "trip" | "other";
export type ProjectStatus = "planned" | "active" | "done";

/** A shared couple project, ranked 1..N so you both agree on what comes first. */
export interface Project {
  id: string;
  title: string;
  kind: ProjectKind;
  status: ProjectStatus;
  rank: number; // 1 = top priority
  targetDate: ISODate | null;
  budgetCents: number | null;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectInput {
  title: string;
  kind: ProjectKind;
  status?: ProjectStatus;
  targetDate?: ISODate | null;
  budgetCents?: number | null;
  note?: string | null;
}

/**
 * A savings goal. "joint" goals belong to both partners. "mine" goals belong to
 * one person and the partner sees them only when their owner turns on
 * visibleToPartner.
 */
export type MoneyScope = "mine" | "joint";

export interface MoneyGoal {
  id: string;
  ownerId: string | null; // the creator; for "mine" goals, the only person who can change it
  scope: MoneyScope;
  title: string;
  savedCents: number;
  targetCents: number | null;
  targetDate: ISODate | null;
  visibleToPartner: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MoneyGoalInput {
  scope: MoneyScope;
  title: string;
  savedCents?: number;
  targetCents?: number | null;
  targetDate?: ISODate | null;
  visibleToPartner?: boolean;
}

export interface BuddySendInput {
  text: string;
  /** The onboarding question the interview is asking right now, if any. */
  interviewQuestionId: string | null;
  context: BuddyClientContext;
  /**
   * The person turned on AI for their Buddy on this device. Without it, nothing
   * they say or answered is sent to Claude: Buddy uses its built-in guide.
   */
  aiConsent: boolean;
}

/**
 * Why there is (or isn't) studio audio. "off" (no voice configured) and "limited"
 * (today's quota used) mean stop asking; the rest are one-offs worth retrying.
 */
export interface StudioVoiceResult {
  audio: Blob | null;
  reason: "off" | "consent" | "limited" | "crisis" | "failed" | null;
}

export interface BuddySendResult {
  reply: BuddyReply;
  /** Plain-language note when Buddy used its built-in guide instead of Claude. */
  notice: string | null;
}

export interface DemoControls {
  personas: Array<{ id: string; name: string }>;
  actingAs(): string;
  actAs(userId: string): void;
  /** fresh = two unpaired demo accounts with no data; otherwise the sample couple. */
  reset(fresh: boolean): void;
}

export interface Backend {
  readonly mode: "live" | "demo";
  readonly demo?: DemoControls;

  auth: {
    getUser(): Promise<SessionUser | null>;
    onChange(callback: (user: SessionUser | null) => void): () => void;
    sendMagicLink(email: string): Promise<void>;
    verifyEmailCode(email: string, code: string): Promise<void>;
    signInWithPassword(email: string, password: string): Promise<void>;
    /** Finishes a magic-link redirect on /auth/callback/. */
    completeRedirect(): Promise<SessionUser | null>;
    signOut(): Promise<void>;
  };

  profiles: {
    getMine(): Promise<Profile | null>;
    getPartner(): Promise<Profile | null>;
    create(input: ProfileInput): Promise<Profile>;
    update(patch: ProfilePatch): Promise<Profile>;
  };

  couple: {
    getMine(): Promise<Couple | null>;
    create(): Promise<Couple>;
    join(code: string): Promise<Couple>;
    regenerateInvite(): Promise<Couple>;
    update(patch: { city?: string | null; togetherSince?: ISODate | null }): Promise<Couple>;
    markCadenceReviewed(): Promise<Couple>;
  };

  media: {
    /** Uploads into the couple's private folder and returns the storage path. */
    upload(file: File, folder: MediaFolder): Promise<string>;
    /** Short-lived URL for displaying a stored file, or null if unavailable. */
    url(path: string): Promise<string | null>;
    remove(path: string): Promise<void>;
  };

  story: {
    list(): Promise<StoryEntry[]>;
    add(input: StoryInput): Promise<StoryEntry>;
    update(id: string, input: StoryInput): Promise<StoryEntry>;
    remove(id: string): Promise<void>;
  };

  answers: {
    /** Only ever the signed-in user's own answers. */
    list(section?: string): Promise<SavedAnswer[]>;
    save(questionId: string, value: AnswerValue): Promise<SavedAnswer>;
    skip(questionId: string): Promise<SavedAnswer>;
    clear(questionId: string): Promise<void>;
  };

  pulse: {
    /** Own entries plus the partner's entries for weeks where both submitted. */
    history(weeks: number): Promise<PulseEntry[]>;
    status(weekStart: ISODate): Promise<PulseWeekStatus>;
    submit(weekStart: ISODate, excitement: number, connection: number): Promise<PulseEntry>;
  };

  checkins: {
    get(period: string): Promise<CheckinView>;
    submit(period: string, answers: CheckinAnswers): Promise<CheckinView>;
  };

  notes: {
    list(): Promise<AppreciationNote[]>;
    send(body: string): Promise<AppreciationNote>;
    remove(id: string): Promise<void>;
  };

  activities: {
    list(): Promise<Activity[]>;
    add(input: ActivityInput): Promise<Activity>;
    rate(activityId: string, rating: number): Promise<void>;
    remove(activityId: string): Promise<void>;
  };

  ideas: {
    list(): Promise<DateIdea[]>;
    /** Five new ideas that fit the couple's vibe and are not repeats. */
    generate(): Promise<IdeaBatch>;
    setStatus(ideaId: string, status: IdeaStatus): Promise<void>;
  };

  moments: {
    list(): Promise<Moment[]>;
    add(input: MomentInput): Promise<Moment>;
    react(momentId: string, reaction: Reaction | null): Promise<void>;
    remove(momentId: string): Promise<void>;
  };

  /**
   * Spark Buddy. The partner's answers reach a Buddy ONLY through shares their
   * author marked hint or open; nothing off the table is ever returned or stored
   * where the partner's side can read it. Conversations are private to each person.
   */
  buddy: {
    history(): Promise<BuddyTurn[]>;
    send(input: BuddySendInput): Promise<BuddySendResult>;
    /** The signed-in person's own shares (what their partner's Buddy may see). */
    shares(): Promise<BuddyShare[]>;
    /** "private" removes the share; "hint" needs the approved hint text, and may wait for a moment (showWhen). */
    share(questionId: string, level: ShareLevel, hint?: string | null, showWhen?: HintMoment | null): Promise<BuddyShare | null>;
    /**
     * Module H: what your partner let you see (only on questions you've answered too,
     * and moment-only hints only while their moment is happening), and what's waiting
     * for you to answer (ids and levels only).
     */
    partnerHints(): Promise<{ shares: PartnerShare[]; teasers: ShareTeaser[] }>;
    /** With aiConsent, Claude drafts the hint; otherwise Spark's built-in wording. */
    draftHint(questionId: string, aiConsent?: boolean): Promise<{ hint: string; source: "claude" | "fallback" }>;
    clear(): Promise<void>;
    /**
     * Buddy's studio voice: renders a short piece of Buddy's reply as audio on the
     * server. Only with AI consent; resolves null when no voice is configured (or
     * in the demo), and the app then uses the device's own voice.
     */
    speak(text: string, aiConsent: boolean, mood?: "lively" | "calm"): Promise<StudioVoiceResult>;
  };

  datePlans: {
    /** Upcoming and recent plans, soonest first. */
    list(): Promise<DatePlan[]>;
    add(input: DatePlanInput): Promise<DatePlan>;
    remove(id: string): Promise<void>;
  };

  /** Standing date nights. Both see them; only the person who set one can change, pause or remove it. */
  dateRules: {
    list(): Promise<DateRule[]>;
    add(input: DateRuleInput): Promise<DateRule>;
    update(id: string, patch: Partial<DateRuleInput> & { active?: boolean }): Promise<DateRule>;
    remove(id: string): Promise<void>;
  };

  /**
   * "I'm feeling a bit distant" (Module H): raised on purpose, seen by both, lasts 14 days,
   * and lets the hints its owner set for that moment show.
   */
  distanceFlags: {
    /** Both partners' raised flags (at most one each), still within 14 days. */
    list(): Promise<DistanceFlag[]>;
    raise(): Promise<void>;
    clear(): Promise<void>;
  };

  /** Big life changes, newest first. Both see them; only the person who logged one can remove it. */
  lifeChanges: {
    list(): Promise<LifeChangeEntry[]>;
    add(input: LifeChangeInput): Promise<LifeChangeEntry>;
    remove(id: string): Promise<void>;
  };

  projects: {
    /** The couple's projects, top priority first. */
    list(): Promise<Project[]>;
    add(input: ProjectInput): Promise<Project>;
    update(id: string, patch: Partial<ProjectInput>): Promise<Project>;
    /** Moves a project one place up or down the priority list. */
    move(id: string, direction: "up" | "down"): Promise<Project[]>;
    remove(id: string): Promise<void>;
  };

  money: {
    /** Joint goals, your own goals, and your partner's goals they made visible. */
    list(): Promise<MoneyGoal[]>;
    add(input: MoneyGoalInput): Promise<MoneyGoal>;
    update(id: string, patch: Partial<Omit<MoneyGoalInput, "scope">>): Promise<MoneyGoal>;
    /** Adds (or, with a negative amount, takes out) money saved toward a goal. */
    addSaved(id: string, cents: number): Promise<MoneyGoal>;
    remove(id: string): Promise<void>;
  };
}

/** Errors with a message that is safe and friendly to show to the user. */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserFacingError";
  }
}

export function messageOf(error: unknown, fallback = "Something went wrong. Please try again."): string {
  if (error instanceof UserFacingError) return error.message;
  if (error instanceof Error && error.message && error.message.length < 200) return error.message;
  return fallback;
}
