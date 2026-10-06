import { UserFacingError, type Backend, type Profile } from "../types";
import { fail, requireUserId, supabase } from "./client";

type Row = {
  user_id: string;
  display_name: string;
  nickname: string | null;
  birthday: string;
  birth_time: string | null;
  birth_place: string | null;
  accent_theme: Profile["accentTheme"];
  color_mode: Profile["colorMode"];
  preferred_cadence: Profile["preferredCadence"];
  social_sharing: Profile["socialSharing"];
};

const COLUMNS = "user_id, display_name, nickname, birthday, birth_time, birth_place, accent_theme, color_mode, preferred_cadence, social_sharing";

export const toProfile = (r: Row): Profile => ({
  userId: r.user_id,
  displayName: r.display_name,
  nickname: r.nickname,
  birthday: r.birthday,
  birthTime: r.birth_time ? r.birth_time.slice(0, 5) : null,
  birthPlace: r.birth_place,
  accentTheme: r.accent_theme,
  colorMode: r.color_mode,
  preferredCadence: r.preferred_cadence,
  socialSharing: r.social_sharing,
});

export const profiles: Backend["profiles"] = {
  async getMine() {
    const uid = await requireUserId();
    const { data, error } = await supabase().from("profiles").select(COLUMNS).eq("user_id", uid).maybeSingle();
    if (error) fail(error, "Could not load your profile.");
    return data ? toProfile(data as Row) : null;
  },
  async getPartner() {
    const uid = await requireUserId();
    // RLS returns only self + partner, so "not me" is the partner.
    const { data, error } = await supabase().from("profiles").select(COLUMNS).neq("user_id", uid).maybeSingle();
    if (error) fail(error, "Could not load your partner's profile.");
    return data ? toProfile(data as Row) : null;
  },
  async create(input) {
    if (!input.adultConfirmed) throw new UserFacingError("Please confirm you are 18 or older.");
    const uid = await requireUserId();
    const { data, error } = await supabase()
      .from("profiles")
      .insert({
        user_id: uid,
        display_name: input.displayName.trim(),
        nickname: input.nickname?.trim() || null,
        birthday: input.birthday,
        birth_time: input.birthTime || null,
        birth_place: input.birthPlace?.trim() || null,
        accent_theme: input.accentTheme,
        color_mode: input.colorMode,
        preferred_cadence: input.preferredCadence,
        social_sharing: input.socialSharing,
        adult_confirmed_at: new Date().toISOString(),
      })
      .select(COLUMNS)
      .single();
    if (error) fail(error, "Could not save your profile.");
    return toProfile(data as Row);
  },
  async update(patch) {
    const uid = await requireUserId();
    const row: Record<string, unknown> = {};
    if (patch.displayName !== undefined) row.display_name = patch.displayName.trim();
    if (patch.nickname !== undefined) row.nickname = patch.nickname?.trim() || null;
    if (patch.birthTime !== undefined) row.birth_time = patch.birthTime || null;
    if (patch.birthPlace !== undefined) row.birth_place = patch.birthPlace?.trim() || null;
    if (patch.accentTheme !== undefined) row.accent_theme = patch.accentTheme;
    if (patch.colorMode !== undefined) row.color_mode = patch.colorMode;
    if (patch.preferredCadence !== undefined) row.preferred_cadence = patch.preferredCadence;
    if (patch.socialSharing !== undefined) row.social_sharing = patch.socialSharing;
    const { data, error } = await supabase().from("profiles").update(row).eq("user_id", uid).select(COLUMNS).single();
    if (error) fail(error, "Could not save your changes.");
    return toProfile(data as Row);
  },
};
