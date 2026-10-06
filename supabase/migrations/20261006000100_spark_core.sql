-- =============================================================================
-- Spark Phase 1 core schema
--
-- Privacy model (enforced here, in the database, not just in the UI):
--   * PRIVATE rows (private_answers) are readable and writable only by their
--     owner. The partner can never select them, even with a hand-written query.
--   * SHARED rows (story, activities, moments, notes, ideas) are readable by the
--     two members of the couple and nobody else.
--   * HIDDEN-UNTIL-BOTH rows (monthly check-in responses, weekly pulses) are
--     readable by the owner always, and by the partner only after both partners
--     have submitted for that period.
--   * Sensitive free text (private answers, check-in answers, AI summaries) is
--     stored only as AES-256-GCM ciphertext produced by the Edge Functions with
--     a key the database never sees ("v1." prefix enforced by CHECK).
--   * anon (signed-out) has no access to any table or function.
--   * Edge Functions act with the signed-in user's own JWT, so every policy below
--     applies to them too. The service role is used only by the seed script.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.cadence as enum ('daily', 'twice_weekly', 'weekly', 'biweekly', 'monthly');
create type public.accent_theme as enum ('rose', 'plum', 'ocean', 'sunset', 'forest');
create type public.color_mode as enum ('system', 'light', 'dark');
create type public.social_sharing as enum ('private', 'status_only', 'milestones', 'open');
create type public.story_kind as enum (
  'how_we_met', 'together', 'first_date', 'first_kiss', 'met_family',
  'trip', 'milestone', 'anniversary', 'other'
);
create type public.activity_category as enum (
  'food', 'outdoors', 'adventure', 'creative', 'chill', 'social', 'active'
);
create type public.moment_kind as enum ('photo', 'video', 'link', 'note');

