begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

-- Fixtures --------------------------------------------------------------------

update public.seasons set is_active = false;
insert into public.seasons (id, year, is_active, harvest_since, entries_open_at, gun_opener_at, entries_close_at,
  voting_open_at, voting_close_at, winners_at)
values ('00000000-0000-0000-0000-00000000a001', 2099, true, current_date - 60,
  now() - interval '10 days', now() + interval '5 days', now() + interval '10 days',
  now() + interval '11 days', now() + interval '15 days', now() + interval '16 days');

create temp table ids (label text primary key, id uuid not null);

create function pg_temp.submit(p_name text, p_hometown text, p_submitter text, p_story text)
returns uuid language sql as $$
  select public.submit_entry(p_name, p_hometown, 'Marathon', current_date - 2, 'rifle', 'buck', 8::smallint, false,
    'adult', false, p_story, gen_random_uuid(), p_submitter, 'hunter@example.com', false)
$$;

-- A story's line breaks -----------------------------------------------------------

-- Browsers send each line break as CRLF. A story the form counted as exactly 1,200 characters
-- (three paragraphs, line breaks counted once) arrives here four characters longer.
insert into ids values ('paragraphs', pg_temp.submit('Tom Lovlien', 'Weston', 'Tom Lovlien',
  repeat('a', 398) || E'\r\n\r\n' || repeat('b', 398) || E'\r\n\r\n' || repeat('c', 400)));

select is((select length(story) from public.entries where id = (select id from ids where label = 'paragraphs')),
  1200, 'a 1,200-character story with paragraph breaks saves at 1,200');
select is((select strpos(story, E'\r') from public.entries where id = (select id from ids where label = 'paragraphs')),
  0, 'line breaks are stored as LF');
select throws_ok($$ select pg_temp.submit('Tom Lovlien', 'Weston', 'Tom Lovlien', repeat('x', 1201)) $$,
  'P0001', 'The story can be at most 1,200 characters.', 'a story that is too long is refused in plain English');

-- Blank answers are refused in plain English, not as a raw constraint error -------------

select throws_ok($$ select pg_temp.submit('   ', 'Weston', 'Tom Lovlien', null) $$,
  'P0001', 'The hunter''s name must be 1 to 60 characters.', 'a blank hunter name');
select throws_ok($$ select pg_temp.submit(repeat('x', 61), 'Weston', 'Tom Lovlien', null) $$,
  'P0001', 'The hunter''s name must be 1 to 60 characters.', 'a hunter name over 60 characters');
select throws_ok($$ select pg_temp.submit('Tom Lovlien', '  ', 'Tom Lovlien', null) $$,
  'P0001', 'The hometown must be 1 to 60 characters.', 'a blank hometown');
select throws_ok($$ select pg_temp.submit('Tom Lovlien', 'Weston', ' ', null) $$,
  'P0001', 'The name of the person entering must be 1 to 100 characters.', 'a blank name for the person entering');
select is((select count(*)::int from public.entries), 1, 'nothing refused was saved');

select * from finish();
rollback;
