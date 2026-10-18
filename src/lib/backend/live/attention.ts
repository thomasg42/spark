import type { RealtimeChannel } from "@supabase/supabase-js";
import { UserFacingError, type AttentionSignal, type Backend } from "../types";
import { fail, supabase } from "./client";

type SignalRow = {
  id: string; couple_id: string; author_id: string; subject: AttentionSignal["subject"];
  created_at: string; acknowledged_at: string | null; resolved_at: string | null;
};
const COLUMNS = "id,couple_id,author_id,subject,created_at,acknowledged_at,resolved_at";
const toSignal = (row: SignalRow): AttentionSignal => ({
  id: row.id, coupleId: row.couple_id, authorId: row.author_id, subject: row.subject,
  createdAt: row.created_at, acknowledgedAt: row.acknowledged_at, resolvedAt: row.resolved_at,
});

async function session() {
  const { data, error } = await supabase().auth.getSession();
  if (error || !data.session) throw new UserFacingError("Please sign in again.");
  return { userId: data.session.user.id, authorization: `Bearer ${data.session.access_token}` };
}

/** Pin each request to the session that started it, even if the displayed account changes. */
async function scope() {
  const current = await session();
  const { data, error } = await supabase().from("couple_members").select("couple_id")
    .eq("user_id", current.userId).setHeader("Authorization", current.authorization).maybeSingle();
  if (error) fail(error, "Could not load your couple.");
  if (!data) throw new UserFacingError("Pair with your partner first.");
  return { ...current, coupleId: data.couple_id as string };
}

async function change(rpc: "raise_attention" | "acknowledge_attention" | "resolve_attention", args: Record<string, string>, expectedViewerId: string) {
  const current = await session();
  if (current.userId !== expectedViewerId) throw new UserFacingError("Your account changed. Please try again.");
  const { error } = await supabase().rpc(rpc, args).setHeader("Authorization", current.authorization);
  if (error) fail(error, "Could not update that attention request. Please try again.");
}

export const attention: Backend["attention"] = {
  async list() {
    const current = await scope();
    const { data, error } = await supabase().from("attention_signals").select(COLUMNS)
      .eq("couple_id", current.coupleId).is("resolved_at", null)
      .order("created_at", { ascending: false }).order("id")
      .setHeader("Authorization", current.authorization);
    if (error) fail(error, "Could not load attention requests.");
    return ((data ?? []) as SignalRow[]).map(toSignal);
  },
  async raise(subject, expectedViewerId) {
    if (subject !== "self" && subject !== "partner") throw new UserFacingError("Choose yourself or your partner.");
    await change("raise_attention", { p_subject: subject }, expectedViewerId);
  },
  async acknowledge(id, expectedViewerId) {
    await change("acknowledge_attention", { p_id: id }, expectedViewerId);
  },
  async resolve(id, expectedViewerId) {
    await change("resolve_attention", { p_id: id }, expectedViewerId);
  },
  subscribe(onChange) {
    let disposed = false;
    let channel: RealtimeChannel | null = null;
    let stopAuth: (() => void) | null = null;
    const notify = () => { if (!disposed) onChange(); };
    const dispose = () => {
      disposed = true;
      stopAuth?.();
      stopAuth = null;
      if (channel) void supabase().removeChannel(channel).catch(() => {});
      channel = null;
    };
    void scope().then((current) => {
      if (disposed) return;
      const auth = supabase().auth.onAuthStateChange((_event, next) => {
        if (next?.user.id !== current.userId) dispose();
      });
      stopAuth = () => auth.data.subscription.unsubscribe();
      if (disposed) { stopAuth(); return; }
      channel = supabase().channel(`attention:${current.coupleId}:${crypto.randomUUID()}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "attention_signals", filter: `couple_id=eq.${current.coupleId}` }, notify);
      channel.subscribe((status) => {
        // Re-fetch after connection/reconnection so changes during an offline interval are included.
        if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") notify();
      });
    }).catch(notify);
    return dispose;
  },
};
