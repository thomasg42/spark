import { appUrl } from "@/lib/config";
import { UserFacingError, type Backend, type SessionUser } from "../types";
import { resetCoupleCache, supabase } from "./client";

const toUser = (u: { id: string; email?: string | null } | null | undefined): SessionUser | null =>
  u ? { id: u.id, email: u.email ?? null } : null;

export const auth: Backend["auth"] = {
  async getUser() {
    const { data } = await supabase().auth.getSession();
    return toUser(data.session?.user);
  },
  onChange(callback) {
    const { data } = supabase().auth.onAuthStateChange((_event, session) => {
      resetCoupleCache();
      callback(toUser(session?.user));
    });
    return () => data.subscription.unsubscribe();
  },
  async sendMagicLink(email) {
    const { error } = await supabase().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: appUrl("/auth/callback/"), shouldCreateUser: true },
    });
    if (error) throw new UserFacingError(error.status === 429 ? "Too many requests. Wait a minute and try again." : "Could not send the sign-in email. Check the address and try again.");
  },
  async verifyEmailCode(email, code) {
    const { error } = await supabase().auth.verifyOtp({ email: email.trim(), token: code.replace(/\s/g, ""), type: "email" });
    if (error) throw new UserFacingError("That code didn't work. Check it, or send a new one.");
  },
  async signInWithPassword(email, password) {
    const { error } = await supabase().auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw new UserFacingError("Email or password didn't match.");
  },
  async completeRedirect() {
    const client = supabase();
    const code = new URLSearchParams(window.location.search).get("code");
    if (code) {
      const { data, error } = await client.auth.exchangeCodeForSession(code);
      if (error) {
        // The link may already have been used by detectSessionInUrl; fall through to the session check.
        const { data: existing } = await client.auth.getSession();
        if (existing.session) return toUser(existing.session.user);
        throw new UserFacingError("That sign-in link expired or was opened in a different browser. Send a new one, or use the 6-digit code.");
      }
      return toUser(data.user);
    }
    const { data } = await client.auth.getSession();
    return toUser(data.session?.user);
  },
  async signOut() {
    resetCoupleCache();
    await supabase().auth.signOut();
  },
};
