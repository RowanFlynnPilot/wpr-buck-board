begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

-- Fixtures --------------------------------------------------------------------

update public.seasons set is_active = false;
insert into public.seasons (id, year, is_active, harvest_since, entries_open_at, gun_opener_at, entries_close_at,
  voting_open_at, voting_close_at, winners_at)
values ('00000000-0000-0000-0000-00000000a001', 2099, true, current_date - 60,
  now() - interval '10 days', now() + interval '5 days', now() + interval '10 days',
  now() + interval '11 days', now() + interval '15 days', now() + interval '16 days');

insert into public.awards (season_id, kind, label, description)
select '00000000-0000-0000-0000-00000000a001', k, initcap(replace(k::text, '_', ' ')), 'Test award.'
from unnest(enum_range(null::public.award_kind)) as k;

insert into public.sponsors (season_id, name, tier, logo_path, prize, qr_slug) values
  ('00000000-0000-0000-0000-00000000a001', 'Alpha Bait', 'prize_partner', 'a.png', 'Gift card', 'alpha-bait'),
  ('00000000-0000-0000-0000-00000000a001', 'Bravo Meats', 'prize_partner', 'b.png', 'Processing', 'bravo-meats');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000b001', 'editor@example.com'),
  ('00000000-0000-0000-0000-00000000b003', 'voter.a@example.com'),
  ('00000000-0000-0000-0000-00000000b004', 'voter.b@example.com'),
  ('00000000-0000-0000-0000-00000000b005', null);
insert into public.staff (user_id) values ('00000000-0000-0000-0000-00000000b001');

create function pg_temp.submit(p_name text, p_email text, p_first boolean default false)
returns uuid language sql as $$
  select public.submit_entry(p_name, 'Wausau', 'Marathon', current_date - 2, 'rifle', 'buck', 8::smallint, p_first,
    'adult', false, null, gen_random_uuid(), 'Submitter', p_email, false)
$$;

create function pg_temp.shift_to(p_phase text) returns void language sql as $$
  update public.seasons s set
    entries_open_at = now() + o.open, gun_opener_at = now() + o.gun, entries_close_at = now() + o.close,
    voting_open_at = now() + o.vopen, voting_close_at = now() + o.vclose, winners_at = now() + o.win
  from (values
    ('voting',   interval '-30 days', interval '-25 days', interval '-5 days', interval '-1 day', interval '3 days', interval '4 days'),
    ('tallying', interval '-30 days', interval '-25 days', interval '-10 days', interval '-5 days', interval '-1 day', interval '1 day'),
    ('winners',  interval '-30 days', interval '-25 days', interval '-10 days', interval '-5 days', interval '-2 days', interval '-1 day')
  ) as o (phase, open, gun, close, vopen, vclose, win)
  where s.is_active and o.phase = p_phase
$$;

create function pg_temp.act_as(p_sub text, p_email text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_sub, 'email', p_email, 'role', 'authenticated')::text, true)
$$;

create temp table ids (label text primary key, id uuid not null);
grant select on ids to anon, authenticated;

-- Two entries from ann@, one from bob@, one left pending (cat@).
insert into ids values
  ('ann1', pg_temp.submit('Ann', 'ann@example.com', true)),
  ('bob', pg_temp.submit('Bob', 'bob@example.com')),
  ('ann2', pg_temp.submit('Ann', 'ann@example.com')),
  ('cat', pg_temp.submit('Cat', 'cat@example.com'));
update public.entries set status = 'approved' where id in (select id from ids where label in ('ann1', 'bob', 'ann2'));

-- Voting ------------------------------------------------------------------------

select pg_temp.act_as('00000000-0000-0000-0000-00000000b003', 'voter.a@example.com');
set local role authenticated;
select throws_ok($$ select public.cast_vote((select id from ids where label = 'ann1'), false) $$,
  'P0001', 'Readers'' Choice voting is not open.', 'no voting during the entry window');
reset role;

select pg_temp.shift_to('voting');

set local role anon;
select throws_ok($$ select public.cast_vote((select id from ids where label = 'ann1'), false) $$,
  '42501', null, 'anon cannot vote without signing in');
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-00000000b003', 'Voter.A@example.com');
set local role authenticated;
select lives_ok($$ select public.cast_vote((select id from ids where label = 'ann1'), true) $$, 'a signed-in reader votes');
select throws_ok($$ select public.cast_vote((select id from ids where label = 'bob'), false) $$,
  'P0001', 'You have already voted for Readers'' Choice this season.', 'one vote per reader per season');
select is((select count(*)::int from public.votes), 1, 'voters see only their own vote');
reset role;

select ok(exists (select 1 from public.newsletter_optins where email = 'voter.a@example.com' and source = 'vote'),
  'newsletter opt-in on the ballot is recorded, lowercased');

select pg_temp.act_as('00000000-0000-0000-0000-00000000b004', 'voter.b@example.com');
set local role authenticated;
select throws_ok($$ select public.cast_vote((select id from ids where label = 'cat'), false) $$,
  'P0001', 'That entry is not in the running.', 'pending entries cannot receive votes');
select lives_ok($$ select public.cast_vote((select id from ids where label = 'ann1'), false) $$, 'a second reader votes');
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-00000000b005', '');
set local role authenticated;
select throws_ok($$ select public.cast_vote((select id from ids where label = 'bob'), false) $$,
  '42501', 'Sign in with your email to vote.', 'accounts without an email cannot vote');
reset role;

-- Award winners ------------------------------------------------------------------

