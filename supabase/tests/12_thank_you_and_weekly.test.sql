begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

-- Fixtures --------------------------------------------------------------------
-- A season whose entries opened 20 days ago and close in 30, so the last Friday and the next
-- one both fall while entries are open, and the Friday six weeks out falls after.

update public.seasons set is_active = false;
insert into public.seasons (id, year, is_active, harvest_since, entries_open_at, gun_opener_at, entries_close_at,
  voting_open_at, voting_close_at, winners_at)
values ('00000000-0000-0000-0000-00000000a012', 2099, true, current_date - 60,
  now() - interval '20 days', now() + interval '5 days', now() + interval '30 days',
  now() + interval '31 days', now() + interval '35 days', now() + interval '36 days');

insert into public.awards (season_id, kind, label, description)
values ('00000000-0000-0000-0000-00000000a012', 'first_deer', 'First Deer', 'Hunters who tagged their first deer ever.');

insert into public.sponsors (id, season_id, name, tier, logo_path, website_url, prize, qr_slug) values
  ('00000000-0000-0000-0000-00000000c021', '00000000-0000-0000-0000-00000000a012', 'Example Outfitters', 'thank_you',
    'example-outfitters.png', 'https://example.com', '10% off one purchase', 'example-outfitters-ty'),
  ('00000000-0000-0000-0000-00000000c022', '00000000-0000-0000-0000-00000000a012', 'Example Meats', 'deer_of_the_week',
    'example-meats.png', 'https://example.org', 'A $25 processing gift card', 'example-meats-dotw');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000b021', 'editor@example.com'),
  ('00000000-0000-0000-0000-00000000b022', 'reader@example.com');
insert into public.staff (user_id) values ('00000000-0000-0000-0000-00000000b021');

create function pg_temp.act_as(p_sub text, p_email text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_sub, 'email', p_email, 'role', 'authenticated')::text, true)
$$;

-- Five deer: a, b and e posted; c waiting for review; d posted from a staff household.
create temp table ids (label text primary key, id uuid not null);
grant select on ids to anon, authenticated;
insert into ids
select label, public.submit_entry('Hunter ' || label, 'Wausau', 'Marathon', current_date - 2, 'rifle', 'buck',
  8::smallint, false, 'adult', false, null, gen_random_uuid(), 'Hunter ' || label, label || '@example.com', false)
from unnest(array['a', 'b', 'c', 'd', 'e']) label;
update public.entries set status = 'approved' where id in (select id from ids where label <> 'c');
update public.entry_private set prize_eligible = false where entry_id = (select id from ids where label = 'd');

