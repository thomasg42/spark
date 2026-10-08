-- Only explicitly saved conversations persist. Titles and turns are encrypted together.
create table public.buddy_conversations (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  body_ciphertext text not null check (body_ciphertext like 'v1.%' and length(body_ciphertext) <= 1500000),
  updated_at timestamptz not null default now()
);
alter table public.buddy_conversations enable row level security;
grant select, insert, update, delete on public.buddy_conversations to authenticated;
create policy buddy_conversations_owner on public.buddy_conversations for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Atomic daily cost meter; stores a count only, never unsaved message content.
create table public.buddy_chat_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  messages integer not null default 0,
  primary key (user_id,day)
);
alter table public.buddy_chat_usage enable row level security;
revoke all on public.buddy_chat_usage from anon, authenticated;
create function public.buddy_chat_charge() returns integer
language plpgsql security definer set search_path = '' as $$
declare v_total integer;
begin
  if auth.uid() is null then raise exception 'Please sign in.' using errcode = '42501'; end if;
  insert into public.buddy_chat_usage(user_id,day,messages)
    values(auth.uid(),(now() at time zone 'utc')::date,1)
    on conflict(user_id,day) do update set messages = public.buddy_chat_usage.messages + 1
    returning messages into v_total;
  return v_total;
end $$;
revoke all on function public.buddy_chat_charge() from public, anon;
grant execute on function public.buddy_chat_charge() to authenticated;