select pg_temp.act_as('00000000-0000-0000-0000-00000000b001', 'editor@example.com');
set local role authenticated;
select throws_ok(
  $$ select public.set_award_winner(
       (select id from public.awards where kind = 'readers_choice' and season_id = '00000000-0000-0000-0000-00000000a001'),
       (select id from ids where label = 'ann1')) $$,
  'P0001', 'Readers'' Choice is settled after voting closes.', 'Readers'' Choice waits for voting to close'
);
select throws_ok(
  $$ select public.set_award_winner(
       (select id from public.awards where kind = 'first_deer' and season_id = '00000000-0000-0000-0000-00000000a001'),
       (select id from ids where label = 'bob')) $$,
  'P0001', null, 'an entry that does not qualify cannot win the award'
);
select throws_ok(
  $$ select public.set_award_winner(
       (select id from public.awards where kind = 'gun_muzzleloader' and season_id = '00000000-0000-0000-0000-00000000a001'),
       (select id from ids where label = 'cat')) $$,
  'P0001', null, 'a pending entry cannot win'
);
select lives_ok(
  $$ select public.set_award_winner(
       (select id from public.awards where kind = 'first_deer' and season_id = '00000000-0000-0000-0000-00000000a001'),
       (select id from ids where label = 'ann1')) $$,
  'staff pick a qualifying winner once entries close'
);
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-00000000b003', 'voter.a@example.com');
set local role authenticated;
select throws_ok(
  $$ select public.set_award_winner(
       (select id from public.awards where kind = 'gun_muzzleloader' and season_id = '00000000-0000-0000-0000-00000000a001'),
       (select id from ids where label = 'bob')) $$,
  '42501', 'Staff only.', 'non-staff cannot pick winners'
);
reset role;

select pg_temp.shift_to('tallying');

select pg_temp.act_as('00000000-0000-0000-0000-00000000b001', 'editor@example.com');
set local role authenticated;
select throws_ok(
  $$ select public.set_award_winner(
       (select id from public.awards where kind = 'readers_choice' and season_id = '00000000-0000-0000-0000-00000000a001'),
       (select id from ids where label = 'bob')) $$,
  'P0001', null, 'Readers'' Choice cannot go to an entry below the top vote count'
);
select lives_ok(
  $$ select public.set_award_winner(
       (select id from public.awards where kind = 'readers_choice' and season_id = '00000000-0000-0000-0000-00000000a001'),
       (select id from ids where label = 'ann1')) $$,
  'Readers'' Choice goes to the top vote-getter'
);
reset role;

-- Prize drawing -------------------------------------------------------------------

insert into public.sponsors (id, season_id, name, tier, logo_path, prize, qr_slug) values
  ('00000000-0000-0000-0000-00000000c009', '00000000-0000-0000-0000-00000000a001', 'Charlie Tackle', 'prize_partner', 'c.png', 'Lures', 'charlie-tackle');

select pg_temp.act_as('00000000-0000-0000-0000-00000000b001', 'editor@example.com');
set local role authenticated;
-- Cat's entry is still waiting: only posted deer get a ticket, so it must be decided first.
select throws_ok($$ select public.run_prize_drawing('00000000-0000-0000-0000-00000000a001') $$,
  'P0001', '1 entry is still waiting for review. Post or decline it before the drawing.',
  'the drawing waits until every entry is decided');
select public.moderate_entry((select id from ids where label = 'cat'), 'rejected', 'Duplicate entry');
select throws_ok($$ select public.run_prize_drawing('00000000-0000-0000-0000-00000000a001') $$,
  'P0001', 'Only 2 entrants for 3 prizes.', 'entrants are counted once each, however many deer they entered');
reset role;

delete from public.sponsors where id = '00000000-0000-0000-0000-00000000c009';

select pg_temp.act_as('00000000-0000-0000-0000-00000000b003', 'voter.a@example.com');
set local role authenticated;
select throws_ok($$ select public.run_prize_drawing('00000000-0000-0000-0000-00000000a001') $$,
  '42501', 'Staff only.', 'non-staff cannot run the drawing');
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-00000000b001', 'editor@example.com');
set local role authenticated;
select lives_ok($$ select public.run_prize_drawing('00000000-0000-0000-0000-00000000a001') $$, 'staff run the drawing');
select throws_ok($$ select public.run_prize_drawing('00000000-0000-0000-0000-00000000a001') $$,
  'P0001', 'The 2099 drawing has already run.', 'the drawing runs once');
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-00000000b001', 'editor@example.com');
set local role authenticated;
select throws_ok($$ select public.moderate_entry((select id from ids where label = 'ann1'), 'rejected', 'Not their deer') $$,
  'P0001', 'This entry is a winner. Pick a different winner before taking it down.', 'an award winner cannot be taken down');
select throws_ok($$ select public.moderate_entry((select id from ids where label = 'bob'), 'rejected', 'Not their deer') $$,
  'P0001', 'This entry is a winner. Pick a different winner before taking it down.', 'a drawing winner cannot be taken down');
reset role;

select is((select count(*)::int from public.drawing_winners), 2, 'every Prize Partner prize is drawn');
select is(
  (select count(distinct p.email)::int from public.drawing_winners d join public.entry_private p on p.entry_id = d.entry_id),
  2, 'no entrant wins two drawing prizes'
);

-- Winner visibility -----------------------------------------------------------------

set local role anon;
select is((select count(*)::int from public.award_winners), 0, 'award winners stay hidden before the announcement');
select is((select count(*)::int from public.drawing_winners), 0, 'drawing winners stay hidden before the announcement');
reset role;

select pg_temp.shift_to('winners');

set local role anon;
select is((select count(*)::int from public.award_winners), 2, 'award winners are public once announced');
select is((select count(*)::int from public.drawing_winners), 2, 'drawing winners are public once announced');
reset role;

select * from finish();
rollback;
