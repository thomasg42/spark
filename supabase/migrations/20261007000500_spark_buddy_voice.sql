-- =============================================================================
-- Spark Buddy studio voice: a per-person daily character meter (cost guard)
--
-- The studio voice (ElevenLabs) is billed per character, so the "buddy" Edge
-- Function charges each request here before rendering and refuses past the
-- daily limit. Only the meter is stored: no text, ever. People cannot read or
-- edit the table directly; the only way in is buddy_voice_charge(), which can
-- only ADD to the caller's own count (calling it directly just spends quota).
-- =============================================================================

create table public.buddy_voice_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day     date not null,
  chars   integer not null default 0 check (chars >= 0),
  primary key (user_id, day)
);
alter table public.buddy_voice_usage enable row level security;
revoke all on public.buddy_voice_usage from anon, authenticated;

create or replace function public.buddy_voice_charge(p_chars integer)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_total integer;
begin
  if auth.uid() is null then
    raise exception 'Please sign in.' using errcode = '42501';
  end if;
  if p_chars is null or p_chars < 1 or p_chars > 5000 then
    raise exception 'Invalid amount.' using errcode = 'P0001';
  end if;
  insert into public.buddy_voice_usage (user_id, day, chars)
    values (auth.uid(), (now() at time zone 'utc')::date, p_chars)
    on conflict (user_id, day) do update set chars = public.buddy_voice_usage.chars + excluded.chars
    returning chars into v_total;
  return v_total;
end $$;

revoke all on function public.buddy_voice_charge(integer) from public, anon;
grant execute on function public.buddy_voice_charge(integer) to authenticated;
