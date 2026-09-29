begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

-- Reference data and seed ---------------------------------------------------

select is((select count(*)::int from public.wi_counties), 72, 'all 72 Wisconsin counties are loaded');

select is(
  enum_range(null::public.award_kind)::text,
  '{first_deer,youth,archery_crossbow,gun_muzzleloader,best_story,veteran,readers_choice}',
  'award kinds are declared in sponsor-sheet order'
);

select is(
  (select count(*)::int from public.awards a join public.seasons s on s.id = a.season_id where s.year = 2026),
  7,
  '2026 season has all seven awards'
);

select ok((select is_active from public.seasons where year = 2026), '2026 season is active');

-- Season calendar -----------------------------------------------------------

select throws_ok(
  $$ insert into public.seasons (year, is_active, harvest_since, entries_open_at, gun_opener_at, entries_close_at, voting_open_at, voting_close_at, winners_at)
     values (2027, true, '2027-09-01', '2027-10-01', '2027-11-20', '2027-12-12', '2027-12-13', '2027-12-17', '2027-12-20') $$,
  '23505', null, 'only one season can be active'
);

select throws_ok(
  $$ insert into public.seasons (year, harvest_since, entries_open_at, gun_opener_at, entries_close_at, voting_open_at, voting_close_at, winners_at)
     values (2027, '2027-09-01', '2027-10-01', '2027-11-20', '2027-12-12', '2027-12-10', '2027-12-17', '2027-12-20') $$,
  '23514', null, 'voting cannot open before entries close'
);

-- Phases ----------------------------------------------------------------------

select is(public.phase_at(s, timestamptz '2026-10-11 23:59 America/Chicago'), 'upcoming', 'upcoming the night before launch')
from public.seasons s where year = 2026;
select is(public.phase_at(s, timestamptz '2026-10-12 00:00 America/Chicago'), 'entries', 'entries open Oct. 12')
from public.seasons s where year = 2026;
select is(public.phase_at(s, timestamptz '2026-12-13 23:59 America/Chicago'), 'entries', 'entries still open late Dec. 13')
from public.seasons s where year = 2026;
select is(public.phase_at(s, timestamptz '2026-12-14 00:00 America/Chicago'), 'voting', 'voting opens Dec. 14 (no judging gap in 2026)')
from public.seasons s where year = 2026;
select is(public.phase_at(s, timestamptz '2026-12-19 00:00 America/Chicago'), 'tallying', 'voting closes after Dec. 18')
from public.seasons s where year = 2026;
select is(public.phase_at(s, timestamptz '2026-12-21 06:00 America/Chicago'), 'winners', 'winners announced Dec. 21')
from public.seasons s where year = 2026;

-- Sponsors and awards ---------------------------------------------------------

insert into public.sponsors (id, season_id, name, tier, logo_path, prize, qr_slug)
select v.id::uuid, s.id, v.name, v.tier::public.sponsor_tier, 'logo.png', 'A prize', v.slug
from public.seasons s
cross join (values
  ('00000000-0000-0000-0000-00000000c001', 'Presenting Co', 'presenting', 'presenting-co'),
  ('00000000-0000-0000-0000-00000000c002', 'Award Co', 'award', 'award-co'),
  ('00000000-0000-0000-0000-00000000c003', 'Prize Co', 'prize_partner', 'prize-co')
) as v (id, name, tier, slug)
where s.year = 2026;

select throws_ok(
  $$ insert into public.sponsors (season_id, name, tier, logo_path, prize, qr_slug)
     select id, 'Second Presenter', 'presenting', 'logo.png', 'A prize', 'second-presenter' from public.seasons where year = 2026 $$,
  '23505', null, 'only one presenting sponsor per season'
);

select throws_ok(
  $$ update public.awards set sponsor_id = '00000000-0000-0000-0000-00000000c003'
     where kind = 'first_deer' and season_id = (select id from public.seasons where year = 2026) $$,
  'P0001', null, 'a prize partner cannot present an award'
);

