-- Boundaries, versioned couple agreements, and shared Our Goals.
-- Draft text is readable only by its author. Nothing here sends a notification.

create table public.boundaries (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('safety','substances','honesty','time','money','family','intimacy','privacy','custom')),
  text text not null check (char_length(btrim(text)) between 1 and 280),
  my_action text not null check (char_length(btrim(my_action)) between 1 and 280),
  status text not null default 'draft' check (status in ('draft','shared','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index boundaries_couple_idx on public.boundaries(couple_id, updated_at);

create function public.guard_boundary_status() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.id <> old.id or new.author_id <> old.author_id or new.couple_id <> old.couple_id then
      raise exception 'A boundary cannot change owner or couple.' using errcode = 'P0001';
    end if;
    if old.status = 'draft' and new.status = 'archived' then
      raise exception 'A draft can be deleted or shared. Archive is for something already shared.' using errcode = 'P0001';
    end if;
    if old.status = 'shared' and new.status = 'draft' then
      raise exception 'A shared boundary stays visible. You can archive it.' using errcode = 'P0001';
    end if;
    if old.status = 'archived' and new.status <> 'archived' then
      raise exception 'An archived boundary stays in the history.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create trigger boundaries_guard before insert or update on public.boundaries
  for each row execute function public.guard_boundary_status();
create trigger boundaries_touch before update on public.boundaries
  for each row execute function public.touch_updated_at();

alter table public.boundaries enable row level security;
create policy boundaries_read on public.boundaries for select to authenticated
  using (public.is_couple_member(couple_id) and (author_id = auth.uid() or status in ('shared','archived')));
create policy boundaries_insert on public.boundaries for insert to authenticated
  with check (author_id = auth.uid() and couple_id = public.my_couple_id() and status = 'draft');
create policy boundaries_update on public.boundaries for update to authenticated
  using (author_id = auth.uid() and public.is_couple_member(couple_id))
  with check (author_id = auth.uid() and couple_id = public.my_couple_id());
create policy boundaries_delete_draft on public.boundaries for delete to authenticated
  using (author_id = auth.uid() and status = 'draft');

create table public.boundary_acks (
  boundary_id uuid not null references public.boundaries(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  response text not null check (response in ('understood','discuss')),
  created_at timestamptz not null default now(),
  primary key (boundary_id, user_id)
);
alter table public.boundary_acks enable row level security;
create policy boundary_acks_read on public.boundary_acks for select to authenticated
  using (exists (
    select 1 from public.boundaries b
    where b.id = boundary_id and public.is_couple_member(b.couple_id) and (b.author_id = auth.uid() or b.status in ('shared','archived'))
  ));
create policy boundary_acks_insert on public.boundary_acks for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.boundaries b
      where b.id = boundary_id and b.status = 'shared' and b.author_id <> auth.uid() and public.is_couple_member(b.couple_id)
    )
  );

create table public.boundary_seen (
  user_id uuid primary key references auth.users(id) on delete cascade,
  seen_at timestamptz not null default now()
);
alter table public.boundary_seen enable row level security;
create policy boundary_seen_own on public.boundary_seen for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create table public.couple_agreements (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  status text not null default 'proposed' check (status in ('proposed','active','left','archived')),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.agreement_versions (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null references public.couple_agreements(id) on delete cascade,
  version integer not null check (version >= 1),
  body text not null check (char_length(btrim(body)) between 1 and 500),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (agreement_id, version)
);
create table public.agreement_acceptances (
  agreement_id uuid not null references public.couple_agreements(id) on delete cascade,
  version integer not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (agreement_id, version, user_id),
  foreign key (agreement_id, version) references public.agreement_versions(agreement_id, version)
);

create function public.guard_agreement() returns trigger language plpgsql set search_path = '' as $$
declare
  latest integer;
  accepts integer;
begin
  if tg_op = 'UPDATE' then
    if new.id <> old.id or new.couple_id <> old.couple_id or new.created_by <> old.created_by then
      raise exception 'An agreement cannot change owner or couple.' using errcode = 'P0001';
    end if;
    if new.status = 'active' and old.status is distinct from 'active' then
      select max(version) into latest from public.agreement_versions where agreement_id = new.id;
      select count(distinct user_id) into accepts from public.agreement_acceptances where agreement_id = new.id and version = latest;
      if coalesce(accepts, 0) < 2 then
        raise exception 'Both people accept before this agreement is active.' using errcode = 'P0001';
      end if;
    end if;
  end if;
  return new;
end $$;
create trigger couple_agreements_guard before update on public.couple_agreements
  for each row execute function public.guard_agreement();
create trigger couple_agreements_touch before update on public.couple_agreements
  for each row execute function public.touch_updated_at();

create function public.activate_agreement() returns trigger language plpgsql security definer set search_path = '' as $$
declare
  accepts integer;
begin
  select count(distinct user_id) into accepts from public.agreement_acceptances where agreement_id = new.agreement_id and version = new.version;
  if accepts >= 2 then
    update public.couple_agreements set status = 'active', updated_at = now()
      where id = new.agreement_id and status = 'proposed';
  end if;
  return new;
end $$;
create trigger agreement_acceptances_activate after insert on public.agreement_acceptances
  for each row execute function public.activate_agreement();

create function public.reopen_agreement_version() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.couple_agreements set status = 'proposed', updated_at = now()
    where id = new.agreement_id and status = 'active';
  return new;
end $$;
create trigger agreement_versions_reopen after insert on public.agreement_versions
  for each row execute function public.reopen_agreement_version();

alter table public.couple_agreements enable row level security;
alter table public.agreement_versions enable row level security;
alter table public.agreement_acceptances enable row level security;
create policy agreements_read on public.couple_agreements for select to authenticated using (public.is_couple_member(couple_id));
create policy agreements_insert on public.couple_agreements for insert to authenticated
  with check (created_by = auth.uid() and couple_id = public.my_couple_id() and status = 'proposed');
create policy agreements_update on public.couple_agreements for update to authenticated
  using (public.is_couple_member(couple_id)) with check (couple_id = public.my_couple_id());
create policy agreement_versions_read on public.agreement_versions for select to authenticated
  using (exists (select 1 from public.couple_agreements a where a.id = agreement_id and public.is_couple_member(a.couple_id)));
create policy agreement_versions_insert on public.agreement_versions for insert to authenticated
  with check (created_by = auth.uid() and exists (select 1 from public.couple_agreements a where a.id = agreement_id and a.couple_id = public.my_couple_id()));
create policy agreement_accept_read on public.agreement_acceptances for select to authenticated
  using (exists (select 1 from public.couple_agreements a where a.id = agreement_id and public.is_couple_member(a.couple_id)));
create policy agreement_accept_insert on public.agreement_acceptances for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.couple_agreements a where a.id = agreement_id and public.is_couple_member(a.couple_id)));

