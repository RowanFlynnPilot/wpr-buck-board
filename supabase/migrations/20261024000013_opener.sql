-- Hunting Brag Board — for the gun opener (Nov. 21).
--
-- 1. One Opening Weekend sponsor per season, like the presenting sponsor. The awards trigger
--    already refuses to attach one to an award (only award and presenting sponsors fit there).
-- 2. "Your deer is on the board": when staff post a deer, the entry-posted function emails the
--    entrant once. posted_notice() hands it what the email needs, only for a posted deer whose
--    entrant hasn't been told yet; mark_posted_notice() records the send. Both are for the
--    function alone (service_role), since they read the entrant's email address.

create unique index sponsors_one_opening_weekend_per_season on public.sponsors (season_id)
where tier = 'opening_weekend';

alter table public.entry_private add column posted_notice_at timestamptz;

create function public.posted_notice(p_entry_id uuid) returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'hunter_name', e.hunter_name,
    'hometown', e.hometown,
    'county', e.county,
    'harvest_date', e.harvest_date,
    'weapon', e.weapon,
    'deer_type', e.deer_type,
    'points', e.points,
    'first_deer', e.first_deer,
    'age_group', e.age_group,
    'photo_id', e.photo_id,
    'share_card', e.share_card,
    'submitter_name', p.submitter_name,
    'email', p.email,
    'entries_close_at', s.entries_close_at,
    'voting_open_at', s.voting_open_at,
    'voting_close_at', s.voting_close_at,
    'winners_at', s.winners_at
  )
  from public.entries e
  join public.entry_private p on p.entry_id = e.id
  join public.seasons s on s.id = e.season_id
  where e.id = p_entry_id and e.status = 'approved' and p.posted_notice_at is null
$$;

create function public.mark_posted_notice(p_entry_id uuid) returns void
language sql
security definer
set search_path = ''
as $$
  update public.entry_private set posted_notice_at = now()
  where entry_id = p_entry_id and posted_notice_at is null
$$;

revoke all on function public.posted_notice(uuid), public.mark_posted_notice(uuid) from public, anon, authenticated;
grant execute on function public.posted_notice(uuid), public.mark_posted_notice(uuid) to service_role;

-- The function checks the caller is staff before it does anything.
grant select on public.staff to service_role;
