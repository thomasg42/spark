-- Module L. Sensitive text is sealed in the Edge Function, never stored as plaintext.
create table public.dream_roadmap_consent (
 couple_id uuid not null references public.couples(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 enabled boolean not null default false,
 primary key(couple_id,user_id)
);
alter table public.dream_roadmap_consent enable row level security;
create policy roadmap_consent_read on public.dream_roadmap_consent for select to authenticated using(public.is_couple_member(couple_id));
create policy roadmap_consent_write on public.dream_roadmap_consent for insert with check(user_id=auth.uid() and couple_id=public.my_couple_id());
create policy roadmap_consent_update on public.dream_roadmap_consent for update using(user_id=auth.uid() and couple_id=public.my_couple_id()) with check(user_id=auth.uid() and couple_id=public.my_couple_id());
create policy roadmap_consent_delete on public.dream_roadmap_consent for delete using(user_id=auth.uid());
create function public.dream_roadmap_enabled(p_couple_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.is_couple_member(p_couple_id) and (select count(*) from public.couple_members m join public.dream_roadmap_consent c on c.user_id=m.user_id and c.couple_id=m.couple_id where m.couple_id=p_couple_id and c.enabled)=2
$$;
revoke all on function public.dream_roadmap_enabled(uuid) from public;
grant execute on function public.dream_roadmap_enabled(uuid) to authenticated;
create table public.shared_dreams (
 id uuid primary key default gen_random_uuid(),
 couple_id uuid not null references public.couples(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check(kind in ('dream','roadmap','forecast','support','appreciation','bid','anchors','reflection','summary')),
 visibility text not null default 'private' check(visibility in ('private','shared')),
 payload_ciphertext text not null check(payload_ciphertext like 'v1.%' and length(payload_ciphertext)<=50000),
 updated_at timestamptz not null default now(),
 check(kind not in ('anchors','reflection','bid') or visibility='private'),
 check(kind not in ('roadmap','forecast','support','appreciation','summary') or visibility='shared')
);
create index shared_dreams_couple_idx on public.shared_dreams(couple_id,updated_at);
create unique index shared_dreams_singleton_idx on public.shared_dreams(couple_id,owner_id,kind) where kind in ('anchors','reflection');
create function public.freeze_shared_dream_identity() returns trigger language plpgsql set search_path='' as $$
begin
 if new.id<>old.id or new.owner_id<>old.owner_id or new.couple_id<>old.couple_id or new.kind<>old.kind then
 raise exception 'A saved card cannot change owner, couple or kind.' using errcode='P0001';
 end if;
 return new;
end $$;
create trigger shared_dream_identity before update on public.shared_dreams for each row execute function public.freeze_shared_dream_identity();
create trigger shared_dream_touch before update on public.shared_dreams for each row execute function public.touch_updated_at();
alter table public.shared_dreams enable row level security;
create policy shared_dream_read on public.shared_dreams for select to authenticated using(public.is_couple_member(couple_id) and (owner_id=auth.uid() or visibility='shared') and (kind<>'roadmap' or public.dream_roadmap_enabled(couple_id)));
create policy shared_dream_insert on public.shared_dreams for insert with check(owner_id=auth.uid() and couple_id=public.my_couple_id() and (kind<>'roadmap' or public.dream_roadmap_enabled(couple_id)));
create policy shared_dream_update on public.shared_dreams for update using(owner_id=auth.uid() and public.is_couple_member(couple_id) and (kind<>'roadmap' or public.dream_roadmap_enabled(couple_id))) with check(owner_id=auth.uid() and couple_id=public.my_couple_id() and (kind<>'roadmap' or public.dream_roadmap_enabled(couple_id)));
create policy shared_dream_delete on public.shared_dreams for delete using(owner_id=auth.uid() and public.is_couple_member(couple_id));
grant select,insert,update,delete on public.shared_dreams,public.dream_roadmap_consent to authenticated;
grant select on public.shared_dreams,public.dream_roadmap_consent to anon;
