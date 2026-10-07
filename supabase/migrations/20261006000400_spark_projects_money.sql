-- =============================================================================
-- Projects (a ranked, shared list) and Money (savings goals: yours or joint)
--
-- Privacy model (enforced here, in the database):
--   * projects are shared by the couple. Either partner can add, edit, reorder
--     or remove one; nobody outside the couple sees anything.
--   * money_goals:
--       joint  both partners see and update it.
--       mine   only its owner sees or changes it, unless the owner turns on
--              visible_to_partner, which lets the partner READ it (never change it).
--     Amounts are stored as whole cents.
--   * anon (signed-out) has no access to any of it.
-- =============================================================================

create type public.project_kind as enum ('home', 'family', 'money', 'trip', 'other');
create type public.project_status as enum ('planned', 'active', 'done');

create table public.projects (
  id           uuid primary key default gen_random_uuid(),
  couple_id    uuid not null references public.couples (id) on delete cascade,
  created_by   uuid references auth.users (id) on delete set null default auth.uid(),
  title        text not null check (char_length(btrim(title)) between 1 and 120),
  kind         public.project_kind not null default 'other',
  status       public.project_status not null default 'planned',
  rank         integer not null check (rank >= 1),
  target_date  date,
  budget_cents bigint check (budget_cents is null or budget_cents between 0 and 1000000000),
  note         text check (note is null or char_length(note) <= 1000),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index projects_couple_rank_idx on public.projects (couple_id, rank);
create trigger projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();

-- New projects go to the bottom of the list unless a rank is given.
create or replace function public.projects_default_rank()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.rank is null then
    select coalesce(max(p.rank), 0) + 1 into new.rank from public.projects p where p.couple_id = new.couple_id;
  end if;
  return new;
end $$;
create trigger projects_rank before insert on public.projects
  for each row execute function public.projects_default_rank();

-- Swaps a project with its neighbour in one statement (runs as the caller, so RLS applies).
create or replace function public.move_project(p_id uuid, p_direction text)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_project public.projects;
  v_other   public.projects;
begin
  if p_direction not in ('up', 'down') then
    raise exception 'Choose up or down.' using errcode = 'P0001';
  end if;
  select * into v_project from public.projects where id = p_id;
  if not found then
    raise exception 'That project no longer exists.' using errcode = 'P0002';
  end if;
  if p_direction = 'up' then
    select * into v_other from public.projects
      where couple_id = v_project.couple_id and (rank, created_at) < (v_project.rank, v_project.created_at)
      order by rank desc, created_at desc limit 1;
  else
    select * into v_other from public.projects
      where couple_id = v_project.couple_id and (rank, created_at) > (v_project.rank, v_project.created_at)
      order by rank asc, created_at asc limit 1;
  end if;
  if not found then
    return;
  end if;
  if v_other.rank = v_project.rank then
    -- Tied ranks (e.g. two quick inserts): separate them first.
    update public.projects set rank = case when id = v_project.id then
        (case when p_direction = 'up' then v_other.rank else v_other.rank + 1 end)
      else (case when p_direction = 'up' then v_project.rank + 1 else v_project.rank end) end
      where id in (v_project.id, v_other.id);
  else
    update public.projects set rank = case when id = v_project.id then v_other.rank else v_project.rank end
      where id in (v_project.id, v_other.id);
  end if;
end $$;

create table public.money_goals (
  id                 uuid primary key default gen_random_uuid(),
  couple_id          uuid not null references public.couples (id) on delete cascade,
  owner_id           uuid references auth.users (id) on delete set null default auth.uid(),
  scope              text not null check (scope in ('mine', 'joint')),
  title              text not null check (char_length(btrim(title)) between 1 and 80),
  saved_cents        bigint not null default 0 check (saved_cents between 0 and 1000000000),
  target_cents       bigint check (target_cents is null or target_cents between 1 and 1000000000),
  target_date        date,
  visible_to_partner boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index money_goals_couple_idx on public.money_goals (couple_id);
create trigger money_goals_touch before update on public.money_goals
  for each row execute function public.touch_updated_at();

alter table public.projects    enable row level security;
alter table public.money_goals enable row level security;

create policy projects_select on public.projects for select to authenticated
  using (couple_id = (select public.my_couple_id()));
create policy projects_insert on public.projects for insert to authenticated
  with check (couple_id = (select public.my_couple_id()) and created_by = (select auth.uid()));
create policy projects_update on public.projects for update to authenticated
  using (couple_id = (select public.my_couple_id()))
  with check (couple_id = (select public.my_couple_id()));
create policy projects_delete on public.projects for delete to authenticated
  using (couple_id = (select public.my_couple_id()));

create policy money_select on public.money_goals for select to authenticated
  using (
    couple_id = (select public.my_couple_id())
    and (scope = 'joint' or owner_id = (select auth.uid()) or visible_to_partner)
  );
create policy money_insert on public.money_goals for insert to authenticated
  with check (couple_id = (select public.my_couple_id()) and owner_id = (select auth.uid()));
create policy money_update on public.money_goals for update to authenticated
  using (couple_id = (select public.my_couple_id()) and (scope = 'joint' or owner_id = (select auth.uid())))
  with check (couple_id = (select public.my_couple_id()) and (scope = 'joint' or owner_id = (select auth.uid())));
create policy money_delete on public.money_goals for delete to authenticated
  using (couple_id = (select public.my_couple_id()) and (owner_id = (select auth.uid()) or (scope = 'joint' and owner_id is null)));

-- A goal's scope and owner never change after creation (a partner editing a joint
-- goal must not be able to turn it into their private one, or claim someone's).
create or replace function public.money_goals_freeze()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.scope is distinct from old.scope or new.owner_id is distinct from old.owner_id or new.couple_id is distinct from old.couple_id then
    raise exception 'A goal''s owner and type can''t be changed.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger money_goals_freeze before update on public.money_goals
  for each row execute function public.money_goals_freeze();

revoke all on public.projects, public.money_goals from anon, authenticated;
revoke all on function public.move_project(uuid, text) from public, anon;
grant select, insert, update, delete on public.projects to authenticated;
grant select, insert, update, delete on public.money_goals to authenticated;
grant execute on function public.move_project(uuid, text) to authenticated;
grant execute on function public.projects_default_rank() to authenticated;
grant execute on function public.money_goals_freeze() to authenticated;
