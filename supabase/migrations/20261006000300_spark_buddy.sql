-- =============================================================================
-- Spark Buddy: opt-in shares, private conversation, and the shared date calendar
--
-- Privacy model (enforced here, in the database, not just in the UI):
--   * buddy_shares holds ONLY what an answer's author chose to let their partner's
--     Buddy see: an approved hint or the answer snapshot they marked open. An
--     answer that is "off the table" (the default) never gets a row at all.
--     The author reads and writes their own rows; the partner may only READ rows,
--     and only hint/open ones. Text is AES-GCM ciphertext sealed by the Edge
--     Function (couple scope, bound to author + question); the database never
--     sees the key.
--   * buddy_messages (the conversation with your Buddy) is owner-only, encrypted
--     under the user scope. The partner can never select it.
--   * date_plans is shared by the couple (both see the calendar); only the
--     creator can delete their plan.
--   * anon (signed-out) has no access to any of it.
-- =============================================================================

create type public.buddy_share_level as enum ('hint', 'open');

create table public.buddy_shares (
  user_id           uuid not null references auth.users (id) on delete cascade default auth.uid(),
  couple_id         uuid not null references public.couples (id) on delete cascade,
  question_id       text not null check (question_id ~ '^[a-z0-9_]{2,60}$'),
  level             public.buddy_share_level not null,
  shared_ciphertext text not null check (shared_ciphertext like 'v1.%'),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  primary key (user_id, question_id)
);
create index buddy_shares_couple_idx on public.buddy_shares (couple_id);
create trigger buddy_shares_touch before update on public.buddy_shares
  for each row execute function public.touch_updated_at();

create table public.buddy_messages (
  id              uuid primary key,
  seq             bigint generated always as identity,
  user_id         uuid not null references auth.users (id) on delete cascade default auth.uid(),
  couple_id       uuid not null references public.couples (id) on delete cascade,
  role            text not null check (role in ('user', 'buddy')),
  body_ciphertext text not null check (body_ciphertext like 'v1.%'),
  created_at      timestamptz not null default now()
);
create index buddy_messages_user_idx on public.buddy_messages (user_id, created_at desc, seq desc);

create table public.date_plans (
  id           uuid primary key default gen_random_uuid(),
  couple_id    uuid not null references public.couples (id) on delete cascade,
  created_by   uuid references auth.users (id) on delete set null default auth.uid(),
  title        text not null check (char_length(btrim(title)) between 1 and 120),
  planned_for  date not null,
  planned_time time,
  note         text check (note is null or char_length(note) <= 500),
  created_at   timestamptz not null default now()
);
create index date_plans_couple_idx on public.date_plans (couple_id, planned_for);

alter table public.buddy_shares   enable row level security;
alter table public.buddy_messages enable row level security;
alter table public.date_plans     enable row level security;

-- buddy_shares: author full control of their own rows, inside their own couple;
-- the partner may read hint/open rows (the only levels a row can have).
create policy buddy_shares_select on public.buddy_shares for select to authenticated
  using (
    user_id = (select auth.uid())
    or (couple_id = (select public.my_couple_id()) and user_id = (select public.my_partner_id()) and level in ('hint', 'open'))
  );
create policy buddy_shares_insert on public.buddy_shares for insert to authenticated
  with check (user_id = (select auth.uid()) and couple_id = (select public.my_couple_id()));
create policy buddy_shares_update on public.buddy_shares for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and couple_id = (select public.my_couple_id()));
create policy buddy_shares_delete on public.buddy_shares for delete to authenticated
  using (user_id = (select auth.uid()));

-- buddy_messages: owner only, always.
create policy buddy_messages_select on public.buddy_messages for select to authenticated
  using (user_id = (select auth.uid()));
create policy buddy_messages_insert on public.buddy_messages for insert to authenticated
  with check (user_id = (select auth.uid()) and couple_id = (select public.my_couple_id()));
create policy buddy_messages_delete on public.buddy_messages for delete to authenticated
  using (user_id = (select auth.uid()));

-- date_plans: the couple's shared calendar; the creator can delete their own.
create policy date_plans_select on public.date_plans for select to authenticated
  using (couple_id = (select public.my_couple_id()));
create policy date_plans_insert on public.date_plans for insert to authenticated
  with check (couple_id = (select public.my_couple_id()) and created_by = (select auth.uid()));
create policy date_plans_delete on public.date_plans for delete to authenticated
  using (couple_id = (select public.my_couple_id()) and created_by = (select auth.uid()));

revoke all on public.buddy_shares, public.buddy_messages, public.date_plans from anon, authenticated;
grant select, insert, update, delete on public.buddy_shares to authenticated;
grant select, insert, delete on public.buddy_messages to authenticated;
grant select, insert, delete on public.date_plans to authenticated;
