-- Spark Module H: Hints and pattern cards (2026-10-08).
--
-- 1. Answer to unlock (Thomas: "if they don't answer they get no hints ... just
--    keep on answering"). A partner's hint or open share on a question is
--    readable only once you have answered that same question yourself (a skip
--    doesn't count). Until then you can see that something is waiting
--    (partner_share_teasers), never what it says.
-- 2. Hints that wait for a moment. A hint can be set to show only when:
--      'away'             a trip or long work stretch is logged (14 days back, 7 ahead)
--      'excitement_drop'  excitement dipped three weeks running in quick check-ins
--                         you BOTH answered (unrevealed weeks never count)
--      'feeling_distant'  its author raised "I'm feeling a bit distant" (lasts 14 days)
-- 3. distance_flags: that "I'm feeling a bit distant" signal. Raised on purpose by
--    its owner, visible to the couple, cleared by its owner or after 14 days.

alter table public.buddy_shares
  add column show_when text check (show_when in ('away', 'excitement_drop', 'feeling_distant')),
  add constraint buddy_shares_show_when_hint check (show_when is null or level = 'hint');

create table public.distance_flags (
  user_id    uuid primary key references auth.users (id) on delete cascade default auth.uid(),
  couple_id  uuid not null references public.couples (id) on delete cascade,
  raised_at  timestamptz not null default now()
);
alter table public.distance_flags enable row level security;
create policy distance_flags_select on public.distance_flags for select to authenticated
  using (couple_id = (select public.my_couple_id()));
create policy distance_flags_insert on public.distance_flags for insert to authenticated
  with check (user_id = (select auth.uid()) and couple_id = (select public.my_couple_id()));
create policy distance_flags_update on public.distance_flags for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and couple_id = (select public.my_couple_id()));
create policy distance_flags_delete on public.distance_flags for delete to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.distance_flags from anon, authenticated;
grant select, insert, update, delete on public.distance_flags to authenticated;

-- Is this moment happening right now for this couple? Returns a yes/no only.
create or replace function public.hint_trigger_active(p_couple_id uuid, p_author uuid, p_when text)
returns boolean language sql stable security definer set search_path = '' as $$
  select case p_when
    when 'feeling_distant' then exists (
      select 1 from public.distance_flags f
      where f.user_id = p_author and f.couple_id = p_couple_id and f.raised_at > now() - interval '14 days')
    when 'away' then exists (
      select 1 from public.life_changes c
      where c.couple_id = p_couple_id and c.kind in ('trip', 'work_stretch')
        and c.happened_on between current_date - 14 and current_date + 7)
    when 'excitement_drop' then exists (
      with revealed as (
        select p.user_id, p.week_start, p.excitement from public.pulses p
        where p.couple_id = p_couple_id
          and (select count(distinct q.user_id) from public.pulses q where q.couple_id = p_couple_id and q.week_start = p.week_start) = 2
      ), latest as (
        select user_id, max(week_start) as w from revealed group by user_id
      )
      select 1 from latest l
      join revealed w0 on w0.user_id = l.user_id and w0.week_start = l.w
      join revealed w1 on w1.user_id = l.user_id and w1.week_start = l.w - 7
      join revealed w2 on w2.user_id = l.user_id and w2.week_start = l.w - 14
      where w2.excitement > w1.excitement and w1.excitement > w0.excitement
        and l.w >= date_trunc('week', current_date)::date - 14)   -- a dip nobody followed up on is old news
    else false
  end;
$$;
revoke all on function public.hint_trigger_active(uuid, uuid, text) from public;
grant execute on function public.hint_trigger_active(uuid, uuid, text) to authenticated;

-- The partner's shares, readable only once you've answered the same question,
-- and a moment-only hint only while its moment is happening.
drop policy buddy_shares_select on public.buddy_shares;
create policy buddy_shares_select on public.buddy_shares for select to authenticated
  using (
    user_id = (select auth.uid())
    or (
      couple_id = (select public.my_couple_id())
      and user_id = (select public.my_partner_id())
      and level in ('hint', 'open')
      and exists (
        select 1 from public.private_answers a
        where a.user_id = (select auth.uid()) and a.question_id = buddy_shares.question_id and not a.skipped)
      and (show_when is null or public.hint_trigger_active(couple_id, user_id, show_when))
    )
  );

-- What's waiting for you: which questions your partner shared on that you haven't
-- answered yet (question id and level only, never the text). Moment-only hints
-- are teased only while their moment is happening.
create or replace function public.partner_share_teasers()
returns table (question_id text, level public.buddy_share_level)
language sql stable security definer set search_path = '' as $$
  select s.question_id, s.level from public.buddy_shares s
  where s.user_id = public.my_partner_id()
    and s.couple_id = public.my_couple_id()
    and (s.show_when is null or public.hint_trigger_active(s.couple_id, s.user_id, s.show_when))
    and not exists (
      select 1 from public.private_answers a
      where a.user_id = auth.uid() and a.question_id = s.question_id and not a.skipped)
  order by s.question_id;
$$;
revoke all on function public.partner_share_teasers() from public;
grant execute on function public.partner_share_teasers() to authenticated;
