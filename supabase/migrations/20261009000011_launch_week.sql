-- Hunting Brag Board — fixes from the launch-week review (Oct. 9).
--
-- submit_entry:
-- 1. A youth entry must say how the hunter is named. p_first_name_only used to default to
--    false, so a request that left it out published the hunter's full name; it now defaults
--    to null, and a youth entry without the parent's answer is refused. Adults are unaffected.
-- 2. At most 10 entries from one email address in a rolling day, so a bot that gets past
--    Turnstile can't use up the day's confirmation emails.
-- Everything else is as in 0010. create or replace keeps the function's grants.

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
  p_first_name_only boolean default null,
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

  -- The parent's choice of how to name a youth hunter. A missing answer used to mean the full
  -- name; now nothing is published until the parent has actually chosen.
  if v_youth and p_first_name_only is null then
    raise exception 'Youth entries need to say whether to publish the hunter''s full name or first name only.';
  end if;

  -- Turnstile stops most bots; this caps the rest. Each entry sends two emails, and Resend's
  -- free plan sends 100 a day, so one address can't use up the day's confirmations.
  if (
    select count(*)
    from public.entry_private p
    join public.entries e on e.id = p.entry_id
    where p.email = v_email and e.created_at > now() - interval '1 day'
  ) >= 10 then
    raise exception 'That''s 10 entries from this email address in the past day, our daily limit. Try again tomorrow, or email editor@wausaupilotandreview.com.';
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
