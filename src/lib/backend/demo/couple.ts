import { UserFacingError, type Backend, type Couple } from "../types";
import { demoStore, me, newId, nowIso, tick } from "./store";

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const makeCode = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => ALPHABET[b % ALPHABET.length]).join("");

function mine(): Couple | null {
  const c = demoStore.get().couple;
  return c && c.memberIds.includes(me()) ? c : null;
}

function requireMine(): Couple {
  const c = mine();
  if (!c) throw new UserFacingError("Pair with your partner first.");
  return c;
}

export const couple: Backend["couple"] = {
  async getMine() {
    await tick(60);
    const c = mine();
    return c ? { ...c, memberIds: [...c.memberIds] } : null;
  },
  async create() {
    await tick();
    const uid = me();
    return demoStore.update((s) => {
      if (!s.profiles[uid]) throw new UserFacingError("Finish your profile before pairing.");
      if (s.couple?.memberIds.includes(uid)) throw new UserFacingError("You are already paired.");
      if (s.couple) throw new UserFacingError("The demo already has a couple. Reset the demo to start over.");
      const created: Couple = {
        id: newId(),
        createdBy: uid,
        city: null,
        togetherSince: null,
        cadenceReviewedAt: nowIso(),
        inviteCode: makeCode(),
        inviteExpiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        memberIds: [uid],
      };
      s.couple = created;
      return { ...created };
    });
  },
  async join(code) {
    await tick();
    const uid = me();
    const normalized = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
    return demoStore.update((s) => {
      if (!s.profiles[uid]) throw new UserFacingError("Finish your profile before pairing.");
      if (s.couple?.memberIds.includes(uid)) throw new UserFacingError("You are already paired.");
      const c = s.couple;
      if (!c || !c.inviteCode || c.inviteCode !== normalized) throw new UserFacingError("That code did not match. Check it and try again.");
      if (!c.inviteExpiresAt || new Date(c.inviteExpiresAt) < new Date()) throw new UserFacingError("That code has expired. Ask your partner for a new one.");
      if (c.memberIds.length >= 2) throw new UserFacingError("That couple already has two partners.");
      c.memberIds.push(uid);
      c.inviteCode = null;
      c.inviteExpiresAt = null;
      return { ...c, memberIds: [...c.memberIds] };
    });
  },
  async regenerateInvite() {
    await tick();
    return demoStore.update((s) => {
      const c = s.couple;
      if (!c || !c.memberIds.includes(me())) throw new UserFacingError("Create a couple first.");
      if (c.memberIds.length >= 2) throw new UserFacingError("You are already paired.");
      c.inviteCode = makeCode();
      c.inviteExpiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
      return { ...c, memberIds: [...c.memberIds] };
    });
  },
  async update(patch) {
    await tick(60);
    requireMine();
    return demoStore.update((s) => {
      const c = s.couple!;
      if (patch.city !== undefined) c.city = patch.city?.trim() || null;
      if (patch.togetherSince !== undefined) c.togetherSince = patch.togetherSince || null;
      return { ...c, memberIds: [...c.memberIds] };
    });
  },
  async markCadenceReviewed() {
    await tick(60);
    requireMine();
    return demoStore.update((s) => {
      s.couple!.cadenceReviewedAt = nowIso();
      return { ...s.couple!, memberIds: [...s.couple!.memberIds] };
    });
  },
};
