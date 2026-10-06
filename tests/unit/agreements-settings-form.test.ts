import {
  couplePatchFrom,
  coupleFormFrom,
  hasErrors,
  isCoupleFormDirty,
  isProfileFormDirty,
  profileFormFrom,
  profilePatchFrom,
  validateCoupleForm,
  validateProfileForm,
} from "@/components/settings/form-model";
import type { Couple, Profile } from "@/lib/backend/types";

const profile: Profile = {
  userId: "u1",
  displayName: "Alex",
  nickname: "Al",
  birthday: "1994-05-17",
  birthTime: null,
  birthPlace: null,
  accentTheme: "rose",
  colorMode: "system",
  preferredCadence: "weekly",
  socialSharing: "milestones",
};

const couple: Couple = {
  id: "c1",
  createdBy: "u1",
  city: "Bozeman, MT",
  togetherSince: "2024-10-18",
  cadenceReviewedAt: "2026-08-27T19:15:00.000Z",
  inviteCode: null,
  inviteExpiresAt: null,
  memberIds: ["u1", "u2"],
};

describe("profile form", () => {
  it("round-trips a profile into editable strings", () => {
    expect(profileFormFrom(profile)).toEqual({ displayName: "Alex", nickname: "Al", birthTime: "", birthPlace: "" });
    expect(isProfileFormDirty(profileFormFrom(profile), profile)).toBe(false);
    expect(profilePatchFrom(profileFormFrom(profile), profile)).toEqual({});
  });

  it("only sends changed fields, trimmed, with blanks as null", () => {
    const patch = profilePatchFrom({ displayName: "  Alex  ", nickname: "  ", birthTime: "07:30", birthPlace: " Lisbon, Portugal " }, profile);
    expect(patch).toEqual({ nickname: null, birthTime: "07:30", birthPlace: "Lisbon, Portugal" });
  });

  it("never includes the birthday in a patch", () => {
    const patch = profilePatchFrom({ displayName: "Alexandra", nickname: "Al", birthTime: "", birthPlace: "" }, profile);
    expect(patch).toEqual({ displayName: "Alexandra" });
    expect("birthday" in patch).toBe(false);
  });

  it("validates against the database limits", () => {
    expect(validateProfileForm({ displayName: "  ", nickname: "", birthTime: "", birthPlace: "" }).displayName).toBeTruthy();
    expect(validateProfileForm({ displayName: "x".repeat(61), nickname: "", birthTime: "", birthPlace: "" }).displayName).toBeTruthy();
    expect(validateProfileForm({ displayName: "A", nickname: "n".repeat(41), birthTime: "", birthPlace: "" }).nickname).toBeTruthy();
    expect(validateProfileForm({ displayName: "A", nickname: "", birthTime: "25:00", birthPlace: "" }).birthTime).toBeTruthy();
    expect(validateProfileForm({ displayName: "A", nickname: "", birthTime: "", birthPlace: "p".repeat(121) }).birthPlace).toBeTruthy();
    expect(hasErrors(validateProfileForm({ displayName: "A", nickname: "B", birthTime: "23:59", birthPlace: "Here" }))).toBe(false);
  });
});

describe("couple form", () => {
  const today = new Date(2026, 9, 6);

  it("round-trips and detects changes", () => {
    const v = coupleFormFrom(couple);
    expect(v).toEqual({ city: "Bozeman, MT", togetherSince: "2024-10-18" });
    expect(isCoupleFormDirty(v, couple)).toBe(false);
    expect(couplePatchFrom({ ...v, city: "  Missoula, MT " }, couple)).toEqual({ city: "Missoula, MT" });
    expect(couplePatchFrom({ city: "", togetherSince: "" }, couple)).toEqual({ city: null, togetherSince: null });
  });

  it("rejects future, impossible and too-long values", () => {
    expect(validateCoupleForm({ city: "", togetherSince: "2026-10-07" }, today).togetherSince).toMatch(/already happened/);
    expect(validateCoupleForm({ city: "", togetherSince: "2026-02-30" }, today).togetherSince).toBeTruthy();
    expect(validateCoupleForm({ city: "", togetherSince: "1899-12-31" }, today).togetherSince).toBeTruthy();
    expect(validateCoupleForm({ city: "c".repeat(81), togetherSince: "" }, today).city).toBeTruthy();
    expect(hasErrors(validateCoupleForm({ city: "Bozeman, MT", togetherSince: "2026-10-06" }, today))).toBe(false);
    expect(hasErrors(validateCoupleForm({ city: "", togetherSince: "" }, today))).toBe(false);
  });
});
