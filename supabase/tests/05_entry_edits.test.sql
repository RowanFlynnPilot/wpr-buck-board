begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

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

create temp table ids (label text primary key, id uuid not null);
grant select on ids to anon, authenticated;

-- A parent entered a youth hunter by full name.
insert into ids values ('kid', public.submit_entry('Carter Johnson', 'Antigo', 'Langlade', current_date - 2, 'rifle',
  'antlerless', null, true, 'youth', true, 'My first deer.', gen_random_uuid(), 'Mike Johnson', 'mike@example.com', false,
  '715-555-0100', 'parent'));

-- Who may edit ------------------------------------------------------------------

set local role anon;
select throws_ok($$ select public.edit_entry((select id from ids where label = 'kid'), 'Carter', 'Antigo', null) $$,
  '42501', null, 'anon cannot edit entries');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b002","email":"reader@example.com"}', true);
set local role authenticated;
select throws_ok($$ select public.edit_entry((select id from ids where label = 'kid'), 'Carter', 'Antigo', null) $$,
  '42501', 'Staff only.', 'non-staff cannot edit entries');
select is((select count(*)::int from public.entry_edits), 0, 'non-staff cannot read the edit log');
reset role;

-- What an edit must be ------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b001","email":"editor@example.com"}', true);
set local role authenticated;
select throws_ok($$ select public.edit_entry((select id from ids where label = 'kid'), '   ', 'Antigo', null) $$,
  'P0001', 'The name on the board must be 1 to 60 characters.', 'a blank name is refused in plain English');
select throws_ok($$ select public.edit_entry((select id from ids where label = 'kid'), repeat('x', 61), 'Antigo', null) $$,
  'P0001', 'The name on the board must be 1 to 60 characters.', 'a name over 60 characters is refused');
select throws_ok($$ select public.edit_entry((select id from ids where label = 'kid'), 'Carter', '', null) $$,
  'P0001', 'The hometown must be 1 to 60 characters.', 'a blank hometown is refused');
select throws_ok($$ select public.edit_entry((select id from ids where label = 'kid'), 'Carter', 'Antigo', repeat('y', 1201)) $$,
  'P0001', 'The story can be at most 1,200 characters.', 'a story over 1,200 characters is refused');
select throws_ok($$ select public.edit_entry(gen_random_uuid(), 'Carter', 'Antigo', null) $$,
  'P0001', null, 'an unknown entry is refused');

-- An edit -----------------------------------------------------------------------

select lives_ok($$ select public.edit_entry((select id from ids where label = 'kid'), '  Carter  ', 'Antigo', '   ') $$,
  'staff trim a youth hunter to a first name');
select lives_ok($$ select public.edit_entry((select id from ids where label = 'kid'), 'Carter', 'Antigo', null) $$,
  'saving the same words again is allowed');
select is((select count(*)::int from public.entry_edits), 1, 'staff read the edit log, and an unchanged save records nothing');
reset role;

select is((select hunter_name from public.entries where id = (select id from ids where label = 'kid')), 'Carter',
  'the name on the board is trimmed');
select is((select story from public.entries where id = (select id from ids where label = 'kid')), null,
  'a blank story clears it');
select is(
  (select before->>'hunter_name' || ' -> ' || (after->>'hunter_name') from public.entry_edits
   where entry_id = (select id from ids where label = 'kid')),
  'Carter Johnson -> Carter',
  'the edit log keeps the before and after'
);
select is(
  (select edited_by from public.entry_edits where entry_id = (select id from ids where label = 'kid')),
  '00000000-0000-0000-0000-00000000b001'::uuid,
  'the edit log records who edited'
);

select * from finish();
rollback;
