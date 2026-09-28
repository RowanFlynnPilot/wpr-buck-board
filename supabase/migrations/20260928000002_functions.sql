-- Hunting Brag Board — functions and views.
--
-- Every security-definer function pins search_path to '' and fully qualifies names.
-- Execute privileges are set explicitly in the RLS migration; nothing relies on defaults.

-- Phase is a pure function of the season calendar and a point in time.
create function public.phase_at(s public.seasons, p_at timestamptz) returns public.season_phase
language sql
immutable
set search_path = ''
as $$
  select case
    when p_at < s.entries_open_at then 'upcoming'
    when p_at < s.entries_close_at then 'entries'
    when p_at < s.voting_open_at then 'judging'
    when p_at < s.voting_close_at then 'voting'
    when p_at < s.winners_at then 'tallying'
    else 'winners'
  end::public.season_phase
$$;

-- The single definition of who qualifies for which award. Entrants never pick a category.
create function public.qualifies(e public.entries, k public.award_kind) returns boolean
language sql
immutable
set search_path = ''
as $$
  select case k
    when 'first_deer' then e.first_deer
    when 'youth' then e.age_group = 'youth'
    when 'veteran' then e.age_group = 'veteran'
    when 'archery_crossbow' then e.weapon in ('bow', 'crossbow')
    when 'gun_muzzleloader' then e.weapon in ('rifle', 'shotgun', 'muzzleloader', 'handgun')
    when 'best_story' then e.story is not null
    when 'readers_choice' then true
  end
$$;

create function public.award_kinds(e public.entries) returns public.award_kind[]
language sql
immutable
set search_path = ''
as $$
  select array_agg(k order by k)
  from unnest(enum_range(null::public.award_kind)) as k
  where public.qualifies(e, k)
$$;

create function public.is_staff() returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.staff where user_id = (select auth.uid()))
$$;

create view public.current_season with (security_invoker = true) as
select s.*, public.phase_at(s, now()) as phase
from public.seasons s
where s.is_active;

create view public.gallery_entries with (security_invoker = true) as
select
  e.id, e.season_id, e.hunter_name, e.hometown, e.county, e.harvest_date, e.weapon, e.deer_type,
  e.points, e.first_deer, e.age_group, e.story, e.photo_id, e.created_at,
  public.award_kinds(e) as award_kinds
from public.entries e
where e.status = 'approved';

-- Staff-only in practice: votes RLS limits non-staff to their own row.
create view public.readers_choice_standings with (security_invoker = true) as
select v.season_id, v.entry_id, count(*) as votes
from public.votes v
join public.entries e on e.id = v.entry_id
where e.status = 'approved'
group by v.season_id, v.entry_id;

