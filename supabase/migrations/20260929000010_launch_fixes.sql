-- Hunting Brag Board — fixes from the pre-launch review.
--
-- 1. submit_entry: a story's line breaks arrive as CRLF (browsers send form fields that way),
--    so a story the form counted as 1,200 characters could be longer here and fail the
--    length check with a raw constraint error the entrant sees as "try again later". Line
--    breaks are now stored as LF, and blank names and an over-long story are refused in plain
--    English like every other rule.
-- 2. run_prize_drawing: refuses while any of the season's entries is still waiting for
--    review. Only posted deer get a ticket and the drawing runs once, so an entry sent late on
--    the last day and not yet reviewed would silently miss it.
-- 3. The entry function reads entries, seasons and entry_private (as service_role) to write
--    its emails. Supabase's default grants cover that today; grant it explicitly (invariant 3).

create or replace function public.submit_entry(
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
  p_newsletter_opt_in boolean,
  p_phone text default null,
  p_guardian_relationship text default null,
  p_first_name_only boolean default false,
  p_photo_credit text default null
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
  v_full_name text := trim(p_hunter_name);
  v_hometown text := trim(p_hometown);
  v_submitter text := trim(p_submitter_name);
  v_youth boolean := p_age_group = 'youth';
  v_phone text := nullif(trim(p_phone), '');
  v_credit text := nullif(trim(p_photo_credit), '');
  v_story text := nullif(trim(regexp_replace(p_story, E'\r\n?', E'\n', 'g')), '');
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

  if coalesce(length(v_full_name), 0) not between 1 and 60 then
    raise exception 'The hunter''s name must be 1 to 60 characters.';
  end if;

  if coalesce(length(v_hometown), 0) not between 1 and 60 then
    raise exception 'The hometown must be 1 to 60 characters.';
  end if;

  if coalesce(length(v_submitter), 0) not between 1 and 100 then
    raise exception 'The name of the person entering must be 1 to 100 characters.';
  end if;

  if length(v_story) > 1200 then
    raise exception 'The story can be at most 1,200 characters.';
  end if;

  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter a valid email address so we can reach you if you win.';
  end if;

  if v_phone is not null and length(regexp_replace(v_phone, '\D', '', 'g')) not between 7 and 15 then
    raise exception 'Enter a phone number we can call, or leave it blank.';
  end if;

  if length(v_credit) > 60 then
    raise exception 'The photo credit can be at most 60 characters.';
  end if;

  if v_youth and p_guardian_consent is distinct from true then
    raise exception 'Youth entries need a parent or guardian''s consent.';
  end if;

  if v_youth and p_guardian_relationship is distinct from 'parent'
    and p_guardian_relationship is distinct from 'legal guardian' then
    raise exception 'Youth entries need to say whether you''re the hunter''s parent or legal guardian.';
  end if;

  if v_youth and v_phone is null then
    raise exception 'Youth entries need a parent or guardian''s phone number.';
  end if;

  insert into public.entries (
    season_id, hunter_name, hometown, county, harvest_date, weapon, deer_type, points,
    first_deer, age_group, guardian_consent, story, photo_id, photo_credit
  ) values (
    v_season.id,
    -- The parent chooses for a youth hunter; everyone else is named as they entered it.
    case when v_youth and p_first_name_only then split_part(v_full_name, ' ', 1) else v_full_name end,
    v_hometown, p_county, p_harvest_date, p_weapon, p_deer_type, p_points,
    p_first_deer, p_age_group, p_guardian_consent, v_story, p_photo_id, v_credit
  )
  returning id into v_entry_id;

  insert into public.entry_private (entry_id, submitter_name, email, hunter_full_name, phone, guardian_relationship)
  values (
    v_entry_id, v_submitter, v_email, v_full_name, v_phone,
    case when v_youth then p_guardian_relationship end
  );

  if p_newsletter_opt_in then
    insert into public.newsletter_optins (email, source) values (v_email, 'entry')
    on conflict (email) do nothing;
  end if;

  return v_entry_id;
end;
$$;

create or replace function public.run_prize_drawing(p_season_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_season public.seasons;
  v_prizes integer;
  v_entrants integer;
  v_waiting integer;
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

  -- Only posted deer get a ticket, and the drawing runs once: decide every entry first.
  select count(*) into v_waiting from public.entries where season_id = p_season_id and status = 'pending';
  if v_waiting > 0 then
    raise exception '% still waiting for review. Post or decline % before the drawing.',
      case when v_waiting = 1 then '1 entry is' else v_waiting || ' entries are' end,
      case when v_waiting = 1 then 'it' else 'them' end;
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

grant select on public.entries, public.seasons, public.entry_private to service_role;
