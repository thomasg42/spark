import { clearBuddySessions } from "@/lib/buddy/session";
import { UserFacingError, type Backend, type SessionUser } from "../types";
import { demoStore } from "./store";

function current(): SessionUser | null {
  const s = demoStore.get();
  if (!s.signedIn) return null;
  const persona = s.personas.find((p) => p.id === s.actingAs);
  return persona ? { id: persona.id, email: persona.email } : null;
}

const demoOnly = () => {
  throw new UserFacingError("This is the demo. Pick Alex or Sam below to explore; real sign-in arrives when Spark is connected to its server.");
};

export const auth: Backend["auth"] = {
  async getUser() {
    return current();
  },
  onChange(callback) {
    return demoStore.subscribe(() => callback(current()));
  },
  sendMagicLink: async () => demoOnly(),
  verifyEmailCode: async () => demoOnly(),
  signInWithPassword: async () => demoOnly(),
  async completeRedirect() {
    return current();
  },
  async signOut() {
    clearBuddySessions();
    demoStore.update((s) => {
      s.signedIn = false;
    });
  },
};

/** Demo sign-in: become one of the two sample partners. */
export function signInAs(userId: string) {
  demoStore.update((s) => {
    if (!s.personas.some((p) => p.id === userId)) throw new UserFacingError("Unknown demo partner.");
    s.actingAs = userId;
    s.signedIn = true;
  });
}
