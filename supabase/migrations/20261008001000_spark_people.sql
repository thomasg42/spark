-- Reuse the existing encrypted shared-card store for people and gatherings.
alter table public.shared_dreams drop constraint shared_dreams_kind_check;
alter table public.shared_dreams add constraint shared_dreams_kind_check check(kind in ('dream','roadmap','forecast','support','appreciation','bid','anchors','reflection','summary','person','gathering','health'));
alter table public.shared_dreams add constraint shared_dreams_people_visibility check((kind not in ('person','gathering') or visibility='shared') and (kind<>'health' or visibility='private'));
create unique index shared_health_singleton on public.shared_dreams(couple_id,owner_id,kind) where kind='health';