select throws_ok(
  $$ update public.awards set sponsor_id = '00000000-0000-0000-0000-00000000c002'
     where kind = 'readers_choice' and season_id = (select id from public.seasons where year = 2026) $$,
  'P0001', null, 'Readers'' Choice cannot go to an award sponsor'
);

select lives_ok(
  $$ update public.awards set sponsor_id = '00000000-0000-0000-0000-00000000c002'
     where kind = 'first_deer' and season_id = (select id from public.seasons where year = 2026) $$,
  'an award sponsor can present a regular award'
);

select lives_ok(
  $$ update public.awards set sponsor_id = '00000000-0000-0000-0000-00000000c001'
     where kind = 'readers_choice' and season_id = (select id from public.seasons where year = 2026) $$,
  'the presenting sponsor presents Readers'' Choice'
);

select throws_ok(
  $$ update public.sponsors set website_url = 'https://exa mple.com' where qr_slug = 'award-co' $$,
  '23514', null, 'a sponsor website with a space in it is refused'
);
select throws_ok(
  $$ update public.sponsors set website_url = 'https://' where qr_slug = 'award-co' $$,
  '23514', null, 'a bare https:// is not a sponsor website'
);
select lives_ok(
  $$ update public.sponsors set website_url = 'https://www.example.com/shop?ref=home' where qr_slug = 'award-co' $$,
  'a sponsor website with a path and query is accepted'
);

-- Entries: row-level invariants -----------------------------------------------

create function pg_temp.raw_entry(
  p_weapon public.weapon, p_deer public.deer_type, p_points smallint, p_age public.age_group,
  p_consent boolean, p_first boolean, p_story text, p_county text default 'Marathon'
) returns uuid language sql as $$
  insert into public.entries (season_id, hunter_name, hometown, county, harvest_date, weapon, deer_type, points,
    first_deer, age_group, guardian_consent, story, photo_id)
  select id, 'Hunter', 'Wausau', p_county, date '2026-10-01', p_weapon, p_deer, p_points,
    p_first, p_age, p_consent, p_story, gen_random_uuid()
  from public.seasons where year = 2026
  returning id
$$;

select throws_ok($$ select pg_temp.raw_entry('rifle', 'antlerless', 4::smallint, 'adult', false, false, null) $$,
  '23514', null, 'points only apply to bucks');
select throws_ok($$ select pg_temp.raw_entry('rifle', 'buck', 8::smallint, 'youth', false, false, null) $$,
  '23514', null, 'youth entries need guardian consent');
select throws_ok($$ select pg_temp.raw_entry('rifle', 'buck', 8::smallint, 'adult', false, false, null, 'Cook') $$,
  '23503', null, 'harvest county must be a Wisconsin county');

-- Award qualification ---------------------------------------------------------

create temp table q (label text primary key, id uuid not null);
insert into q values
  ('youth', pg_temp.raw_entry('crossbow', 'buck', 6::smallint, 'youth', true, true, 'Sat for six hours.')),
  ('veteran', pg_temp.raw_entry('muzzleloader', 'antlerless', null, 'veteran', false, false, null)),
  ('bow', pg_temp.raw_entry('bow', 'buck', 10::smallint, 'adult', false, false, null));

select is(
  (select public.award_kinds(e)::text from public.entries e join q on q.id = e.id where q.label = 'youth'),
  '{first_deer,youth,archery_crossbow,best_story,readers_choice}',
  'youth first-deer crossbow entry with a story qualifies for five awards'
);

select is(
  (select public.award_kinds(e)::text from public.entries e join q on q.id = e.id where q.label = 'veteran'),
  '{gun_muzzleloader,veteran,readers_choice}',
  'veteran muzzleloader entry without a story qualifies for three awards'
);

select is(
  (select public.award_kinds(e)::text from public.entries e join q on q.id = e.id where q.label = 'bow'),
  '{archery_crossbow,readers_choice}',
  'adult bow entry qualifies for archery and Readers'' Choice only'
);

select * from finish();
rollback;
