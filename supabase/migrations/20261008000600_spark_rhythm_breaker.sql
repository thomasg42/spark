-- Spark Module E: Rhythm Breaker (2026-10-08).
--
-- date_rules: a standing date night ("every Wednesday 6 to 9 PM: date night,
--   then we each go home"). Shared by the couple; the person who set it can
--   change, pause or remove it.
-- life_changes: a new job, a new schedule, a move. Shared by the couple (it
--   raises the couple's check-in rhythm one step for six weeks); the person who
--   logged it can remove it.
--
-- Neither table tracks anyone: no location, no device data. Both partners see
-- both tables in full, and outsiders see nothing.

create table public.date_rules (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references public.couples (id) on delete cascade,
  created_by  uuid references auth.users (id) on delete set null default auth.uid(),
  title       text not null check (char_length(btrim(title)) between 1 and 120),
  weekday     smallint not null check (weekday between 0 and 6),   -- 0 = Sunday, like Date.getDay()
  start_time  time not null,
  end_time    time not null,
  note        text check (note is null or char_length(note) <= 500),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (end_time > start_time)
);
create index date_rules_couple_idx on public.date_rules (couple_id);

create trigger date_rules_touch before update on public.date_rules
  for each row execute function public.touch_updated_at();

-- A couple keeps a handful of standing dates, not a schedule.
create or replace function public.date_rules_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.date_rules where couple_id = new.couple_id) >= 5 then
    raise exception 'You already have 5 standing dates. Remove one first.';  -- P0001: the app shows this message as is
  end if;
  return new;
end;
$$;
create trigger date_rules_limit before insert on public.date_rules
  for each row execute function public.date_rules_limit();

-- Only the title, time, note and pause switch may change; never whose couple it is or who set it.
create or replace function public.date_rules_freeze()
returns trigger language plpgsql as $$
begin
  if new.couple_id is distinct from old.couple_id or new.created_by is distinct from old.created_by then
    raise exception 'A standing date stays with the person who set it.';
  end if;
  return new;
end;
$$;
create trigger date_rules_freeze before update on public.date_rules
  for each row execute function public.date_rules_freeze();

-- trip / work_stretch mean time apart: they unlock "when we're apart" hints (Module H) and do not change the rhythm.
create type public.life_change_kind as enum ('new_job', 'new_schedule', 'move', 'other', 'trip', 'work_stretch');

create table public.life_changes (
  id           uuid primary key default gen_random_uuid(),
  couple_id    uuid not null references public.couples (id) on delete cascade,
  created_by   uuid references auth.users (id) on delete set null default auth.uid(),
  kind         public.life_change_kind not null,
  happened_on  date not null check (happened_on > date '2000-01-01'),
  note         text check (note is null or char_length(note) <= 280),
  created_at   timestamptz not null default now()
);
create index life_changes_couple_idx on public.life_changes (couple_id, happened_on desc);

alter table public.date_rules   enable row level security;
alter table public.life_changes enable row level security;

create policy date_rules_select on public.date_rules for select to authenticated
  using (couple_id = (select public.my_couple_id()));
create policy date_rules_insert on public.date_rules for insert to authenticated
  with check (couple_id = (select public.my_couple_id()) and created_by = (select auth.uid()));
create policy date_rules_update on public.date_rules for update to authenticated
  using (couple_id = (select public.my_couple_id()) and created_by = (select auth.uid()))
  with check (couple_id = (select public.my_couple_id()) and created_by = (select auth.uid()));
create policy date_rules_delete on public.date_rules for delete to authenticated
  using (couple_id = (select public.my_couple_id()) and created_by = (select auth.uid()));

create policy life_changes_select on public.life_changes for select to authenticated
  using (couple_id = (select public.my_couple_id()));
create policy life_changes_insert on public.life_changes for insert to authenticated
  with check (couple_id = (select public.my_couple_id()) and created_by = (select auth.uid()));
create policy life_changes_delete on public.life_changes for delete to authenticated
  using (couple_id = (select public.my_couple_id()) and created_by = (select auth.uid()));

revoke all on public.date_rules, public.life_changes from anon, authenticated;
grant select, insert, update, delete on public.date_rules to authenticated;
grant select, insert, delete on public.life_changes to authenticated;
revoke all on function public.date_rules_limit() from public;
