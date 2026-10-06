/** Remembers an invite code from a /join link across sign-in (this tab only). */
const KEY = "spark-pending-invite";

export function rememberInvite(code: string) {
  try {
    sessionStorage.setItem(KEY, code);
  } catch {
    // storage blocked: the user can still type the code
  }
}

export function takeInvite(): string | null {
  try {
    const code = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return code;
  } catch {
    return null;
  }
}
