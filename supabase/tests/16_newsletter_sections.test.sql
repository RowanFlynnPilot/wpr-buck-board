begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

-- Fixtures --------------------------------------------------------------------
-- A season whose entries opened 20 days ago and close in 30, with winners in 36 days.

update public.seasons set is_active = false;
insert into public.seasons (id, year, is_active, harvest_since, entries_open_at, gun_opener_at, entries_close_at,
  voting_open_at, voting_close_at, winners_at)
values ('00000000-0000-0000-0000-00000000a016', 2099, true, current_date - 60,
  now() - interval '20 days', now() + interval '5 days', now() + interval '30 days',
  now() + interval '31 days', now() + interval '35 days', now() + interval '36 days');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000b161', 'editor@example.com'),
  ('00000000-0000-0000-0000-00000000b162', 'reader@example.com');
insert into public.staff (user_id) values ('00000000-0000-0000-0000-00000000b161');

create function pg_temp.act_as(p_sub text, p_email text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_sub, 'email', p_email, 'role', 'authenticated')::text, true)
$$;

-- Three deer: a and b posted, c waiting for review.
create temp table ids (label text primary key, id uuid not null);
grant select on ids to anon, authenticated;
insert into ids
select label, public.submit_entry('Hunter ' || label, 'Wausau', 'Marathon', current_date - 2, 'rifle', 'buck',
  8::smallint, false, 'adult', false, null, gen_random_uuid(), 'Hunter ' || label, label || '@example.com', false)
from unnest(array['a', 'b', 'c']) label;
update public.entries set status = 'approved' where id in (select id from ids where label <> 'c');

-- Fridays in Wausau time: the last one (today, if it's Friday) and the next.
create temp table days as
select today - ((extract(isodow from today)::int + 2) % 7) as last_friday
from (select (now() at time zone 'America/Chicago')::date as today) t;
grant select on days to anon, authenticated;

-- Saving -----------------------------------------------------------------------

select pg_temp.act_as('00000000-0000-0000-0000-00000000b162', 'reader@example.com');
set local role authenticated;
select throws_ok($$ select public.save_newsletter_section((select last_friday + 7 from days), '<tr><td>Deer</td></tr>',
  array[(select id from ids where label = 'a')], null) $$,
  '42501', 'Staff only.', 'readers cannot save the newsletter section');
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-00000000b161', 'editor@example.com');
set local role authenticated;
select lives_ok($$ select public.save_newsletter_section((select last_friday + 7 from days), '<tr><td>Deer</td></tr>',
  array[(select id from ids where label = 'a'), (select id from ids where label = 'b')], (select last_friday from days)) $$,
  'staff save next Friday''s section');
select lives_ok($$ select public.save_newsletter_section((select last_friday + 7 from days), '<tr><td>Deer b</td></tr>',
  array[(select id from ids where label = 'b')], (select last_friday from days)) $$,
  'and save it again with other deer');
select is((select rows_html from public.newsletter_sections where week_of = (select last_friday + 7 from days)),
  '<tr><td>Deer b</td></tr>', 'the second save replaces the first');
select throws_ok($$ select public.save_newsletter_section((select last_friday + 8 from days), '<tr><td>Deer</td></tr>',
  array[(select id from ids where label = 'a')], null) $$,
  'P0001', 'The Brag Board section is saved for a Friday during the season.', 'a section is for a Friday');
select throws_ok($$ select public.save_newsletter_section((select last_friday + 70 from days), '<tr><td>Deer</td></tr>',
  array[(select id from ids where label = 'a')], null) $$,
  'P0001', 'The Brag Board section is saved for a Friday during the season.', 'during the season');
select throws_ok($$ select public.save_newsletter_section((select last_friday - 7 from days), '<tr><td>Deer</td></tr>',
  array[(select id from ids where label = 'a')], null) $$,
  'P0001', 'That Friday''s newsletters have already gone out.', 'not for a Friday already sent');
select throws_ok($$ select public.save_newsletter_section((select last_friday + 7 from days), '<tr><td>Deer</td></tr>',
  array[(select id from ids where label = 'c')], null) $$,
  'P0001', 'Only deer on the board can go in the newsletter.', 'a deer waiting for review can''t go in');
select throws_ok($$ select public.save_newsletter_section((select last_friday + 7 from days), repeat('x', 13001),
  array[(select id from ids where label = 'a')], null) $$,
  'P0001', 'The section is too long for the newsletter. Uncheck a deer or two.', 'the section stays under the block limit');
select is((select count(*)::int from public.newsletter_sections), 1, 'staff see next Friday''s section before its Friday');
reset role;

-- Reading: from its Friday, while every deer in it is on the board ------------

-- This Friday's section, as if saved during the week.
insert into public.newsletter_sections (season_id, week_of, rows_html, entry_ids, posted_since)
values ('00000000-0000-0000-0000-00000000a016', (select last_friday from days), '<tr><td>Deer a</td></tr>',
  array[(select id from ids where label = 'a')], (select last_friday - 7 from days));

set local role anon;
select is((select array_agg(rows_html) from public.newsletter_sections), array['<tr><td>Deer a</td></tr>'],
  'the newsletter build reads this Friday''s section, not next Friday''s');
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-00000000b161', 'editor@example.com');
set local role authenticated;
select public.moderate_entry((select id from ids where label = 'a'), 'rejected', 'Duplicate');
reset role;

set local role anon;
select is((select count(*)::int from public.newsletter_sections), 0,
  'a deer taken down after the section was saved withholds the section');
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-00000000b161', 'editor@example.com');
set local role authenticated;
select lives_ok($$ select public.save_newsletter_section((select last_friday + 7 from days), null, null, null) $$,
  'staff take a section out of a Friday''s newsletters');
select is((select count(*)::int from public.newsletter_sections where week_of = (select last_friday + 7 from days)), 0,
  'and it''s gone');
reset role;

select * from finish();
rollback;
