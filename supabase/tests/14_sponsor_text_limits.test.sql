begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

update public.seasons set is_active = false;
insert into public.seasons (id, year, is_active, harvest_since, entries_open_at, gun_opener_at, entries_close_at,
  voting_open_at, voting_close_at, winners_at)
values ('00000000-0000-0000-0000-00000000a014', 2099, true, current_date - 60,
  now() - interval '20 days', now() + interval '5 days', now() + interval '10 days',
  now() + interval '11 days', now() + interval '15 days', now() + interval '16 days');

-- Sponsor text a page can hold: names to 80 characters, prizes to 160 ---------------------

select lives_ok(format($$ insert into public.sponsors (season_id, name, tier, logo_path, prize, qr_slug)
  values ('00000000-0000-0000-0000-00000000a014', %L, 'prize_partner', 'a.png', %L, 'longest-allowed') $$,
  repeat('N', 80), repeat('P', 160)),
  'a sponsor name of 80 characters and a prize of 160 go in');
select throws_ok(format($$ insert into public.sponsors (season_id, name, tier, logo_path, prize, qr_slug)
  values ('00000000-0000-0000-0000-00000000a014', %L, 'prize_partner', 'a.png', 'A hat', 'name-too-long') $$,
  repeat('N', 81)),
  '23514', null, 'a longer name is refused');
select throws_ok(format($$ insert into public.sponsors (season_id, name, tier, logo_path, prize, qr_slug)
  values ('00000000-0000-0000-0000-00000000a014', 'Example Meats', 'prize_partner', 'a.png', %L, 'prize-too-long') $$,
  repeat('P', 161)),
  '23514', null, 'a longer prize is refused');
select lives_ok($$ insert into public.sponsors (season_id, name, tier, logo_path, prize, qr_slug)
  values ('00000000-0000-0000-0000-00000000a014', 'Northwoods Outfitters & Taxidermy of Central Wisconsin, LLC', 'presenting', 'n.png',
    'A guided bow hunt for two, a shoulder mount from our taxidermy shop and a $500 gift card', 'northwoods-14') $$,
  'the longest realistic name and prize tried fit');

select * from finish();
rollback;
