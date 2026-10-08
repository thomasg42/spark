import { isAdult } from "@/lib/domain/dates";
import { UserFacingError, type Backend, type Profile } from "../types";
import { demoStore, me, partnerOf, tick } from "./store";

export const profiles: Backend["profiles"] = {
  async getMine() {
    await tick(60);
    return demoStore.get().profiles[me()] ?? null;
  },
  async getPartner() {
    await tick(60);
    const partner = partnerOf(me());
    return partner ? demoStore.get().profiles[partner] ?? null : null;
  },
  async create(input) {
    await tick();
    if (!input.adultConfirmed) throw new UserFacingError("Please confirm you are 18 or older.");
    if (!isAdult(input.birthday, new Date())) throw new UserFacingError("Spark is only for adults 18 and older.");
    if (!input.displayName.trim()) throw new UserFacingError("Add your name.");
    const uid = me();
    const profile: Profile = {
      userId: uid,
      displayName: input.displayName.trim().slice(0, 60),
      nickname: input.nickname?.trim() || null,
      birthday: input.birthday,
      birthTime: input.birthTime || null,
      birthPlace: input.birthPlace?.trim() || null,
      accentTheme: input.accentTheme,
      colorMode: input.colorMode,
      preferredCadence: input.preferredCadence,
      socialSharing: input.socialSharing,
    };
    demoStore.update((s) => {
      s.profiles[uid] = profile;
    });
    return profile;
  },
  async update(patch) {
    await tick(60);
    const uid = me();
    return demoStore.update((s) => {
      const existing = s.profiles[uid];
      if (!existing) throw new UserFacingError("Create your profile first.");
      const next: Profile = { ...existing };
      for (const [key, value] of Object.entries(patch)) {
        if (value !== undefined) (next as unknown as Record<string, unknown>)[key] = value;
      }
      if (patch.pronouns !== undefined) next.pronouns=patch.pronouns?.trim().slice(0,40)||null;
      if (patch.displayName !== undefined && !patch.displayName.trim()) throw new UserFacingError("Add your name.");
      s.profiles[uid] = next;
      return next;
    });
  },
};