-- Fridays in Wausau time: the last one (today, if it's Friday), the next, and one after entries close.
create temp table days as
select today - ((extract(isodow from today)::int + 2) % 7) as last_friday
from (select (now() at time zone 'America/Chicago')::date as today) t;
grant select on days to anon, authenticated;

-- A thank-you for every entrant: one sponsor a season, its details private --------------------

select throws_ok($$ insert into public.sponsors (season_id, name, tier, logo_path, prize, qr_slug)
  values ('00000000-0000-0000-0000-00000000a012', 'Other Outfitters', 'thank_you', 'o.png', 'A hat', 'other-ty') $$,
  '23505', null, 'a season takes one thank-you sponsor');
select throws_ok($$ insert into public.sponsors (season_id, name, tier, logo_path, prize, qr_slug)
  values ('00000000-0000-0000-0000-00000000a012', 'Other Meats', 'deer_of_the_week', 'o.png', 'A hat', 'other-dotw') $$,
  '23505', null, 'and one Deer of the Week sponsor');
select throws_ok($$ update public.awards set sponsor_id = '00000000-0000-0000-0000-00000000c021'
  where season_id = '00000000-0000-0000-0000-00000000a012' and kind = 'first_deer' $$,
  'P0001', null, 'a thank-you sponsor can''t present an award');
select throws_ok($$ insert into public.thank_you_offers (sponsor_id, how_to_redeem)
  values ('00000000-0000-0000-0000-00000000c022', 'Show this email.') $$,
  'P0001', 'Redemption details are for the thank-you sponsor.', 'redemption details go only with the thank-you sponsor');
select throws_ok($$ insert into public.thank_you_offers (sponsor_id, how_to_redeem, code)
  values ('00000000-0000-0000-0000-00000000c021', 'Show this email.', 'BRAG 26') $$,
  '23514', null, 'a code is something a clerk can type');
select lives_ok($$ insert into public.thank_you_offers (sponsor_id, how_to_redeem, code)
  values ('00000000-0000-0000-0000-00000000c021', 'Give the code at the register by Dec. 31.', 'BRAG26') $$,
  'staff add the thank-you''s redemption details');

select is(public.posted_notice((select id from ids where label = 'a')) -> 'thank_you' ->> 'offer', '10% off one purchase',
  'the posted email carries the thank-you offer');
select is(public.posted_notice((select id from ids where label = 'a')) -> 'thank_you' ->> 'code', 'BRAG26',
  'and its code, which only that email sees');

-- Deer of the Week ------------------------------------------------------------------------------

select pg_temp.act_as('00000000-0000-0000-0000-00000000b022', 'reader@example.com');
set local role authenticated;
select throws_ok($$ select public.set_weekly_pick((select last_friday from days), (select id from ids where label = 'a')) $$,
  '42501', 'Staff only.', 'readers cannot pick Deer of the Week');
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-00000000b021', 'editor@example.com');
set local role authenticated;
select throws_ok($$ select public.set_weekly_pick((select last_friday from days), (select id from ids where label = 'c')) $$,
  'P0001', 'Only a deer on the board can be Deer of the Week.', 'a deer waiting for review can''t be picked');
select throws_ok($$ select public.set_weekly_pick((select last_friday + 1 from days), (select id from ids where label = 'a')) $$,
  'P0001', 'Deer of the Week is picked for a Friday while entries are open.', 'a pick is for a Friday');
select throws_ok($$ select public.set_weekly_pick((select last_friday + 42 from days), (select id from ids where label = 'a')) $$,
  'P0001', 'Deer of the Week is picked for a Friday while entries are open.', 'while entries are open');
select throws_ok($$ select public.set_weekly_pick((select last_friday from days), (select id from ids where label = 'd')) $$,
  'P0001', 'This entrant is on staff or in a staff household and can''t win prizes.', 'staff households can''t win it');
select lives_ok($$ select public.set_weekly_pick((select last_friday from days), (select id from ids where label = 'a')) $$,
  'staff pick last Friday''s deer');
select throws_ok($$ select public.set_weekly_pick((select last_friday + 7 from days), (select id from ids where label = 'a')) $$,
  'P0001', 'That deer has already been Deer of the Week.', 'a deer is picked once a season');
select lives_ok($$ select public.set_weekly_pick((select last_friday + 7 from days), (select id from ids where label = 'b')) $$,
  'staff queue next Friday''s deer');
select is((select count(*)::int from public.weekly_picks), 2, 'staff see both picks');
reset role;

set local role anon;
select is((select count(*)::int from public.weekly_picks), 1, 'readers see a pick from its Friday on, not before');
reset role;

set local role authenticated;
select lives_ok($$ select public.set_weekly_pick((select last_friday from days), (select id from ids where label = 'e')) $$,
  'staff replace a week''s pick');
select is((select entry_id from public.weekly_picks where week_of = (select last_friday from days)),
  (select id from ids where label = 'e'), 'and the week holds the new deer');
select throws_ok($$ select public.moderate_entry((select id from ids where label = 'e'), 'rejected', 'Duplicate') $$,
  'P0001', 'This deer is a Deer of the Week. Pick a different deer for that week first.', 'a Deer of the Week stays on the board');
select public.set_weekly_pick((select last_friday + 7 from days), null);
select is((select count(*)::int from public.weekly_picks where week_of = (select last_friday + 7 from days)), 0,
  'staff clear a week''s pick');
reset role;

select * from finish();
rollback;
