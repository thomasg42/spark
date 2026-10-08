-- Module K. Preferences are owner-only. All matching/mutations happen atomically
-- under the couple row lock; callers cannot enumerate another person's choices.
alter table public.profiles add column pronouns text check(length(pronouns)<=40);
create table public.intimacy_catalog (id text primary key);
insert into public.intimacy_catalog values ('quiet'),('walk'),('music'),('touch'),('kiss'),('side'),('seated'),('massage'),('shower'),('sensory'),('toys'),('restraints'),('language'),('fantasy'),('boundaries');
alter table public.intimacy_catalog enable row level security;
create policy intimacy_catalog_read on public.intimacy_catalog for select to authenticated using(true);
grant select on public.intimacy_catalog to authenticated;
create table public.intimacy_preferences (
 couple_id uuid references public.couples on delete cascade, user_id uuid references auth.users on delete cascade,
 enabled boolean not null default false, muted boolean not null default true, desire integer check(desire between 1 and 5),
 primary key(couple_id,user_id)
);
create table public.intimacy_answers (
 couple_id uuid references public.couples on delete cascade, user_id uuid references auth.users on delete cascade,
 item text references public.intimacy_catalog, choice text not null check(choice in ('yes','maybe','not_now','no')),
 pending text check(pending in ('yes','maybe')), effective_at timestamptz,
 primary key(couple_id,user_id,item)
);
create table public.intimacy_sparks (
 couple_id uuid references public.couples on delete cascade,user_id uuid references auth.users on delete cascade,
 item text references public.intimacy_catalog,expires_at timestamptz not null,primary key(couple_id,user_id,item)
);
create table public.intimacy_invitations (
 id uuid primary key default gen_random_uuid(),couple_id uuid not null references public.couples on delete cascade,
 owner_id uuid not null references auth.users on delete cascade,item text not null references public.intimacy_catalog,
 kind text not null check(kind in ('invite','time')),status text not null default 'pending' check(status in ('pending','yes','another_time','ended')),
 hidden boolean not null default false, planned_at timestamptz,label text check(length(label)<=60),updated_at timestamptz not null default now()
);
create table public.intimacy_checks (
 invitation_id uuid references public.intimacy_invitations on delete cascade,user_id uuid references auth.users on delete cascade,
 feeling boolean not null,primary key(invitation_id,user_id)
);
create table public.intimacy_private_notes (
 couple_id uuid references public.couples on delete cascade,user_id uuid references auth.users on delete cascade,
 payload_ciphertext text not null check(payload_ciphertext like 'v1.%' and length(payload_ciphertext)<30000),
 primary key(couple_id,user_id)
);
alter table public.intimacy_preferences enable row level security;
alter table public.intimacy_answers enable row level security;
alter table public.intimacy_sparks enable row level security;
alter table public.intimacy_invitations enable row level security;
alter table public.intimacy_checks enable row level security;
alter table public.intimacy_private_notes enable row level security;
create policy own_intimacy_preferences on public.intimacy_preferences for select to authenticated using(user_id=auth.uid() and couple_id=public.my_couple_id());
create policy own_intimacy_answers on public.intimacy_answers for select to authenticated using(user_id=auth.uid() and couple_id=public.my_couple_id());
create policy own_intimacy_sparks on public.intimacy_sparks for select to authenticated using(user_id=auth.uid() and couple_id=public.my_couple_id());
create policy own_intimacy_checks on public.intimacy_checks for select to authenticated using(user_id=auth.uid());
create policy own_intimacy_notes on public.intimacy_private_notes for all to authenticated using(user_id=auth.uid() and couple_id=public.my_couple_id()) with check(user_id=auth.uid() and couple_id=public.my_couple_id());
grant select on public.intimacy_preferences,public.intimacy_answers,public.intimacy_sparks,public.intimacy_checks,public.intimacy_invitations to authenticated;
grant select,insert,update,delete on public.intimacy_private_notes to authenticated;

