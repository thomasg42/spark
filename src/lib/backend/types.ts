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

export type { Cadence, PickableCadence, ActivityCategory, StoryKind, ISODate, SocialLevel, AnswerValue, CheckinAnswers, CheckinSummary };

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
