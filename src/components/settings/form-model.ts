/**
 * Pure form helpers for Settings: turn a Profile/Couple into editable strings,
 * validate them against the database limits, and build the smallest normalized
 * patch to save. Limits mirror supabase/migrations/20261006000100_spark_core.sql.
 */
import type { Couple, ISODate, Profile, ProfilePatch } from "@/lib/backend/types";
import { parseISODate, toISODate } from "@/lib/domain/dates";

export const LIMITS = { displayName: 60, nickname: 40, birthPlace: 120, city: 80 } as const;

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export interface ProfileFormValues {
  displayName: string;
  nickname: string;
  birthTime: string; // "" or HH:MM
  birthPlace: string;
}

export type FormErrors<T> = Partial<Record<keyof T, string>>;

export function profileFormFrom(p: Profile): ProfileFormValues {
  return {
    displayName: p.displayName,
    nickname: p.nickname ?? "",
    birthTime: p.birthTime ?? "",
    birthPlace: p.birthPlace ?? "",
  };
}

export function validateProfileForm(v: ProfileFormValues): FormErrors<ProfileFormValues> {
  const errors: FormErrors<ProfileFormValues> = {};
  const name = v.displayName.trim();
  if (!name) errors.displayName = "Add the name your partner knows you by.";
  else if (name.length > LIMITS.displayName) errors.displayName = `Keep it to ${LIMITS.displayName} characters or fewer.`;
  if (v.nickname.trim().length > LIMITS.nickname) errors.nickname = `Keep it to ${LIMITS.nickname} characters or fewer.`;
  if (v.birthTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(v.birthTime)) errors.birthTime = "Use a time like 07:30.";
  if (v.birthPlace.trim().length > LIMITS.birthPlace) errors.birthPlace = `Keep it to ${LIMITS.birthPlace} characters or fewer.`;
  return errors;
}

const orNull = (s: string) => s.trim() || null;

/** Only the fields that changed, trimmed, with blanks saved as null. */
export function profilePatchFrom(v: ProfileFormValues, current: Profile): ProfilePatch {
  const patch: ProfilePatch = {};
  const displayName = v.displayName.trim();
  if (displayName !== current.displayName) patch.displayName = displayName;
  const nickname = orNull(v.nickname);
  if (nickname !== (current.nickname ?? null)) patch.nickname = nickname;
  const birthTime = v.birthTime || null;
  if (birthTime !== (current.birthTime ?? null)) patch.birthTime = birthTime;
  const birthPlace = orNull(v.birthPlace);
  if (birthPlace !== (current.birthPlace ?? null)) patch.birthPlace = birthPlace;
  return patch;
}

export function isProfileFormDirty(v: ProfileFormValues, current: Profile): boolean {
  return Object.keys(profilePatchFrom(v, current)).length > 0;
}

// ---------------------------------------------------------------------------
// Couple
// ---------------------------------------------------------------------------

export interface CoupleFormValues {
  city: string;
  togetherSince: string; // "" or YYYY-MM-DD
}

export type CouplePatch = { city?: string | null; togetherSince?: ISODate | null };

export function coupleFormFrom(c: Couple): CoupleFormValues {
  return { city: c.city ?? "", togetherSince: c.togetherSince ?? "" };
}

export function validateCoupleForm(v: CoupleFormValues, today: Date): FormErrors<CoupleFormValues> {
  const errors: FormErrors<CoupleFormValues> = {};
  if (v.city.trim().length > LIMITS.city) errors.city = `Keep it to ${LIMITS.city} characters or fewer.`;
  if (v.togetherSince) {
    let date: Date | null = null;
    try {
      date = parseISODate(v.togetherSince);
    } catch {
      date = null;
    }
    if (!date || toISODate(date) !== v.togetherSince) errors.togetherSince = "Pick a real date.";
    else if (v.togetherSince > toISODate(today)) errors.togetherSince = "Pick a date that has already happened.";
    else if (date.getFullYear() < 1900) errors.togetherSince = "Pick a real date.";
  }
  return errors;
}

export function couplePatchFrom(v: CoupleFormValues, current: Couple): CouplePatch {
  const patch: CouplePatch = {};
  const city = orNull(v.city);
  if (city !== (current.city ?? null)) patch.city = city;
  const togetherSince = v.togetherSince || null;
  if (togetherSince !== (current.togetherSince ?? null)) patch.togetherSince = togetherSince;
  return patch;
}

export function isCoupleFormDirty(v: CoupleFormValues, current: Couple): boolean {
  return Object.keys(couplePatchFrom(v, current)).length > 0;
}

export const hasErrors = (errors: Record<string, unknown>) => Object.values(errors).some(Boolean);
