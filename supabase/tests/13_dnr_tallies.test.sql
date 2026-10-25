begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

update public.seasons set is_active = false;
insert into public.seasons (id, year, is_active, harvest_since, entries_open_at, gun_opener_at, entries_close_at,
  voting_open_at, voting_close_at, winners_at)
values ('00000000-0000-0000-0000-00000000a013', 2099, true, current_date - 60,
  now() - interval '20 days', now() - interval '3 days', now() + interval '10 days',
  now() + interval '11 days', now() + interval '15 days', now() + interval '16 days');

-- The DNR's count: one per release, from the DNR itself ----------------------------------

select lives_ok($$ insert into public.dnr_tallies (season_id, period, released_on, statewide, marathon, source_url)
  values ('00000000-0000-0000-0000-00000000a013', 'opening_weekend', current_date, 90671, 3210,
    'https://dnr.wisconsin.gov/newsroom/release/1') $$,
  'staff record the DNR''s opening-weekend count');
select throws_ok($$ insert into public.dnr_tallies (season_id, period, released_on, statewide, source_url)
  values ('00000000-0000-0000-0000-00000000a013', 'opening_weekend', current_date, 91000,
    'https://dnr.wisconsin.gov/newsroom/release/2') $$,
  '23505', null, 'one count per release');
select throws_ok($$ insert into public.dnr_tallies (season_id, period, released_on, statewide, source_url)
  values ('00000000-0000-0000-0000-00000000a013', 'archery', current_date, 1000,
    'https://dnr.wisconsin.gov/newsroom/release/3') $$,
  '23514', null, 'for opening weekend or the gun season');
select throws_ok($$ insert into public.dnr_tallies (season_id, period, released_on, statewide, source_url)
  values ('00000000-0000-0000-0000-00000000a013', 'gun_season', current_date, 182084, 'http://example.com') $$,
  '23514', null, 'linked to a secure page');

select * from finish();
rollback;