create table public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  constraint notifications_not_built check (enabled = false)
);
alter table public.notification_preferences enable row level security;
create policy notification_prefs_own on public.notification_preferences for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create table public.our_goals (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  goal_type text not null check (goal_type in ('money','home','health','travel','business','relationship','custom')),
  title text not null default '' check (char_length(title) <= 160),
  status text not null default 'drafting' check (status in ('drafting','active','paused','archived')),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.our_goal_drafts (
  goal_id uuid not null references public.our_goals(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  version_text text not null check (char_length(btrim(version_text)) between 1 and 200),
  why text not null check (char_length(btrim(why)) between 1 and 400),
  submitted_at timestamptz,
  primary key (goal_id, author_id)
);
create table public.our_goal_milestones (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.our_goals(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  done boolean not null default false,
  position integer not null default 0
);
create table public.our_goal_parts (
  milestone_id uuid not null references public.our_goal_milestones(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 200),
  primary key (milestone_id, user_id)
);
create table public.our_goal_events (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.our_goals(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  note text not null check (char_length(note) between 1 and 200),
  created_at timestamptz not null default now()
);
create table public.our_goal_checkins (
  goal_id uuid not null references public.our_goals(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  week date not null,
  win text not null,
  my_part text not null,
  need text not null,
  blocker text not null,
  primary key (goal_id, user_id, week)
);

create function public.goal_versions_revealed(p_goal_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_couple_member((select couple_id from public.our_goals where id = p_goal_id))
    and (select count(*) from public.our_goal_drafts where goal_id = p_goal_id and submitted_at is not null) >= 2
$$;
revoke all on function public.goal_versions_revealed(uuid) from public;
grant execute on function public.goal_versions_revealed(uuid) to authenticated;

alter table public.our_goals enable row level security;
alter table public.our_goal_drafts enable row level security;
alter table public.our_goal_milestones enable row level security;
alter table public.our_goal_parts enable row level security;
alter table public.our_goal_events enable row level security;
alter table public.our_goal_checkins enable row level security;

create policy our_goals_read on public.our_goals for select to authenticated using (public.is_couple_member(couple_id));
create policy our_goals_insert on public.our_goals for insert to authenticated
  with check (created_by = auth.uid() and couple_id = public.my_couple_id() and status = 'drafting' and title = '');
create policy our_goals_update on public.our_goals for update to authenticated
  using (public.is_couple_member(couple_id)) with check (couple_id = public.my_couple_id());

create policy goal_draft_read on public.our_goal_drafts for select to authenticated
  using (author_id = auth.uid() or (submitted_at is not null and public.goal_versions_revealed(goal_id)));
create policy goal_draft_write on public.our_goal_drafts for insert to authenticated
  with check (author_id = auth.uid() and exists (select 1 from public.our_goals g where g.id = goal_id and g.couple_id = public.my_couple_id()));
create policy goal_draft_update on public.our_goal_drafts for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());

create policy goal_milestone_rw on public.our_goal_milestones for all to authenticated
  using (exists (select 1 from public.our_goals g where g.id = goal_id and public.is_couple_member(g.couple_id) and g.status <> 'drafting'))
  with check (exists (select 1 from public.our_goals g where g.id = goal_id and g.couple_id = public.my_couple_id() and g.status <> 'drafting'));
create policy goal_parts_rw on public.our_goal_parts for all to authenticated
  using (exists (
    select 1 from public.our_goal_milestones m join public.our_goals g on g.id = m.goal_id
    where m.id = milestone_id and public.is_couple_member(g.couple_id) and g.status <> 'drafting'
  ))
  with check (exists (
    select 1 from public.our_goal_milestones m join public.our_goals g on g.id = m.goal_id
    where m.id = milestone_id and g.couple_id = public.my_couple_id() and g.status <> 'drafting'
  ));
create policy goal_events_read on public.our_goal_events for select to authenticated
  using (exists (select 1 from public.our_goals g where g.id = goal_id and public.is_couple_member(g.couple_id) and g.status <> 'drafting'));
create policy goal_events_insert on public.our_goal_events for insert to authenticated
  with check (actor_id = auth.uid() and exists (select 1 from public.our_goals g where g.id = goal_id and g.couple_id = public.my_couple_id()));
create policy goal_checkin_rw on public.our_goal_checkins for all to authenticated
  using (user_id = auth.uid() or exists (select 1 from public.our_goals g where g.id = goal_id and public.goal_versions_revealed(g.id)))
  with check (user_id = auth.uid() and exists (select 1 from public.our_goals g where g.id = goal_id and g.couple_id = public.my_couple_id()));

create trigger our_goals_touch before update on public.our_goals
  for each row execute function public.touch_updated_at();

grant select, insert, update, delete on public.boundaries, public.boundary_acks, public.boundary_seen,
  public.couple_agreements, public.agreement_versions, public.agreement_acceptances, public.notification_preferences,
  public.our_goals, public.our_goal_drafts, public.our_goal_milestones, public.our_goal_parts, public.our_goal_events, public.our_goal_checkins
  to authenticated;
grant select on public.boundaries, public.boundary_acks, public.boundary_seen,
  public.couple_agreements, public.agreement_versions, public.agreement_acceptances, public.notification_preferences,
  public.our_goals, public.our_goal_drafts, public.our_goal_milestones, public.our_goal_parts, public.our_goal_events, public.our_goal_checkins
  to anon;
