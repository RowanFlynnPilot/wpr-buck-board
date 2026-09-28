begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

-- Fixtures --------------------------------------------------------------------

update public.seasons set is_active = false;
insert into public.seasons (id, year, is_active, harvest_since, entries_open_at, gun_opener_at, entries_close_at,
  voting_open_at, voting_close_at, winners_at)
values ('00000000-0000-0000-0000-00000000a001', 2099, true, current_date - 60,
  now() - interval '10 days', now() + interval '5 days', now() + interval '10 days',
  now() + interval '11 days', now() + interval '15 days', now() + interval '16 days');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000b001', 'editor@example.com'),
  ('00000000-0000-0000-0000-00000000b002', 'reader@example.com');
insert into public.staff (user_id) values ('00000000-0000-0000-0000-00000000b001');

create function pg_temp.submit(p_name text, p_email text, p_age public.age_group default 'adult',
  p_consent boolean default false, p_story text default null, p_harvest date default current_date - 2)
returns uuid language sql as $$
  select public.submit_entry(p_name, ' Wausau ', 'Marathon', p_harvest, 'rifle', 'buck', 8::smallint, false,
    p_age, p_consent, p_story, gen_random_uuid(), 'Submitter', p_email, true)
$$;

create temp table ids (label text primary key, id uuid not null);
grant select on ids to anon, authenticated;
grant insert on ids to service_role;

-- Submission ------------------------------------------------------------------

set local role service_role;
select lives_ok(
  $$ insert into ids values ('direct', public.submit_entry('Direct', 'Rib Mountain', 'Marathon', current_date - 2, 'bow',
       'antlerless', null, true, 'adult', false, '   ', gen_random_uuid(), 'Pat Direct',
       '  Pat@Example.COM ', true)) $$,
  'the service role can submit an entry'
);
reset role;

select is((select status::text from public.entries where id = (select id from ids where label = 'direct')), 'pending',
  'new entries wait for moderation');
select is((select email from public.entry_private where entry_id = (select id from ids where label = 'direct')),
  'pat@example.com', 'submitter email is trimmed and lowercased');
select is((select story from public.entries where id = (select id from ids where label = 'direct')), null,
  'a blank story is stored as no story');
select ok(exists (select 1 from public.newsletter_optins where email = 'pat@example.com' and source = 'entry'),
  'newsletter opt-in on the entry form is recorded');

insert into ids values
  ('second', pg_temp.submit('Second', 'second@example.com', p_story => 'Big one.')),
  ('youth', pg_temp.submit('Sam', 'parent@example.com', 'youth', true));

select throws_ok($$ select pg_temp.submit('Early', 'early@example.com', p_harvest => current_date - 90) $$,
  'P0001', null, 'harvests before the season start date are rejected');
select throws_ok($$ select pg_temp.submit('Future', 'future@example.com', p_harvest => current_date + 3) $$,
  'P0001', null, 'future harvest dates are rejected');
select throws_ok($$ select pg_temp.submit('Typo', 'joe@gmailcom') $$,
  'P0001', 'Enter a valid email address so we can reach you if you win.', 'a malformed email gets a plain-English error');
select throws_ok($$ select pg_temp.submit('Kid', 'kid@example.com', 'youth', false) $$,
  'P0001', 'Youth entries need a parent or guardian''s consent.', 'youth entries need guardian consent');

set local role anon;
select throws_ok(
  $$ select public.submit_entry('X', 'Y', 'Marathon', current_date, 'bow', 'buck', null, false, 'adult', false, null,
       gen_random_uuid(), 'Z', 'z@example.com', false) $$,
  '42501', null, 'anon cannot call submit_entry directly'
);
select throws_ok(
  $$ insert into public.entries (season_id, hunter_name, hometown, county, harvest_date, weapon, deer_type,
       first_deer, age_group, guardian_consent, photo_id)
     values ('00000000-0000-0000-0000-00000000a001', 'X', 'Y', 'Marathon', current_date, 'bow', 'buck', false,
       'adult', false, gen_random_uuid()) $$,
  '42501', null, 'anon cannot insert entries directly'
);
reset role;

-- Visibility before moderation -----------------------------------------------

set local role anon;
select is((select count(*)::int from public.entries), 0, 'anon sees no pending entries');
select is((select phase::text from public.current_season), 'entries', 'anon reads the current phase');
select throws_ok($$ select * from public.entry_private $$, '42501', null, 'anon cannot read entrant details');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b002","email":"reader@example.com"}', true);
set local role authenticated;
select is((select count(*)::int from public.entry_private), 0, 'a signed-in reader cannot read entrant details');
select throws_ok($$ select public.moderate_entry((select id from ids where label = 'second'), 'approved', null) $$,
  '42501', 'Staff only.', 'non-staff cannot moderate');
reset role;

-- Moderation --------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b001","email":"editor@example.com"}', true);
set local role authenticated;
select is((select count(*)::int from public.entries), 3, 'staff see every entry, pending included');
select throws_ok($$ select public.moderate_entry((select id from ids where label = 'second'), 'rejected', '  ') $$,
  'P0001', null, 'rejecting needs a reason');
select throws_ok($$ select public.moderate_entry((select id from ids where label = 'second'), 'approved', 'Looks great') $$,
  'P0001', null, 'approving takes no reason');
select lives_ok($$ select public.moderate_entry((select id from ids where label = 'second'), 'approved', null) $$,
  'staff approve an entry');
select lives_ok($$ select public.moderate_entry((select id from ids where label = 'youth'), 'approved', null) $$,
  'staff approve a second entry');
select lives_ok($$ select public.moderate_entry((select id from ids where label = 'direct'), 'rejected', 'Photo too graphic') $$,
  'staff reject an entry with a reason');
reset role;

select is(
  (select moderated_by from public.entry_private where entry_id = (select id from ids where label = 'second')),
  '00000000-0000-0000-0000-00000000b001'::uuid,
  'moderation records who decided'
);

-- Visibility after moderation ----------------------------------------------------

set local role anon;
select is((select count(*)::int from public.gallery_entries), 2, 'the gallery shows approved entries only');
select is(
  (select award_kinds::text from public.gallery_entries where id = (select id from ids where label = 'youth')),
  '{youth,gun_muzzleloader,readers_choice}',
  'gallery rows carry the awards each entry qualifies for'
);
reset role;

-- Closed season -------------------------------------------------------------------

update public.seasons set entries_open_at = now() - interval '20 days', gun_opener_at = now() - interval '15 days',
  entries_close_at = now() - interval '1 day', voting_open_at = now() + interval '1 day'
where id = '00000000-0000-0000-0000-00000000a001';

select is((select phase::text from public.current_season), 'judging', 'phase follows the calendar');
select throws_ok($$ select pg_temp.submit('Late', 'late@example.com') $$,
  'P0001', 'The Brag Board is not taking entries right now.', 'entries are refused once the window closes');

select * from finish();
rollback;
