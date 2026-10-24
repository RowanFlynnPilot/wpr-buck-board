begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

-- Fixtures --------------------------------------------------------------------

update public.seasons set is_active = false;
insert into public.seasons (id, year, is_active, harvest_since, entries_open_at, gun_opener_at, entries_close_at,
  voting_open_at, voting_close_at, winners_at)
values ('00000000-0000-0000-0000-00000000a010', 2099, true, current_date - 60,
  now() - interval '10 days', now() + interval '5 days', now() + interval '10 days',
  now() + interval '11 days', now() + interval '15 days', now() + interval '16 days');

insert into public.awards (season_id, kind, label, description)
values ('00000000-0000-0000-0000-00000000a010', 'first_deer', 'First Deer', 'Hunters who tagged their first deer ever.');

create temp table ids (label text primary key, id uuid not null);
insert into ids values ('deer', public.submit_entry('Tom Lovlien', 'Weston', 'Marathon', current_date - 2, 'rifle', 'buck',
  8::smallint, false, 'adult', false, null, gen_random_uuid(), 'Tom Lovlien', 'tom@example.com', false));

-- "Your deer is on the board" goes out once, and only for a posted deer ----------------

select is(public.posted_notice((select id from ids)), null, 'no posted email for a deer still waiting for review');

update public.entries set status = 'approved' where id = (select id from ids);
select is(public.posted_notice((select id from ids)) ->> 'email', 'tom@example.com',
  'a posted deer''s notice carries the entrant''s address');
select is(public.posted_notice((select id from ids)) ->> 'hunter_name', 'Tom Lovlien',
  'and the name as the board shows it');

select public.mark_posted_notice((select id from ids));
select isnt((select posted_notice_at from public.entry_private where entry_id = (select id from ids)), null,
  'the send is recorded');
select is(public.posted_notice((select id from ids)), null, 'so the entrant is told only once');

-- An Opening Weekend sponsor: one a season, never on an award ---------------------------

select lives_ok($$ insert into public.sponsors (season_id, name, tier, logo_path, website_url, prize, qr_slug)
  values ('00000000-0000-0000-0000-00000000a010', 'Example Meats', 'opening_weekend', 'example-meats.png',
    'https://example.com', 'Processing gift card', 'example-meats-ow') $$,
  'a season takes an Opening Weekend sponsor');
select throws_ok($$ insert into public.sponsors (season_id, name, tier, logo_path, website_url, prize, qr_slug)
  values ('00000000-0000-0000-0000-00000000a010', 'Example Outfitters', 'opening_weekend', 'example-outfitters.png',
    'https://example.org', 'Blaze orange hat', 'example-outfitters-ow') $$,
  '23505', null, 'but only one');
select throws_ok($$ update public.awards set sponsor_id = (select id from public.sponsors where qr_slug = 'example-meats-ow')
  where season_id = '00000000-0000-0000-0000-00000000a010' and kind = 'first_deer' $$,
  'P0001', null, 'an Opening Weekend sponsor can''t present an award');

select * from finish();
rollback;
