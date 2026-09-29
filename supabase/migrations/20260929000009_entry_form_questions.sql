-- Hunting Brag Board — the entry form's questions, per Shereen's 2026 entry form plan.
--
-- New answers:
--   * Phone (optional; required for a youth entry, as the parent or guardian's): staff only.
--   * Who took the photo (optional): public, credited on the board.
--   * For hunters 17 and under, the parent or guardian's relationship (parent or legal guardian)
--     and how to name the hunter: first and last name, or first name only. The parent now
--     chooses; before, the board always used a first name only. The name as entered is kept,
--     staff only, in entry_private.hunter_full_name; entries.hunter_name is what's published.
--
-- Entrants still never pick awards: qualifies() works them out from the answers.

alter table public.entries add column photo_credit text
  constraint photo_credit_length check (length(trim(photo_credit)) between 1 and 60);

alter table public.entry_private
  add column hunter_full_name text
    constraint hunter_full_name_length check (length(trim(hunter_full_name)) between 1 and 60),
  add column phone text
    constraint phone_is_a_phone_number check (length(regexp_replace(phone, '\D', '', 'g')) between 7 and 15),
  add column guardian_relationship text
    constraint guardian_relationship_is_known check (guardian_relationship in ('parent', 'legal guardian'));

create or replace view public.gallery_entries with (security_invoker = true) as
select
  e.id, e.season_id, e.hunter_name, e.hometown, e.county, e.harvest_date, e.weapon, e.deer_type,
  e.points, e.first_deer, e.age_group, e.story, e.photo_id, e.created_at,
  public.award_kinds(e) as award_kinds,
  e.share_card,
  e.photo_credit
from public.entries e
where e.status = 'approved';

-- The new answers come last, with defaults, so a call written for the old form still works
-- for an adult entry.
drop function public.submit_entry(
  text, text, text, date, public.weapon, public.deer_type, smallint, boolean,
  public.age_group, boolean, text, uuid, text, text, boolean
);

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
  v_youth boolean := p_age_group = 'youth';
  v_phone text := nullif(trim(p_phone), '');
  v_credit text := nullif(trim(p_photo_credit), '');
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
    trim(p_hometown), p_county, p_harvest_date, p_weapon, p_deer_type, p_points,
    p_first_deer, p_age_group, p_guardian_consent, nullif(trim(p_story), ''), p_photo_id, v_credit
  )
  returning id into v_entry_id;

  insert into public.entry_private (entry_id, submitter_name, email, hunter_full_name, phone, guardian_relationship)
  values (
    v_entry_id, trim(p_submitter_name), v_email, v_full_name, v_phone,
    case when v_youth then p_guardian_relationship end
  );

  if p_newsletter_opt_in then
    insert into public.newsletter_optins (email, source) values (v_email, 'entry')
    on conflict (email) do nothing;
  end if;

  return v_entry_id;
end;
$$;

revoke all on function public.submit_entry(
  text, text, text, date, public.weapon, public.deer_type, smallint, boolean,
  public.age_group, boolean, text, uuid, text, text, boolean, text, text, boolean, text
) from public, anon, authenticated;
grant execute on function public.submit_entry(
  text, text, text, date, public.weapon, public.deer_type, smallint, boolean,
  public.age_group, boolean, text, uuid, text, text, boolean, text, text, boolean, text
) to service_role;
