begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

-- Fixtures --------------------------------------------------------------------

update public.seasons set is_active = false;
insert into public.seasons (id, year, is_active, harvest_since, entries_open_at, gun_opener_at, entries_close_at,
  voting_open_at, voting_close_at, winners_at)
values ('00000000-0000-0000-0000-00000000a009', 2099, true, current_date - 60,
  now() - interval '10 days', now() + interval '5 days', now() + interval '10 days',
  now() + interval '11 days', now() + interval '15 days', now() + interval '16 days');

create temp table ids (label text primary key, id uuid not null);

create function pg_temp.adult(p_email text) returns uuid language sql as $$
  select public.submit_entry('Tom Lovlien', 'Weston', 'Marathon', current_date - 2, 'rifle', 'buck', 8::smallint, false,
    'adult', false, null, gen_random_uuid(), 'Tom Lovlien', p_email, false)
$$;

create function pg_temp.youth(p_first_name_only boolean) returns uuid language sql as $$
  select public.submit_entry('Carter Johnson', 'Antigo', 'Langlade', current_date - 2, 'rifle', 'buck', 8::smallint, true,
    'youth', true, null, gen_random_uuid(), 'Mike Johnson', 'mike@example.com', false,
    p_phone => '715-555-0100', p_guardian_relationship => 'parent', p_first_name_only => p_first_name_only)
$$;

-- A youth hunter is named only as the parent chose ----------------------------------

select throws_ok($$ select public.submit_entry('Carter Johnson', 'Antigo', 'Langlade', current_date - 2, 'rifle', 'buck',
    8::smallint, true, 'youth', true, null, gen_random_uuid(), 'Mike Johnson', 'mike@example.com', false,
    '715-555-0100', 'parent') $$,
  'P0001', 'Youth entries need to say whether to publish the hunter''s full name or first name only.',
  'a youth entry that leaves out how to name the hunter is refused, not published by full name');
select throws_ok($$ select pg_temp.youth(null) $$,
  'P0001', 'Youth entries need to say whether to publish the hunter''s full name or first name only.',
  'so is one that answers null');
insert into ids values ('kid', pg_temp.youth(false));
select is((select hunter_name from public.entries where id = (select id from ids where label = 'kid')),
  'Carter Johnson', 'a parent who chose the full name gets the full name');

-- At most 10 entries from one address in a day ----------------------------------------

do $$ begin for i in 1..10 loop perform pg_temp.adult('cap@example.com'); end loop; end $$;
select is((select count(*)::int from public.entry_private where email = 'cap@example.com'), 10,
  'ten entries from one address in a day are fine');
select throws_ok($$ select pg_temp.adult('cap@example.com') $$,
  'P0001', 'That''s 10 entries from this email address in the past day, our daily limit. Try again tomorrow, or email editor@wausaupilotandreview.com.',
  'the eleventh in a day is refused in plain English');
select throws_ok($$ select pg_temp.adult('  CAP@Example.com ') $$,
  'P0001', 'That''s 10 entries from this email address in the past day, our daily limit. Try again tomorrow, or email editor@wausaupilotandreview.com.',
  'the limit ignores case and spaces');
select lives_ok($$ select pg_temp.adult('other@example.com') $$, 'another address is unaffected');

update public.entries set created_at = now() - interval '25 hours'
where id = (select entry_id from public.entry_private where email = 'cap@example.com' limit 1);
select lives_ok($$ select pg_temp.adult('cap@example.com') $$, 'an entry from more than a day ago no longer counts');

select is((select count(*)::int from public.entries), 13, 'nothing refused was saved');

select * from finish();
rollback;
