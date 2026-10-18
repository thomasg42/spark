-- A deliberate request for attention, separate from private check-in answers.
-- Only routing and lifecycle metadata is stored or published to Realtime.
create table public.attention_signals (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  subject text not null check (subject in ('self', 'partner')),
  created_at timestamptz not null default clock_timestamp(),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  check (acknowledged_at is null or acknowledged_at >= created_at),
  check (resolved_at is null or resolved_at >= created_at),
  check (acknowledged_at is null or resolved_at is null or resolved_at >= acknowledged_at)
);

create unique index attention_signals_open_author_subject_idx
  on public.attention_signals(couple_id, author_id, subject)
  where resolved_at is null;
create index attention_signals_couple_created_idx on public.attention_signals(couple_id, created_at);

create function public.guard_attention_signal() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.id is distinct from old.id
    or new.couple_id is distinct from old.couple_id
    or new.author_id is distinct from old.author_id
    or new.subject is distinct from old.subject
    or new.created_at is distinct from old.created_at then
    raise exception 'An attention signal cannot change its identity.' using errcode = 'P0001';
  end if;
  if old.acknowledged_at is not null and new.acknowledged_at is distinct from old.acknowledged_at then
    raise exception 'An acknowledgement cannot be changed.' using errcode = 'P0001';
  end if;
  if old.resolved_at is not null and (
    new.resolved_at is distinct from old.resolved_at
    or new.acknowledged_at is distinct from old.acknowledged_at
  ) then
    raise exception 'A resolved attention signal cannot be changed.' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger attention_signals_guard before update on public.attention_signals
  for each row execute function public.guard_attention_signal();

alter table public.attention_signals enable row level security;
-- Resolved rows remain readable so clients receive and reconcile resolution
-- updates through the same policy as new signals.
create policy attention_signals_read on public.attention_signals for select to authenticated
  using (public.is_couple_member(couple_id));

create function public.raise_attention(p_subject text) returns public.attention_signals
language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_couple_id uuid;
  v_signal public.attention_signals;
begin
  if v_user_id is null then
    raise exception 'Please sign in first.' using errcode = '28000';
  end if;
  if p_subject is null or p_subject not in ('self', 'partner') then
    raise exception 'Choose self or partner.' using errcode = '22023';
  end if;

  -- All three RPCs lock the same couple row before inspecting or changing a
  -- signal. Repeated raises and simultaneous acknowledgement/resolution are
  -- serialized, without a duplicate raise producing a Realtime update.
  select c.id into v_couple_id
    from public.couples c join public.couple_members m on m.couple_id = c.id
    where m.user_id = v_user_id for update of c;
  if v_couple_id is null or (select count(*) from public.couple_members where couple_id = v_couple_id) <> 2 then
    raise exception 'Pair with your partner before raising an attention request.' using errcode = 'P0001';
  end if;

  select * into v_signal from public.attention_signals
    where couple_id = v_couple_id and author_id = v_user_id and subject = p_subject and resolved_at is null;
  if found then
    return v_signal;
  end if;
  insert into public.attention_signals(couple_id, author_id, subject)
    values (v_couple_id, v_user_id, p_subject) returning * into v_signal;
  return v_signal;
end $$;

create function public.acknowledge_attention(p_id uuid) returns public.attention_signals
language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_couple_id uuid;
  v_signal public.attention_signals;
begin
  if v_user_id is null then
    raise exception 'Please sign in first.' using errcode = '28000';
  end if;
  select c.id into v_couple_id
    from public.couples c join public.couple_members m on m.couple_id = c.id
    where m.user_id = v_user_id for update of c;
  if v_couple_id is null or (select count(*) from public.couple_members where couple_id = v_couple_id) <> 2 then
    raise exception 'That attention request is not available.' using errcode = 'P0002';
  end if;
  select * into v_signal from public.attention_signals
    where id = p_id and couple_id = v_couple_id and author_id <> v_user_id and resolved_at is null;
  if not found then
    raise exception 'That attention request is not available.' using errcode = 'P0002';
  end if;
  if v_signal.acknowledged_at is null then
    -- A transaction may have waited for another mutation's couple lock.
    -- Use mutation time, not its earlier transaction-start time.
    update public.attention_signals set acknowledged_at = greatest(clock_timestamp(), v_signal.created_at)
      where id = v_signal.id returning * into v_signal;
  end if;
  return v_signal;
end $$;

create function public.resolve_attention(p_id uuid) returns public.attention_signals
language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_couple_id uuid;
  v_signal public.attention_signals;
begin
  if v_user_id is null then
    raise exception 'Please sign in first.' using errcode = '28000';
  end if;
  select c.id into v_couple_id
    from public.couples c join public.couple_members m on m.couple_id = c.id
    where m.user_id = v_user_id for update of c;
  if v_couple_id is null or (select count(*) from public.couple_members where couple_id = v_couple_id) <> 2 then
    raise exception 'That attention request is not available.' using errcode = 'P0002';
  end if;
  select * into v_signal from public.attention_signals
    where id = p_id and couple_id = v_couple_id and author_id = v_user_id;
  if not found then
    raise exception 'That attention request is not available.' using errcode = 'P0002';
  end if;
  if v_signal.resolved_at is null then
    update public.attention_signals set resolved_at = greatest(clock_timestamp(), v_signal.created_at, v_signal.acknowledged_at)
      where id = v_signal.id returning * into v_signal;
  end if;
  return v_signal;
end $$;

-- Supabase defaults may grant broadly. Clients can read only under RLS, and
-- can change lifecycle state only through the authenticated RPCs above.
revoke all on public.attention_signals from public, anon, authenticated, service_role;
grant select on public.attention_signals to authenticated;
revoke all on function public.guard_attention_signal() from public, anon, authenticated, service_role;
revoke all on function public.raise_attention(text) from public, anon, authenticated, service_role;
revoke all on function public.acknowledge_attention(uuid) from public, anon, authenticated, service_role;
revoke all on function public.resolve_attention(uuid) from public, anon, authenticated, service_role;
grant execute on function public.raise_attention(text), public.acknowledge_attention(uuid), public.resolve_attention(uuid) to authenticated;

-- The local PGlite harness has no Realtime publication. Production Supabase
-- does; keep this migration usable in both environments and avoid duplicate
-- registration if the publication already includes all public tables.
do $$
begin
  if exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_catalog.pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'attention_signals'
    ) then
    alter publication supabase_realtime add table public.attention_signals;
  end if;
end $$;
