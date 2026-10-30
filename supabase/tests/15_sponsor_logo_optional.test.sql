begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

update public.seasons set is_active = false;
insert into public.seasons (id, year, is_active, harvest_since, entries_open_at, gun_opener_at, entries_close_at,
  voting_open_at, voting_close_at, winners_at)
values ('00000000-0000-0000-0000-00000000a015', 2098, true, current_date - 60,
  now() - interval '20 days', now() + interval '5 days', now() + interval '10 days',
  now() + interval '11 days', now() + interval '15 days', now() + interval '16 days');

-- A sponsor can go up before its logo arrives (migration 0019) ---------------------------------

select lives_ok($$ insert into public.sponsors (season_id, name, tier, prize, qr_slug)
  values ('00000000-0000-0000-0000-00000000a015', 'Burks Bar', 'award', '$50 gift card', 'no-logo-yet') $$,
  'a sponsor without a logo goes in');
select throws_ok($$ insert into public.sponsors (season_id, name, tier, logo_path, prize, qr_slug)
  values ('00000000-0000-0000-0000-00000000a015', 'Example Meats', 'award', '', 'A hat', 'empty-logo') $$,
  '23514', null, 'an empty logo path is still refused');
select lives_ok($$ update public.sponsors set logo_path = 'burks-bar.png' where qr_slug = 'no-logo-yet' $$,
  'the logo can be added later');

-- Several of one prize: a Prize Partner row for each, drawn one at a time ----------------------

select lives_ok($$ insert into public.sponsors (season_id, name, tier, website_url, prize, qr_slug)
  select '00000000-0000-0000-0000-00000000a015', 'Wausau Cyclones', 'prize_partner', 'https://www.wausaucyclones.com',
    'Cyclones tickets, good for any game', 'cyclones-' || n
  from generate_series(1, 6) as n $$,
  'six of one prize from one giver go in as six rows');

select * from finish();
rollback;
