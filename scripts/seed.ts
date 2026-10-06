/**
 * Seeds a Supabase project with two paired TEST accounts and some shared sample
 * data, so the Phase 1 flow can be tried end to end.
 *
 *   npm run seed            (reads .env.local, or the shell environment)
 *
 * Needs SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY.
 * Optional: SEED_EMAIL_A, SEED_EMAIL_B, SEED_PASSWORD (otherwise a random password
 * is generated and printed once).
 *
 * The service role is used ONLY to create/confirm the two auth users. Everything
 * else runs as each test user through their own session, so the real RPCs and
 * RLS policies are exercised exactly as the app uses them. Private onboarding
 * answers and monthly check-ins are deliberately NOT seeded: they are encrypted by
 * the Edge Functions, and completing them is part of the acceptance test.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

try {
  process.loadEnvFile(".env.local");
} catch {
  // fine: use the shell environment
}

function env(name: string, required = true): string {
  const value = process.env[name] ?? process.env[`NEXT_PUBLIC_${name}`] ?? "";
  if (required && !value) {
    console.error(`Missing ${name}. Put it in .env.local or export it, then run again.`);
    process.exit(1);
  }
  return value;
}

const url = env("SUPABASE_URL");
const anonKey = env("SUPABASE_ANON_KEY");
const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
const emailA = process.env.SEED_EMAIL_A || "alex@spark.test";
const emailB = process.env.SEED_EMAIL_B || "sam@spark.test";
const password = process.env.SEED_PASSWORD || randomBytes(12).toString("base64url");

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

const pad = (n: number) => String(n).padStart(2, "0");
const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
};
const mondayOf = (d: Date) => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
};

async function ensureUser(email: string): Promise<string> {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) {
      const { error: upd } = await admin.auth.admin.updateUserById(found.id, { password, email_confirm: true });
      if (upd) throw new Error(`Could not reset password for ${email}: ${upd.message}`);
      return found.id;
    }
    if (data.users.length < 200) break;
  }
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`Could not create ${email}: ${error?.message}`);
  return data.user.id;
}

async function signIn(email: string): Promise<SupabaseClient> {
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Sign-in failed for ${email}: ${error.message}`);
  return client;
}

async function ensureProfile(client: SupabaseClient, userId: string, profile: Record<string, unknown>) {
  const { data } = await client.from("profiles").select("user_id").eq("user_id", userId).maybeSingle();
  if (data) return;
  const { error } = await client.from("profiles").insert({ user_id: userId, adult_confirmed_at: new Date().toISOString(), ...profile });
  if (error) throw new Error(`Profile insert failed: ${error.message}`);
}

async function coupleOf(client: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await client.from("couple_members").select("couple_id").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.couple_id as string | undefined) ?? null;
}

async function main() {
  console.log("Seeding Spark test couple...");
  const alexId = await ensureUser(emailA);
  const samId = await ensureUser(emailB);
  const alex = await signIn(emailA);
  const sam = await signIn(emailB);

  await ensureProfile(alex, alexId, { display_name: "Alex", nickname: "Al", birthday: "1994-05-17", accent_theme: "rose", preferred_cadence: "weekly", social_sharing: "milestones" });
  await ensureProfile(sam, samId, { display_name: "Sam", birthday: "1993-11-02", accent_theme: "ocean", preferred_cadence: "monthly", social_sharing: "status_only" });

  let coupleA = await coupleOf(alex, alexId);
  let coupleB = await coupleOf(sam, samId);
  if (coupleA && coupleB && coupleA !== coupleB) throw new Error("The two test accounts are paired with other people. Use different SEED_EMAIL_A/B.");
  if (!coupleA && coupleB) throw new Error(`${emailB} is already in a couple without ${emailA}. Use different emails.`);
  if (!coupleA) {
    const { data, error } = await alex.rpc("create_couple");
    if (error) throw new Error(`create_couple failed: ${error.message}`);
    coupleA = (data as { id: string }).id;
  }
  if (!coupleB) {
    const { data: couple, error: readErr } = await alex.from("couples").select("invite_code").eq("id", coupleA).single();
    if (readErr) throw new Error(readErr.message);
    let code = couple.invite_code as string | null;
    if (!code) {
      const { data, error } = await alex.rpc("regenerate_invite");
      if (error) throw new Error(error.message);
      code = (data as { invite_code: string }).invite_code;
    }
    const { error } = await sam.rpc("join_couple", { p_code: code });
    if (error) throw new Error(`join_couple failed: ${error.message}`);
  }
  const coupleId = coupleA!;
  console.log("  Paired.");

  await alex.from("couples").update({ city: "Bozeman, MT", together_since: isoDay(daysAgo(700)) }).eq("id", coupleId);

  const { count } = await alex.from("story_entries").select("id", { count: "exact", head: true }).eq("couple_id", coupleId);
  if ((count ?? 0) === 0) {
    const story = [
      { kind: "how_we_met", title: "Trivia night, wrong team", happened_on: isoDay(daysAgo(745)), body: "Sam sat at our table by mistake and knew every geography answer." },
      { kind: "first_date", title: "Tacos and a very long walk", happened_on: isoDay(daysAgo(730)), body: "The taco place closed early, so we walked Main Street twice." },
      { kind: "together", title: "Made it official", happened_on: isoDay(daysAgo(700)), body: "On the drive back from Big Sky.", remind_yearly: true },
    ];
    for (const entry of story) {
      const { error } = await alex.from("story_entries").insert({ couple_id: coupleId, ...entry });
      if (error) throw new Error(`story insert failed: ${error.message}`);
    }

    const activities = [
      { title: "Hot springs day", category: "outdoors", happened_on: isoDay(daysAgo(24)), ratings: [5, 5] },
      { title: "Thai cooking night", category: "food", happened_on: isoDay(daysAgo(17)), ratings: [4, 5] },
      { title: "Movie marathon", category: "chill", happened_on: isoDay(daysAgo(10)), ratings: [3, 4] },
      { title: "Farmers market and picnic", category: "food", happened_on: isoDay(daysAgo(3)), ratings: [4, 4] },
    ];
    for (const a of activities) {
      const { data, error } = await alex.from("activities").insert({ couple_id: coupleId, title: a.title, category: a.category, happened_on: a.happened_on }).select("id").single();
      if (error) throw new Error(`activity insert failed: ${error.message}`);
      await alex.from("activity_ratings").insert({ activity_id: data.id, couple_id: coupleId, rating: a.ratings[0] });
      await sam.from("activity_ratings").insert({ activity_id: data.id, couple_id: coupleId, rating: a.ratings[1] });
    }

    await sam.from("appreciation_notes").insert({ couple_id: coupleId, body: "Thank you for warming up the car this morning." });
    await alex.from("appreciation_notes").insert({ couple_id: coupleId, body: "You made Tuesday so much better." });
    await sam.from("moments").insert({ couple_id: coupleId, kind: "note", caption: "Saw a dog that looked exactly like your mom's dog. Same attitude." });

    // Past weekly pulses (both partners, so they are revealed). This week is left open.
    const thisMonday = mondayOf(new Date());
    const scores: Array<[number, number, number, number]> = [[4, 4, 4, 4], [4, 5, 3, 4], [3, 4, 3, 3], [4, 4, 4, 4]];
    for (const [i, [ae, ac, se, sc]] of scores.entries()) {
      const monday = new Date(thisMonday);
      monday.setDate(monday.getDate() - 7 * (scores.length - i));
      const week = isoDay(monday);
      await alex.from("pulses").insert({ couple_id: coupleId, week_start: week, excitement: ae, connection: ac });
      await sam.from("pulses").insert({ couple_id: coupleId, week_start: week, excitement: se, connection: sc });
    }
    console.log("  Added sample story, activities, notes, a moment and past pulses.");
  } else {
    console.log("  Sample data already present; left as is.");
  }

  console.log("\nTest accounts (sign in with 'Use a password instead'):");
  console.log(`  ${emailA}`);
  console.log(`  ${emailB}`);
  console.log(`  password: ${password}`);
  console.log("\nNext: sign in as each, answer a question set, submit this month's check-in as both, log an activity, and get date ideas.");
}

main().catch((error) => {
  console.error(`Seed failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