-- Called only by the submit-entry edge function (service role), after the photos are stored.
create function public.submit_entry(
  p_hunter_name text,
  p_hometown text,
  p_county text,
  p_harvest_date date,
  p_weapon public.weapon,
  p_deer_type public.deer_type,
  p_points smallint,
  p_first_deer boolean,
  p_age_group public.age_group,
  p_guardian_consent boolean,
  p_story text,
  p_photo_id uuid,
  p_submitter_name text,
  p_email text,
  p_newsletter_opt_in boolean
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_season public.seasons;
  v_today date := (now() at time zone 'America/Chicago')::date;
  v_entry_id uuid;
  v_email text := lower(trim(p_email));
begin
  select * into v_season from public.seasons where is_active;
  if not found then
    raise exception 'There is no active Brag Board season.';
  end if;

  if public.phase_at(v_season, now()) <> 'entries' then
    raise exception 'The Brag Board is not taking entries right now.';
  end if;

  if p_harvest_date < v_season.harvest_since or p_harvest_date > v_today then
    raise exception 'Harvest date must be between % and today.', to_char(v_season.harvest_since, 'FMMonth FMDD');
  end if;

  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter a valid email address so we can reach you if you win.';
  end if;

  if p_age_group = 'youth' and p_guardian_consent is distinct from true then
    raise exception 'Youth entries need a parent or guardian''s consent.';
  end if;

  insert into public.entries (
    season_id, hunter_name, hometown, county, harvest_date, weapon, deer_type, points,
    first_deer, age_group, guardian_consent, story, photo_id
  ) values (
    v_season.id, trim(p_hunter_name), trim(p_hometown), p_county, p_harvest_date, p_weapon, p_deer_type, p_points,
    p_first_deer, p_age_group, p_guardian_consent, nullif(trim(p_story), ''), p_photo_id
  )
  returning id into v_entry_id;

  insert into public.entry_private (entry_id, submitter_name, email)
  values (v_entry_id, trim(p_submitter_name), v_email);

  if p_newsletter_opt_in then
    insert into public.newsletter_optins (email, source) values (v_email, 'entry')
    on conflict (email) do nothing;
  end if;

  return v_entry_id;
end;
$$;

create function public.moderate_entry(p_entry_id uuid, p_decision public.entry_status, p_reason text) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := nullif(trim(p_reason), '');
begin
  if not public.is_staff() then
    raise exception 'Staff only.' using errcode = '42501';
  end if;

  if p_decision is null or p_decision = 'pending' then
    raise exception 'Decision must be approved or rejected.';
  end if;

  if (p_decision = 'rejected') <> (v_reason is not null) then
    raise exception 'A reason is required when rejecting, and only when rejecting.';
  end if;

  -- A winner must stay on the board: pick a different winner before taking one down.
  if p_decision = 'rejected' and (
    exists (select 1 from public.award_winners where entry_id = p_entry_id)
    or exists (select 1 from public.drawing_winners where entry_id = p_entry_id)
  ) then
    raise exception 'This entry is a winner. Pick a different winner before taking it down.';
  end if;

  update public.entries set status = p_decision where id = p_entry_id;
  if not found then
    raise exception 'Entry % does not exist.', p_entry_id;
  end if;

  update public.entry_private
  set moderated_by = auth.uid(), moderated_at = now(), rejection_reason = v_reason
  where entry_id = p_entry_id;
end;
$$;

create function public.cast_vote(p_entry_id uuid, p_newsletter_opt_in boolean) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_season public.seasons;
  v_email text := lower(auth.jwt() ->> 'email');
begin
  if auth.uid() is null or v_email is null or v_email = '' then
    raise exception 'Sign in with your email to vote.' using errcode = '42501';
  end if;

  select * into v_season from public.seasons where is_active;
  if not found then
    raise exception 'There is no active Brag Board season.';
  end if;

  if public.phase_at(v_season, now()) <> 'voting' then
    raise exception 'Readers'' Choice voting is not open.';
  end if;

  if not exists (
    select 1 from public.entries where id = p_entry_id and season_id = v_season.id and status = 'approved'
  ) then
    raise exception 'That entry is not in the running.';
  end if;

  begin
    insert into public.votes (season_id, voter_id, entry_id) values (v_season.id, auth.uid(), p_entry_id);
  exception when unique_violation then
    raise exception 'You have already voted for Readers'' Choice this season.';
  end;

  if p_newsletter_opt_in then
    insert into public.newsletter_optins (email, source) values (v_email, 'vote')
    on conflict (email) do nothing;
  end if;
end;
$$;

-- Staff pick winners once entries close. Readers' Choice must go to a top vote-getter
-- (ties are broken by staff choosing among the tied entries).
create function public.set_award_winner(p_award_id uuid, p_entry_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_award public.awards;
  v_season public.seasons;
  v_entry public.entries;
  v_phase public.season_phase;
  v_votes bigint;
  v_top bigint;
begin
  if not public.is_staff() then
    raise exception 'Staff only.' using errcode = '42501';
  end if;

  select * into v_award from public.awards where id = p_award_id;
  if not found then
    raise exception 'Award % does not exist.', p_award_id;
  end if;

  select * into v_season from public.seasons where id = v_award.season_id;
  v_phase := public.phase_at(v_season, now());
  if v_phase in ('upcoming', 'entries') then
    raise exception 'Winners are picked after entries close.';
  end if;

  select * into v_entry from public.entries
  where id = p_entry_id and season_id = v_award.season_id and status = 'approved';
  if not found then
    raise exception 'Entry % is not an approved entry in this season.', p_entry_id;
  end if;

  if not public.qualifies(v_entry, v_award.kind) then
    raise exception 'That entry does not qualify for %.', v_award.label;
  end if;

  if v_award.kind = 'readers_choice' then
    if v_phase not in ('tallying', 'winners') then
      raise exception 'Readers'' Choice is settled after voting closes.';
    end if;

    select coalesce(max(votes), 0) into v_top
    from public.readers_choice_standings where season_id = v_season.id;
    select coalesce(sum(votes), 0) into v_votes
    from public.readers_choice_standings where entry_id = p_entry_id;

    if v_votes = 0 or v_votes < v_top then
      raise exception 'Readers'' Choice goes to the top vote-getter (% votes); this entry has %.', v_top, v_votes;
    end if;
  end if;

  insert into public.award_winners (award_id, season_id, entry_id, decided_by)
  values (v_award.id, v_season.id, p_entry_id, auth.uid())
  on conflict (award_id) do update
  set entry_id = excluded.entry_id, decided_by = excluded.decided_by, decided_at = now();
end;
$$;

-- One prize per Prize Partner, drawn at random from distinct entrants (by email),
-- so a hunter with three deer on the board still gets one ticket. Runs once per season.
create function public.run_prize_drawing(p_season_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_season public.seasons;
  v_prizes integer;
  v_entrants integer;
begin
  if not public.is_staff() then
    raise exception 'Staff only.' using errcode = '42501';
  end if;

  select * into v_season from public.seasons where id = p_season_id;
  if not found then
    raise exception 'Season % does not exist.', p_season_id;
  end if;

  if public.phase_at(v_season, now()) in ('upcoming', 'entries') then
    raise exception 'The drawing runs after entries close.';
  end if;

  if exists (select 1 from public.drawing_winners where season_id = p_season_id) then
    raise exception 'The % drawing has already run.', v_season.year;
  end if;

  select count(*) into v_prizes
  from public.sponsors where season_id = p_season_id and tier = 'prize_partner';
  if v_prizes = 0 then
    raise exception 'There are no Prize Partner prizes to draw.';
  end if;

  select count(distinct p.email) into v_entrants
  from public.entries e
  join public.entry_private p on p.entry_id = e.id
  where e.season_id = p_season_id and e.status = 'approved';
  if v_entrants < v_prizes then
    raise exception 'Only % entrants for % prizes.', v_entrants, v_prizes;
  end if;

  with entrants as (
    select distinct on (p.email) e.id as entry_id
    from public.entries e
    join public.entry_private p on p.entry_id = e.id
    where e.season_id = p_season_id and e.status = 'approved'
    order by p.email, e.created_at
  ),
  shuffled as (
    select entry_id, row_number() over (order by random()) as n from entrants
  ),
  prizes as (
    select id, row_number() over (order by name, id) as n
    from public.sponsors
    where season_id = p_season_id and tier = 'prize_partner'
  )
  insert into public.drawing_winners (sponsor_id, season_id, entry_id, drawn_by)
  select prizes.id, p_season_id, shuffled.entry_id, auth.uid()
  from prizes
  join shuffled using (n);
end;
$$;
