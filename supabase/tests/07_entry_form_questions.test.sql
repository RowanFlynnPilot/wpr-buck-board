begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

-- Fixtures --------------------------------------------------------------------

update public.seasons set is_active = false;
insert into public.seasons (id, year, is_active, harvest_since, entries_open_at, gun_opener_at, entries_close_at,
  voting_open_at, voting_close_at, winners_at)
values ('00000000-0000-0000-0000-00000000a001', 2099, true, current_date - 60,
  now() - interval '10 days', now() + interval '5 days', now() + interval '10 days',
  now() + interval '11 days', now() + interval '15 days', now() + interval '16 days');

create temp table ids (label text primary key, id uuid not null);
grant select on ids to anon, authenticated;

-- An entry with every new answer spelled out; the defaults are an adult with none of them.
create function pg_temp.submit(p_name text, p_age public.age_group, p_phone text default null,
  p_relationship text default null, p_first_name_only boolean default false, p_credit text default null)
returns uuid language sql as $$
  select public.submit_entry(p_name, 'Antigo', 'Langlade', current_date - 2, 'rifle', 'buck', 8::smallint, false,
    p_age, p_age = 'youth', null, gen_random_uuid(), 'Mike Johnson', 'mike@example.com', false,
    p_phone, p_relationship, p_first_name_only, p_credit)
$$;

-- How a youth hunter is named -------------------------------------------------------

insert into ids values
  ('first only', pg_temp.submit('Carter Johnson', 'youth', '715-555-0100', 'parent', true)),
  ('full name', pg_temp.submit('Ava Nowak', 'youth', '715-555-0101', 'legal guardian', false)),
  ('adult', pg_temp.submit('Tom Lovlien', 'adult', ' (715) 555-0102 ', 'parent', true, '  Sue Lovlien ')),
  ('no extras', pg_temp.submit('Kurt DuBore', 'adult', '   '));

select is((select hunter_name from public.entries where id = (select id from ids where label = 'first only')),
  'Carter', 'a parent can publish a youth hunter by first name only');
select is((select hunter_full_name from public.entry_private where entry_id = (select id from ids where label = 'first only')),
  'Carter Johnson', 'staff still have the name as entered');
select is((select hunter_name from public.entries where id = (select id from ids where label = 'full name')),
  'Ava Nowak', 'or by first and last name');
select is((select hunter_name from public.entries where id = (select id from ids where label = 'adult')),
  'Tom Lovlien', 'an adult is named as entered, whatever the first-name flag says');

-- The parent or guardian ------------------------------------------------------------

select is((select guardian_relationship from public.entry_private where entry_id = (select id from ids where label = 'full name')),
  'legal guardian', 'a youth entry keeps the relationship');
select is((select guardian_relationship from public.entry_private where entry_id = (select id from ids where label = 'adult')),
  null, 'an adult entry keeps none');
select throws_ok($$ select pg_temp.submit('Sam', 'youth', '715-555-0100') $$,
  'P0001', 'Youth entries need to say whether you''re the hunter''s parent or legal guardian.',
  'a youth entry needs the relationship');
select throws_ok($$ select pg_temp.submit('Sam', 'youth', '715-555-0100', 'uncle') $$,
  'P0001', 'Youth entries need to say whether you''re the hunter''s parent or legal guardian.',
  'only parent or legal guardian');
select throws_ok($$ select pg_temp.submit('Sam', 'youth', null, 'parent') $$,
  'P0001', 'Youth entries need a parent or guardian''s phone number.', 'a youth entry needs a phone number');

-- Phone and photo credit --------------------------------------------------------------

select is((select phone from public.entry_private where entry_id = (select id from ids where label = 'adult')),
  '(715) 555-0102', 'a phone number is kept as typed, trimmed');
select is((select phone from public.entry_private where entry_id = (select id from ids where label = 'no extras')),
  null, 'a blank phone is no phone');
select throws_ok($$ select pg_temp.submit('Pat', 'adult', '555') $$,
  'P0001', 'Enter a phone number we can call, or leave it blank.', 'a phone number too short to call is refused');
select throws_ok($$ select pg_temp.submit('Pat', 'adult', null, null, false, repeat('x', 61)) $$,
  'P0001', 'The photo credit can be at most 60 characters.', 'a long photo credit is refused in plain English');

update public.entries set status = 'approved' where id in (select id from ids);

set local role anon;
select is((select photo_credit from public.gallery_entries where id = (select id from ids where label = 'adult')),
  'Sue Lovlien', 'the photo credit is public, trimmed');
select throws_ok($$ select phone from public.entry_private $$, '42501', null, 'anon cannot read phone numbers');
reset role;

-- A call written for the old form still works for an adult.
select lives_ok($$ select public.submit_entry('Scott Baumann', 'Wausau', 'Marathon', current_date - 2, 'rifle', 'buck',
  8::smallint, false, 'adult', false, null, gen_random_uuid(), 'Scott Baumann', 'scott@example.com', false) $$,
  'the old fifteen answers are still enough for an adult');

select * from finish();
rollback;