-- ---------------------------------------------------------------------------
-- Generic helpers
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Profiles (one per user; visible to self and partner)
-- ---------------------------------------------------------------------------
create table public.profiles (
  user_id            uuid primary key references auth.users (id) on delete cascade,
  display_name       text not null check (char_length(btrim(display_name)) between 1 and 60),
  nickname           text check (nickname is null or char_length(nickname) <= 40),
  birthday           date not null,
  birth_time         time,
  birth_place        text check (birth_place is null or char_length(birth_place) <= 120),
  accent_theme       public.accent_theme not null default 'rose',
  color_mode         public.color_mode not null default 'system',
  -- Partners pick only daily / weekly / monthly; the couple cadence is derived.
  preferred_cadence  public.cadence not null default 'weekly'
                     check (preferred_cadence in ('daily', 'weekly', 'monthly')),
  -- How public each partner wants the relationship to be. Shown openly to the
  -- partner; the couple agreement is always the MORE private of the two.
  social_sharing     public.social_sharing,
  adult_confirmed_at timestamptz not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create or replace function public.enforce_adult_profile()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.birthday > (current_date - interval '18 years')::date then
    raise exception 'Spark is only for adults 18 and older.' using errcode = 'check_violation';
  end if;
  if new.birthday < date '1900-01-01' then
    raise exception 'Please enter a real birthday.' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger profiles_adult before insert or update of birthday on public.profiles
  for each row execute function public.enforce_adult_profile();
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Couples and membership (exactly two partners per couple, one couple per user)
-- ---------------------------------------------------------------------------
create table public.couples (
  id                  uuid primary key default gen_random_uuid(),
  created_by          uuid references auth.users (id) on delete set null,
  city                text check (city is null or char_length(city) <= 80),
  together_since      date,
  cadence_reviewed_at timestamptz not null default now(),
  invite_code         text unique check (invite_code is null or invite_code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  invite_expires_at   timestamptz,
  created_at          timestamptz not null default now()
);

create table public.couple_members (
  couple_id uuid not null references public.couples (id) on delete cascade,
  user_id   uuid not null unique references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (couple_id, user_id)
);

create or replace function public.enforce_two_members()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (select count(*) from public.couple_members where couple_id = new.couple_id) >= 2 then
    raise exception 'This couple already has two partners.' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger couple_members_max_two before insert on public.couple_members
  for each row execute function public.enforce_two_members();

-- SECURITY DEFINER lookups used inside policies (avoids RLS recursion).
create or replace function public.my_couple_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select cm.couple_id from public.couple_members cm where cm.user_id = (select auth.uid())
$$;

create or replace function public.my_partner_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select cm.user_id from public.couple_members cm
  where cm.couple_id = (select public.my_couple_id()) and cm.user_id <> (select auth.uid())
$$;

create or replace function public.is_couple_member(p_couple_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.couple_members cm
    where cm.couple_id = p_couple_id and cm.user_id = (select auth.uid())
  )
$$;

create or replace function public.generate_invite_code()
returns text language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- no 0/O/1/I/L
  raw bytea;
  code text := '';
  b int;
  i int := 0;
begin
  -- Rejection sampling keeps every character equally likely (248 = 8 * 31).
  while char_length(code) < 8 loop
    raw := extensions.gen_random_bytes(16);
    i := 0;
    while i < 16 and char_length(code) < 8 loop
      b := get_byte(raw, i);
      if b < 248 then
        code := code || substr(alphabet, (b % 31) + 1, 1);
      end if;
      i := i + 1;
    end loop;
  end loop;
  return code;
end $$;

-- Creates a couple for the caller and returns it (with a fresh 7-day invite code).
create or replace function public.create_couple()
returns public.couples language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.couples;
begin
  if v_uid is null then
    raise exception 'Please sign in first.' using errcode = '28000';
  end if;
  if not exists (select 1 from public.profiles where user_id = v_uid) then
    raise exception 'Finish your profile before pairing.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.couple_members where user_id = v_uid) then
    raise exception 'You are already paired.' using errcode = 'P0001';
  end if;
  insert into public.couples (created_by, invite_code, invite_expires_at)
  values (v_uid, public.generate_invite_code(), now() + interval '7 days')
  returning * into v_row;
  insert into public.couple_members (couple_id, user_id) values (v_row.id, v_uid);
  return v_row;
end $$;

-- Joins the couple that owns p_code. The code is single-use and expires after 7 days.
create or replace function public.join_couple(p_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_couple public.couples;
begin
  if v_uid is null then
    raise exception 'Please sign in first.' using errcode = '28000';
  end if;
  if not exists (select 1 from public.profiles where user_id = v_uid) then
    raise exception 'Finish your profile before pairing.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.couple_members where user_id = v_uid) then
    raise exception 'You are already paired.' using errcode = 'P0001';
  end if;
  select * into v_couple from public.couples where invite_code = v_code for update;
  if not found then
    raise exception 'That code did not match. Check it and try again.' using errcode = 'P0002';
  end if;
  if v_couple.invite_expires_at is null or v_couple.invite_expires_at < now() then
    raise exception 'That code has expired. Ask your partner for a new one.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.couple_members where couple_id = v_couple.id) >= 2 then
    raise exception 'That couple already has two partners.' using errcode = 'P0001';
  end if;
  insert into public.couple_members (couple_id, user_id) values (v_couple.id, v_uid);
  update public.couples set invite_code = null, invite_expires_at = null where id = v_couple.id;
  return v_couple.id;
end $$;

-- Issues a fresh invite code while the couple still has one partner.
create or replace function public.regenerate_invite()
returns public.couples language plpgsql security definer set search_path = '' as $$
declare
  v_cid uuid := public.my_couple_id();
  v_row public.couples;
begin
  if v_cid is null then
    raise exception 'Create a couple first.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.couple_members where couple_id = v_cid) >= 2 then
    raise exception 'You are already paired.' using errcode = 'P0001';
  end if;
  update public.couples
     set invite_code = public.generate_invite_code(), invite_expires_at = now() + interval '7 days'
   where id = v_cid
  returning * into v_row;
  return v_row;
end $$;

-- ---------------------------------------------------------------------------
-- Module A: Our Story (shared timeline)
-- ---------------------------------------------------------------------------
create table public.story_entries (
  id           uuid primary key default gen_random_uuid(),
  couple_id    uuid not null references public.couples (id) on delete cascade,
  author_id    uuid references auth.users (id) on delete set null default auth.uid(),
  kind         public.story_kind not null,
  title        text not null check (char_length(btrim(title)) between 1 and 120),
  happened_on  date,
  body         text check (body is null or char_length(body) <= 4000),
  photo_path   text check (photo_path is null or photo_path like couple_id::text || '/%'),
  remind_yearly boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index story_entries_couple_idx on public.story_entries (couple_id, happened_on);
create trigger story_entries_touch before update on public.story_entries
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Module B: private onboarding answers (owner-only, encrypted)
-- ---------------------------------------------------------------------------
create table public.private_answers (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade default auth.uid(),
  section           text not null check (section ~ '^[a-z_]{2,40}$'),
  question_id       text not null check (question_id ~ '^[a-z0-9_]{2,60}$'),
  answer_ciphertext text check (answer_ciphertext is null or answer_ciphertext like 'v1.%'),
  skipped           boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (user_id, question_id),
  check ((skipped and answer_ciphertext is null) or (not skipped and answer_ciphertext is not null))
);
create trigger private_answers_touch before update on public.private_answers
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Module D: weekly pulse (hidden from partner until both submit that week)
-- ---------------------------------------------------------------------------
create table public.pulses (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references public.couples (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade default auth.uid(),
  week_start  date not null check (extract(isodow from week_start) = 1),
  excitement  smallint not null check (excitement between 1 and 5),
  connection  smallint not null check (connection between 1 and 5),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, week_start)
);
create index pulses_couple_week_idx on public.pulses (couple_id, week_start);
create trigger pulses_touch before update on public.pulses
  for each row execute function public.touch_updated_at();

create or replace function public.pulse_week_revealed(p_couple_id uuid, p_week date)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_couple_member(p_couple_id) and (
    select count(distinct p.user_id) >= 2 from public.pulses p
    where p.couple_id = p_couple_id and p.week_start = p_week
  )
$$;

-- Returns whether the caller and the partner have submitted for a week, without
-- revealing the partner's scores.
create or replace function public.pulse_status(p_week date)
returns table (i_submitted boolean, partner_submitted boolean)
language sql stable security definer set search_path = '' as $$
  select
    exists (select 1 from public.pulses p where p.user_id = (select auth.uid()) and p.week_start = p_week),
    exists (select 1 from public.pulses p
            where p.user_id = (select public.my_partner_id()) and p.week_start = p_week
              and p.couple_id = (select public.my_couple_id()))
$$;

-- ---------------------------------------------------------------------------
-- Module D: monthly check-in (answers hidden until both submit, then revealed)
-- ---------------------------------------------------------------------------
create table public.checkins (
  id                   uuid primary key default gen_random_uuid(),
  couple_id            uuid not null references public.couples (id) on delete cascade,
  period               text not null check (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  summary_ciphertext   text check (summary_ciphertext is null or summary_ciphertext like 'v1.%'),
  summary_generated_at timestamptz,
  created_at           timestamptz not null default now(),
  unique (couple_id, period),
  unique (id, couple_id)
);

create table public.checkin_responses (
  id                 uuid primary key default gen_random_uuid(),
  checkin_id         uuid not null,
  couple_id          uuid not null,
  user_id            uuid not null references auth.users (id) on delete cascade default auth.uid(),
  answers_ciphertext text not null check (answers_ciphertext like 'v1.%'),
  submitted_at       timestamptz not null default now(),
  unique (checkin_id, user_id),
  foreign key (checkin_id, couple_id) references public.checkins (id, couple_id) on delete cascade
);

create or replace function public.checkin_revealed(p_checkin_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.checkins c
    where c.id = p_checkin_id and public.is_couple_member(c.couple_id)
  ) and (
    select count(distinct r.user_id) >= 2 from public.checkin_responses r
    where r.checkin_id = p_checkin_id
  )
$$;

-- Opens (or returns) the caller's couple check-in for a YYYY-MM period.
create or replace function public.ensure_checkin(p_period text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_cid uuid := public.my_couple_id();
  v_id uuid;
begin
  if v_cid is null then
    raise exception 'Pair with your partner first.' using errcode = 'P0001';
  end if;
  if p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Invalid check-in period.' using errcode = '22023';
  end if;
  insert into public.checkins (couple_id, period) values (v_cid, p_period)
  on conflict (couple_id, period) do nothing;
  select id into v_id from public.checkins where couple_id = v_cid and period = p_period;
  return v_id;
end $$;

create or replace function public.checkin_status(p_period text)
returns table (checkin_id uuid, i_submitted boolean, partner_submitted boolean, revealed boolean, summary_ready boolean)
language sql stable security definer set search_path = '' as $$
  select
    c.id,
    exists (select 1 from public.checkin_responses r where r.checkin_id = c.id and r.user_id = (select auth.uid())),
    exists (select 1 from public.checkin_responses r where r.checkin_id = c.id and r.user_id = (select public.my_partner_id())),
    public.checkin_revealed(c.id),
    c.summary_ciphertext is not null
  from public.checkins c
  where c.couple_id = (select public.my_couple_id()) and c.period = p_period
$$;

-- Stores the AI summary once (first writer wins) after both partners submitted.
create or replace function public.set_checkin_summary(p_checkin_id uuid, p_ciphertext text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_existing text;
begin
  if not public.checkin_revealed(p_checkin_id) then
    raise exception 'Both partners must submit before a summary is created.' using errcode = 'P0001';
  end if;
  if p_ciphertext is null or p_ciphertext not like 'v1.%' then
    raise exception 'Summary must be encrypted.' using errcode = '22023';
  end if;
  update public.checkins
     set summary_ciphertext = p_ciphertext, summary_generated_at = now()
   where id = p_checkin_id and summary_ciphertext is null;
  select summary_ciphertext into v_existing from public.checkins where id = p_checkin_id;
  return v_existing;
end $$;

-- ---------------------------------------------------------------------------
-- Module D: appreciation notes (shared)
-- ---------------------------------------------------------------------------
create table public.appreciation_notes (
  id         uuid primary key default gen_random_uuid(),
  couple_id  uuid not null references public.couples (id) on delete cascade,
  author_id  uuid references auth.users (id) on delete set null default auth.uid(),
  body       text not null check (char_length(btrim(body)) between 1 and 280),
  created_at timestamptz not null default now()
);
create index appreciation_notes_couple_idx on public.appreciation_notes (couple_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Module E (Phase 1 slice): activity log, ratings, and date ideas
-- ---------------------------------------------------------------------------
create table public.date_ideas (
  id           uuid primary key default gen_random_uuid(),
  couple_id    uuid not null references public.couples (id) on delete cascade,
  requested_by uuid references auth.users (id) on delete set null default auth.uid(),
  batch_id     uuid not null,
  title        text not null check (char_length(btrim(title)) between 1 and 120),
  description  text not null check (char_length(description) <= 600),
  category     public.activity_category not null,
  budget       text not null check (budget in ('free', '$', '$$', '$$$')),
  duration     text not null check (duration in ('quick', 'evening', 'half_day', 'full_day')),
  time_of_day  text not null check (time_of_day in ('morning', 'afternoon', 'evening', 'any')),
  weather      text not null check (weather in ('indoor', 'outdoor', 'either')),
  why          text check (why is null or char_length(why) <= 300),
  source       text not null check (source in ('claude', 'fallback')),
  status       text not null default 'new' check (status in ('new', 'saved', 'done', 'dismissed')),
  created_at   timestamptz not null default now()
);
create index date_ideas_couple_idx on public.date_ideas (couple_id, created_at desc);

create table public.activities (
  id             uuid primary key default gen_random_uuid(),
  couple_id      uuid not null references public.couples (id) on delete cascade,
  created_by     uuid references auth.users (id) on delete set null default auth.uid(),
  title          text not null check (char_length(btrim(title)) between 1 and 120),
  happened_on    date not null,
  category       public.activity_category not null,
  note           text check (note is null or char_length(note) <= 2000),
  photo_path     text check (photo_path is null or photo_path like couple_id::text || '/%'),
  source_idea_id uuid references public.date_ideas (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (id, couple_id)
);
create index activities_couple_idx on public.activities (couple_id, happened_on desc);
create trigger activities_touch before update on public.activities
  for each row execute function public.touch_updated_at();

create table public.activity_ratings (
  activity_id uuid not null,
  couple_id   uuid not null,
  user_id     uuid not null references auth.users (id) on delete cascade default auth.uid(),
  rating      smallint not null check (rating between 1 and 5),
  updated_at  timestamptz not null default now(),
  primary key (activity_id, user_id),
  foreign key (activity_id, couple_id) references public.activities (id, couple_id) on delete cascade
);
create trigger activity_ratings_touch before update on public.activity_ratings
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Moments: a private shared feed of clips, photos, links and notes (just the two of you)
-- ---------------------------------------------------------------------------
create table public.moments (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references public.couples (id) on delete cascade,
  author_id   uuid references auth.users (id) on delete set null default auth.uid(),
  kind        public.moment_kind not null,
  caption     text check (caption is null or char_length(caption) <= 500),
  media_path  text check (media_path is null or media_path like couple_id::text || '/%'),
  media_mime  text check (media_mime is null or media_mime ~ '^(image|video)/[a-z0-9.+-]+$'),
  link_url    text check (link_url is null or (link_url ~ '^https://' and char_length(link_url) <= 2000)),
  created_at  timestamptz not null default now(),
  unique (id, couple_id),
  check (
    (kind in ('photo', 'video') and media_path is not null and media_mime is not null) or
    (kind = 'link' and link_url is not null) or
    (kind = 'note' and caption is not null and char_length(btrim(caption)) > 0)
  )
);
create index moments_couple_idx on public.moments (couple_id, created_at desc);

create table public.moment_reactions (
  moment_id  uuid not null,
  couple_id  uuid not null,
  user_id    uuid not null references auth.users (id) on delete cascade default auth.uid(),
  reaction   text not null check (reaction in ('heart', 'laugh', 'fire', 'wow', 'hug')),
  created_at timestamptz not null default now(),
  primary key (moment_id, user_id),
  foreign key (moment_id, couple_id) references public.moments (id, couple_id) on delete cascade
);

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.profiles            enable row level security;
alter table public.couples             enable row level security;
alter table public.couple_members      enable row level security;
alter table public.story_entries       enable row level security;
alter table public.private_answers     enable row level security;
alter table public.pulses              enable row level security;
alter table public.checkins            enable row level security;
alter table public.checkin_responses   enable row level security;
alter table public.appreciation_notes  enable row level security;
alter table public.date_ideas          enable row level security;
alter table public.activities          enable row level security;
alter table public.activity_ratings    enable row level security;
alter table public.moments             enable row level security;
alter table public.moment_reactions    enable row level security;

-- profiles: self + partner can read; only self can write.
create policy profiles_select on public.profiles for select to authenticated
  using (user_id = (select auth.uid()) or user_id = (select public.my_partner_id()));
create policy profiles_insert on public.profiles for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- couples: members read; members update only city/together_since/cadence_reviewed_at
-- (column grants below). Creation and joining happen only through RPCs.
create policy couples_select on public.couples for select to authenticated
  using (public.is_couple_member(id));
create policy couples_update on public.couples for update to authenticated
  using (public.is_couple_member(id)) with check (public.is_couple_member(id));

create policy couple_members_select on public.couple_members for select to authenticated
  using (couple_id = (select public.my_couple_id()));

-- story: shared between the two partners.
create policy story_select on public.story_entries for select to authenticated
  using (couple_id = (select public.my_couple_id()));
create policy story_insert on public.story_entries for insert to authenticated
  with check (couple_id = (select public.my_couple_id()) and author_id = (select auth.uid()));
create policy story_update on public.story_entries for update to authenticated
  using (couple_id = (select public.my_couple_id()))
  with check (couple_id = (select public.my_couple_id()));
create policy story_delete on public.story_entries for delete to authenticated
  using (couple_id = (select public.my_couple_id()));

-- private answers: OWNER ONLY. There is deliberately no partner policy.
create policy private_answers_select on public.private_answers for select to authenticated
  using (user_id = (select auth.uid()));
create policy private_answers_insert on public.private_answers for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy private_answers_update on public.private_answers for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy private_answers_delete on public.private_answers for delete to authenticated
  using (user_id = (select auth.uid()));

-- pulses: own always; partner's only once both submitted that week.
create policy pulses_select on public.pulses for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.pulse_week_revealed(couple_id, week_start)
  );
create policy pulses_insert on public.pulses for insert to authenticated
  with check (user_id = (select auth.uid()) and couple_id = (select public.my_couple_id()));
create policy pulses_update on public.pulses for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and couple_id = (select public.my_couple_id()));

-- checkins: members read; rows are created by ensure_checkin().
create policy checkins_select on public.checkins for select to authenticated
  using (public.is_couple_member(couple_id));

-- checkin responses: own always; partner's only after both submitted. Final once submitted.
create policy checkin_responses_select on public.checkin_responses for select to authenticated
  using (user_id = (select auth.uid()) or public.checkin_revealed(checkin_id));
create policy checkin_responses_insert on public.checkin_responses for insert to authenticated
  with check (user_id = (select auth.uid()) and couple_id = (select public.my_couple_id()));

-- appreciation notes: shared; author can delete their own.
create policy notes_select on public.appreciation_notes for select to authenticated
  using (couple_id = (select public.my_couple_id()));
create policy notes_insert on public.appreciation_notes for insert to authenticated
  with check (couple_id = (select public.my_couple_id()) and author_id = (select auth.uid()));
create policy notes_delete on public.appreciation_notes for delete to authenticated
  using (author_id = (select auth.uid()));

-- date ideas: shared.
create policy ideas_select on public.date_ideas for select to authenticated
  using (couple_id = (select public.my_couple_id()));
create policy ideas_insert on public.date_ideas for insert to authenticated
  with check (couple_id = (select public.my_couple_id()) and requested_by = (select auth.uid()));
create policy ideas_update on public.date_ideas for update to authenticated
  using (couple_id = (select public.my_couple_id()))
  with check (couple_id = (select public.my_couple_id()));
create policy ideas_delete on public.date_ideas for delete to authenticated
  using (couple_id = (select public.my_couple_id()));

-- activities: shared.
create policy activities_select on public.activities for select to authenticated
  using (couple_id = (select public.my_couple_id()));
create policy activities_insert on public.activities for insert to authenticated
  with check (couple_id = (select public.my_couple_id()) and created_by = (select auth.uid()));
create policy activities_update on public.activities for update to authenticated
  using (couple_id = (select public.my_couple_id()))
  with check (couple_id = (select public.my_couple_id()));
create policy activities_delete on public.activities for delete to authenticated
  using (couple_id = (select public.my_couple_id()));

-- ratings: shared read; each partner writes only their own rating.
create policy ratings_select on public.activity_ratings for select to authenticated
  using (couple_id = (select public.my_couple_id()));
create policy ratings_insert on public.activity_ratings for insert to authenticated
  with check (user_id = (select auth.uid()) and couple_id = (select public.my_couple_id()));
create policy ratings_update on public.activity_ratings for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and couple_id = (select public.my_couple_id()));
create policy ratings_delete on public.activity_ratings for delete to authenticated
  using (user_id = (select auth.uid()));

-- moments: shared feed; the author can delete their own.
create policy moments_select on public.moments for select to authenticated
  using (couple_id = (select public.my_couple_id()));
create policy moments_insert on public.moments for insert to authenticated
  with check (couple_id = (select public.my_couple_id()) and author_id = (select auth.uid()));
create policy moments_delete on public.moments for delete to authenticated
  using (author_id = (select auth.uid()));

create policy reactions_select on public.moment_reactions for select to authenticated
  using (couple_id = (select public.my_couple_id()));
create policy reactions_insert on public.moment_reactions for insert to authenticated
  with check (user_id = (select auth.uid()) and couple_id = (select public.my_couple_id()));
create policy reactions_update on public.moment_reactions for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and couple_id = (select public.my_couple_id()));
create policy reactions_delete on public.moment_reactions for delete to authenticated
  using (user_id = (select auth.uid()));

-- =============================================================================
-- Privileges: signed-out users get nothing; signed-in users get only what the
-- policies above allow. (Supabase grants broadly by default; we narrow it.)
-- =============================================================================
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

grant usage on schema public to authenticated;

grant select, insert, update on public.profiles to authenticated;
grant select on public.couples to authenticated;
grant update (city, together_since, cadence_reviewed_at) on public.couples to authenticated;
grant select on public.couple_members to authenticated;
grant select, insert, update, delete on public.story_entries to authenticated;
grant select, insert, update, delete on public.private_answers to authenticated;
grant select, insert, update on public.pulses to authenticated;
grant select on public.checkins to authenticated;
grant select, insert on public.checkin_responses to authenticated;
grant select, insert, delete on public.appreciation_notes to authenticated;
grant select, insert, update, delete on public.date_ideas to authenticated;
grant select, insert, update, delete on public.activities to authenticated;
grant select, insert, update, delete on public.activity_ratings to authenticated;
grant select, insert, delete on public.moments to authenticated;
grant select, insert, update, delete on public.moment_reactions to authenticated;

grant execute on function public.my_couple_id() to authenticated;
grant execute on function public.my_partner_id() to authenticated;
grant execute on function public.is_couple_member(uuid) to authenticated;
grant execute on function public.create_couple() to authenticated;
grant execute on function public.join_couple(text) to authenticated;
grant execute on function public.regenerate_invite() to authenticated;
grant execute on function public.pulse_week_revealed(uuid, date) to authenticated;
grant execute on function public.pulse_status(date) to authenticated;
grant execute on function public.checkin_revealed(uuid) to authenticated;
grant execute on function public.ensure_checkin(text) to authenticated;
grant execute on function public.checkin_status(text) to authenticated;
grant execute on function public.set_checkin_summary(uuid, text) to authenticated;

-- Trigger functions and the code generator are internal only.
grant execute on function public.touch_updated_at() to authenticated;
grant execute on function public.enforce_adult_profile() to authenticated;
grant execute on function public.enforce_two_members() to authenticated;