create function public.intimacy_action(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 uid uuid:=auth.uid(); cid uuid:=public.my_couple_id(); act text:=input->>'action'; it text:=input->>'item'; ch text:=input->>'choice';
 mine public.intimacy_preferences; inv public.intimacy_invitations; answer public.intimacy_answers;
 overlap text[]:='{}'; matched text[]:='{}'; active_count integer; result jsonb; ts timestamptz;
begin
 if uid is null or cid is null then raise exception 'Pair with your partner first.'; end if;
 perform 1 from public.couples where id=cid for update;
 if (select count(*) from public.couple_members where couple_id=cid)<>2 then raise exception 'Pair with your partner first.'; end if;
 if (select birthday > current_date-interval '18 years' from public.profiles where user_id=uid) is distinct from false then raise exception 'Adults 18 and older only.'; end if;
 insert into public.intimacy_preferences(couple_id,user_id) values(cid,uid) on conflict do nothing;
 select * into mine from public.intimacy_preferences where couple_id=cid and user_id=uid;
 update public.intimacy_answers set choice=pending,pending=null,effective_at=null where couple_id=cid and pending is not null and effective_at<=now();
 if act='consent' then
  if input->>'enabled' not in ('true','false') or input->>'enabled' is null then raise exception 'Choose on or off.'; end if;
  if (input->>'enabled')::boolean and coalesce(input->>'adult','false')<>'true' then raise exception 'Confirm you are 18 or older.'; end if;
  update public.intimacy_preferences set enabled=(input->>'enabled')::boolean where couple_id=cid and user_id=uid;
  if not (input->>'enabled')::boolean then
   delete from public.intimacy_sparks where couple_id=cid;
   update public.intimacy_invitations set hidden=true where couple_id=cid;
   -- Keep declines for their cooldown, but do not revive plans after re-enabling.
   update public.intimacy_invitations set status='ended' where couple_id=cid and status in ('pending','yes');
  end if;
 elsif act not in ('list') and not mine.enabled then raise exception 'Turn on your Intimacy area first.';
 end if;
 if act='answer' then
  if ch not in ('yes','maybe','not_now','no') or ch is null or not exists(select 1 from public.intimacy_catalog where id=it) then raise exception 'Choose an available item and answer.'; end if;
  select * into answer from public.intimacy_answers where couple_id=cid and user_id=uid and item=it;
  if not found then
   insert into public.intimacy_answers(couple_id,user_id,item,choice) values(cid,uid,it,ch);
  elsif ch in ('no','not_now') then
   update public.intimacy_answers set choice=ch,pending=null,effective_at=null where couple_id=cid and user_id=uid and item=it;
   delete from public.intimacy_sparks where couple_id=cid and item=it;
   update public.intimacy_invitations set status='ended' where couple_id=cid and item=it and status in ('pending','yes');
  elsif answer.choice=ch then
   update public.intimacy_answers set pending=null,effective_at=null where couple_id=cid and user_id=uid and item=it;
  else
   update public.intimacy_answers set pending=ch,effective_at=(date_trunc('day',now() at time zone 'UTC')+interval '1 day') at time zone 'UTC' where couple_id=cid and user_id=uid and item=it;
  end if;
 elsif act='preferences' then
  if input ? 'muted' then update public.intimacy_preferences set muted=(input->>'muted')::boolean where couple_id=cid and user_id=uid; end if;
  if input ? 'desire' then update public.intimacy_preferences set desire=(input->>'desire')::integer where couple_id=cid and user_id=uid; end if;
 end if;
 update public.intimacy_invitations i set status='another_time',updated_at=now() where i.couple_id=cid and i.kind='time' and i.status='yes' and i.planned_at<now()-interval '15 minutes' and (select count(*) from public.intimacy_checks where invitation_id=i.id and feeling)<2;
 select count(*) into active_count from public.intimacy_preferences p join public.couple_members m using(couple_id,user_id) where p.couple_id=cid and p.enabled;
 if active_count=2 then
  select coalesce(array_agg(item order by item),'{}') into overlap from (select a.item from public.intimacy_answers a join public.couple_members m using(couple_id,user_id) where a.couple_id=cid and a.choice in ('yes','maybe') group by a.item having count(*)=2) q;
 end if;
 if act='spark' then
  if not it=any(overlap) then raise exception 'This shared option is unavailable.'; end if;
  if exists(select 1 from public.intimacy_sparks where couple_id=cid and user_id=uid and item=it and expires_at>now()) then delete from public.intimacy_sparks where couple_id=cid and user_id=uid and item=it;
  else
   if (select count(*) from public.intimacy_sparks where couple_id=cid and user_id=uid and expires_at>now())>=3 then raise exception 'Keep up to three private sparks at a time.'; end if;
   insert into public.intimacy_sparks values(cid,uid,it,now()+interval '24 hours') on conflict(couple_id,user_id,item) do update set expires_at=excluded.expires_at;
  end if;
 end if;
 select coalesce(array_agg(item order by item),'{}') into matched from (select s.item from public.intimacy_sparks s join public.couple_members m using(couple_id,user_id) where s.couple_id=cid and s.item=any(overlap) and expires_at>now() group by s.item having count(*)=2) q;
 if act='propose' then
  if not it=any(overlap) or input->>'kind' not in ('invite','time') or input->>'kind' is null then raise exception 'This shared option is unavailable.'; end if;
  if input->>'kind'='time' and not it=any(matched) then raise exception 'Choose a mutual spark first.'; end if;
  if exists(select 1 from public.intimacy_invitations where couple_id=cid and status='pending') then raise exception 'Leave room for the existing invitation. No follow-up is needed.'; end if;
  if exists(select 1 from public.intimacy_invitations where couple_id=cid and item=it and status='another_time' and updated_at>now()-case when kind='invite' then interval '90 days' else interval '24 hours' end) then raise exception 'Give this idea some space. Choose something else.'; end if;
  ts:=null;
  if input->>'kind'='time' then
   ts:=(input->>'when')::timestamptz;
   if ts is null or ts<=now() or ts>now()+interval '90 days' then raise exception 'Choose a future time within 90 days.'; end if;
  end if;
  insert into public.intimacy_invitations(couple_id,owner_id,item,kind,planned_at,label) values(cid,uid,it,input->>'kind',ts,left(input->>'label',60));
 elsif act in ('respond','check') then
  if input ? 'reason' then raise exception 'No explanation is requested or stored.'; end if;
  select * into inv from public.intimacy_invitations where id=(input->>'id')::uuid and couple_id=cid and item=any(overlap);
  if not found then raise exception 'This invitation is unavailable.'; end if;
  if act='respond' then
   if inv.owner_id=uid or inv.status<>'pending' then raise exception 'This invitation cannot be answered.'; end if;
   if input->>'response' is null or (inv.kind='invite' and input->>'response' not in ('yes','later','no')) or (inv.kind='time' and input->>'response' not in ('yes','not_tonight','another_time')) then raise exception 'Choose one of the offered answers.'; end if;
   update public.intimacy_invitations set status=case when input->>'response'='yes' then 'yes' else 'another_time' end,updated_at=now() where id=inv.id;
  else
   if inv.kind<>'time' or inv.status<>'yes' or now()<inv.planned_at-interval '1 hour' or now()>inv.planned_at+interval '4 hours' then raise exception 'Check in near your planned time.'; end if;
   if input->>'feeling' not in ('true','false') or input->>'feeling' is null then raise exception 'Choose how you feel now.'; end if;
   insert into public.intimacy_checks values(inv.id,uid,(input->>'feeling')::boolean) on conflict(invitation_id,user_id) do update set feeling=excluded.feeling;
   if not (input->>'feeling')::boolean then update public.intimacy_invitations set status='another_time',updated_at=now() where id=inv.id; end if;
  end if;
 elsif act not in ('list','consent','answer','preferences','spark','propose') then raise exception 'Unknown Intimacy action.';
 end if;
 select * into mine from public.intimacy_preferences where couple_id=cid and user_id=uid;
 select jsonb_build_object('enabled',mine.enabled,'muted',mine.muted,'desire',mine.desire,
 'answers',coalesce((select jsonb_object_agg(item,jsonb_build_object('choice',choice,'pending',pending,'effectiveAt',effective_at)) from public.intimacy_answers where couple_id=cid and user_id=uid),'{}'::jsonb),
 'overlaps',to_jsonb(overlap),'matched',to_jsonb(matched),
 'sparks',coalesce((select jsonb_agg(item) from public.intimacy_sparks where couple_id=cid and user_id=uid and expires_at>now() and item=any(overlap)),'[]'::jsonb),
 'invitations',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'item',i.item,'ownerId',i.owner_id,'kind',i.kind,'status',i.status,'when',i.planned_at,'label',i.label,
 'mineFeeling',(select feeling from public.intimacy_checks where invitation_id=i.id and user_id=uid),
 'ready', i.status='yes' and now() between i.planned_at-interval '1 hour' and i.planned_at+interval '4 hours' and (select count(*) from public.intimacy_checks c join public.couple_members m on m.user_id=c.user_id and m.couple_id=cid where c.invitation_id=i.id and c.feeling)=2)) from public.intimacy_invitations i where i.couple_id=cid and i.item=any(overlap) and i.status<>'ended' and not i.hidden and i.updated_at>now()-interval '90 days'),'[]'::jsonb)) into result;
 return result;
end $$;
revoke all on function public.intimacy_action(jsonb) from public;
grant execute on function public.intimacy_action(jsonb) to authenticated;
