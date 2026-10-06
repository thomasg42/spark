"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getBackend, type Backend, type Couple, type Profile, type SessionUser } from "@/lib/backend";

export type Stage = "loading" | "signedOut" | "needsProfile" | "needsPartner" | "ready";

export interface AppState {
  backend: Backend;
  stage: Stage;
  user: SessionUser | null;
  profile: Profile | null;
  partner: Profile | null;
  couple: Couple | null;
  loadError: string | null;
  refresh(): Promise<void>;
  setProfile(profile: Profile): void;
  setCouple(couple: Couple): void;
  /** Display name for a user id in this couple ("You" for the signed-in user). */
  nameOf(userId: string | null | undefined, you?: string): string;
}

const AppContext = createContext<AppState | null>(null);
const THEME_KEY = "spark-theme";

/** Applies the viewer's own accent + mode; cached locally only to avoid a flash on reload. */
export function applyTheme(profile: Pick<Profile, "accentTheme" | "colorMode"> | null) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.accent = profile?.accentTheme ?? "rose";
  root.dataset.mode = profile?.colorMode ?? "system";
  try {
    localStorage.setItem(THEME_KEY, JSON.stringify({ accent: root.dataset.accent, mode: root.dataset.mode }));
  } catch {
    // storage blocked: theme still applies for this page view
  }
}

/** Inline script for <head>: restores the cached theme before first paint. */
export const THEME_BOOT_SCRIPT = `try{var t=JSON.parse(localStorage.getItem("${THEME_KEY}")||"{}");var r=document.documentElement;if(t.accent)r.dataset.accent=t.accent;if(t.mode)r.dataset.mode=t.mode;}catch(e){}`;

export function AppProvider({ children }: { children: ReactNode }) {
  const backend = useMemo(() => getBackend(), []);
  const [stage, setStage] = useState<Stage>("loading");
  const [user, setUser] = useState<SessionUser | null>(null);
  const [profile, setProfileState] = useState<Profile | null>(null);
  const [partner, setPartner] = useState<Profile | null>(null);
  const [couple, setCoupleState] = useState<Couple | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      const u = await backend.auth.getUser();
      setUser(u);
      if (!u) {
        setProfileState(null);
        setPartner(null);
        setCoupleState(null);
        setStage("signedOut");
        return;
      }
      const p = await backend.profiles.getMine();
      setProfileState(p);
      if (p) applyTheme(p);
      if (!p) {
        setPartner(null);
        setCoupleState(null);
        setStage("needsProfile");
        return;
      }
      const c = await backend.couple.getMine();
      setCoupleState(c);
      if (!c || c.memberIds.length < 2) {
        setPartner(null);
        setStage("needsPartner");
        return;
      }
      setPartner(await backend.profiles.getPartner());
      setStage("ready");
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load Spark.");
      setStage((s) => (s === "loading" ? "signedOut" : s));
    }
  }, [backend]);

  useEffect(() => {
    void refresh();
    return backend.auth.onChange(() => {
      void refresh();
    });
  }, [backend, refresh]);

  const setProfile = useCallback((p: Profile) => {
    setProfileState(p);
    applyTheme(p);
  }, []);

  const setCouple = useCallback((c: Couple) => setCoupleState(c), []);

  const nameOf = useCallback(
    (userId: string | null | undefined, you = "You") => {
      if (!userId) return "A former member";
      if (userId === user?.id) return you;
      if (userId === partner?.userId) return partner.nickname || partner.displayName;
      // Demo screens can finish their own load just before the provider has
      // published the partner profile. Use the local persona as a safe,
      // deterministic fallback during that brief transition.
      const demoPersona = backend.demo?.personas.find((persona) => persona.id === userId);
      if (demoPersona) return demoPersona.name;
      const demoPartner = backend.demo?.personas.find((persona) => persona.id !== user?.id);
      if (demoPartner && userId !== user?.id) return demoPartner.name;
      return "Your partner";
    },
    [backend, user, partner],
  );

  const value: AppState = { backend, stage, user, profile, partner, couple, loadError, refresh, setProfile, setCouple, nameOf };
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}
