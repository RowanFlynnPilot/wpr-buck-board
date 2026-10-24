begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

-- Fixtures --------------------------------------------------------------------

update public.seasons set is_active = false;
insert into public.seasons (id, year, is_active, harvest_since, entries_open_at, gun_opener_at, entries_close_at,
  voting_open_at, voting_close_at, winners_at)
values ('00000000-0000-0000-0000-00000000a011', 2099, true, current_date - 60,
  now() - interval '10 days', now() + interval '5 days', now() + interval '10 days',
  now() + interval '11 days', now() + interval '15 days', now() + interval '16 days');

insert into public.awards (season_id, kind, label, description) values
  ('00000000-0000-0000-0000-00000000a011', 'gun_muzzleloader', 'Gun & Muzzleloader', 'Test award.'),
  ('00000000-0000-0000-0000-00000000a011', 'readers_choice', 'Readers'' Choice', 'Test award.');

insert into public.sponsors (id, season_id, name, tier, logo_path, prize, qr_slug) values
  ('00000000-0000-0000-0000-00000000c011', '00000000-0000-0000-0000-00000000a011', 'Alpha Bait', 'prize_partner', 'a.png', 'Gift card', 'alpha-bait-11'),
  ('00000000-0000-0000-0000-00000000c012', '00000000-0000-0000-0000-00000000a011', 'Bravo Meats', 'prize_partner', 'b.png', 'Processing', 'bravo-meats-11');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000b011', 'editor@example.com'),
  ('00000000-0000-0000-0000-00000000b012', 'John.Doe@gmail.com'),
  ('00000000-0000-0000-0000-00000000b013', 'johndoe+brag@googlemail.com'),
  ('00000000-0000-0000-0000-00000000b014', 'temp@mailinator.com'),
  ('00000000-0000-0000-0000-00000000b015', 'jane@example.com');
insert into public.staff (user_id) values ('00000000-0000-0000-0000-00000000b011');

create function pg_temp.act_as(p_sub text, p_email text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_sub, 'email', p_email, 'role', 'authenticated')::text, true)
$$;

create function pg_temp.shift_to(p_phase text) returns void language sql as $$
  update public.seasons s set
    entries_open_at = now() + o.open, gun_opener_at = now() + o.gun, entries_close_at = now() + o.close,
    voting_open_at = now() + o.vopen, voting_close_at = now() + o.vclose, winners_at = now() + o.win
  from (values
    ('voting',   interval '-30 days', interval '-25 days', interval '-5 days', interval '-1 day', interval '3 days', interval '4 days'),
    ('tallying', interval '-30 days', interval '-25 days', interval '-10 days', interval '-5 days', interval '-1 day', interval '1 day')
  ) as o (phase, open, gun, close, vopen, vclose, win)
  where s.is_active and o.phase = p_phase
$$;

-- Twelve posted deer from twelve hunters, e01 to e12.
create temp table ids (label text primary key, id uuid not null);
grant select on ids to anon, authenticated;
insert into ids
select 'e' || lpad(n::text, 2, '0'),
  public.submit_entry('Hunter ' || n, 'Wausau', 'Marathon', current_date - 2, 'rifle', 'buck', 8::smallint, false,
    'adult', false, null, gen_random_uuid(), 'Hunter ' || n, 'hunter' || n || '@example.com', false)
from generate_series(1, 12) n;
update public.entries set status = 'approved' where id in (select id from ids);

-- The email that counts ---------------------------------------------------------------

select is(public.vote_email_key('John.Doe+brag@Gmail.com'), 'johndoe@gmail.com', 'Gmail: dots and +tags fall away');
select is(public.vote_email_key('johndoe@googlemail.com'), 'johndoe@gmail.com', 'googlemail.com is Gmail');
select is(public.vote_email_key('Jane.Doe+x@Example.com'), 'jane.doe@example.com', 'elsewhere only the +tag falls away');

-- Finalists ----------------------------------------------------------------------------

select pg_temp.act_as('00000000-0000-0000-0000-00000000b015', 'jane@example.com');
set local role authenticated;
select throws_ok($$ select public.set_finalist((select id from ids where label = 'e01'), true) $$,
  '42501', 'Staff only.', 'readers cannot pick finalists');
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-00000000b011', 'editor@example.com');
set local role authenticated;
select lives_ok($$ select public.set_finalist(id, true) from ids where label <= 'e10' $$, 'staff pick ten finalists');
select throws_ok($$ select public.set_finalist((select id from ids where label = 'e11'), true) $$,
  'P0001', 'Readers'' Choice has up to 10 finalists. Remove one to add another.', 'an eleventh is refused');
select lives_ok($$ select public.set_finalist((select id from ids where label = 'e10'), false) $$, 'a finalist can be withdrawn');
select lives_ok($$ select public.set_finalist((select id from ids where label = 'e11'), true) $$, 'and another picked in its place');
select is((select count(*)::int from public.finalists), 10, 'ten finalists');
reset role;

-- Voting: one vote per inbox, no throwaway addresses -------------------------------------------

select pg_temp.shift_to('voting');

select pg_temp.act_as('00000000-0000-0000-0000-00000000b012', 'John.Doe@gmail.com');
set local role authenticated;
select lives_ok($$ select public.cast_vote((select id from ids where label = 'e01'), false) $$, 'a Gmail reader votes');
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-00000000b013', 'johndoe+brag@googlemail.com');
set local role authenticated;
select throws_ok($$ select public.cast_vote((select id from ids where label = 'e02'), false) $$,
  'P0001', 'You have already voted for Readers'' Choice this season.',
  'the same inbox under another spelling cannot vote again');
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-00000000b014', 'temp@mailinator.com');
set local role authenticated;
select throws_ok($$ select public.cast_vote((select id from ids where label = 'e02'), false) $$,
  'P0001', 'Vote with a personal or work email address, not a temporary one.', 'a throwaway inbox cannot vote');
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-00000000b015', 'jane@example.com');
set local role authenticated;
select lives_ok($$ select public.cast_vote((select id from ids where label = 'e02'), false) $$, 'another reader votes');
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-00000000b011', 'editor@example.com');
set local role authenticated;
select throws_ok($$ select public.set_finalist((select id from ids where label = 'e12'), true) $$,
  'P0001', 'Finalists are set before voting opens.', 'once a vote is in, no finalist can be added');
select lives_ok($$ select public.set_finalist((select id from ids where label = 'e02'), false) $$,
  'but one can still be withdrawn');
select is((select coalesce(sum(votes), 0)::int from public.readers_choice_standings
  where entry_id = (select id from ids where label = 'e02')), 0, 'and its votes no longer count');
select throws_ok($$ select public.moderate_entry((select id from ids where label = 'e01'), 'rejected', 'Not their deer') $$,
  'P0001', 'This deer is a Readers'' Choice finalist. Remove it from the finalists first.',
  'a finalist cannot be taken down while on the ballot');
reset role;

-- Prize eligibility: staff households share, but don't win ----------------------------------

select pg_temp.shift_to('tallying');

select pg_temp.act_as('00000000-0000-0000-0000-00000000b011', 'editor@example.com');
set local role authenticated;
select lives_ok($$ select public.set_prize_eligible((select id from ids where label = 'e03'), false) $$,
  'staff mark a staff household');
select throws_ok(
  $$ select public.set_award_winner(
       (select id from public.awards where kind = 'gun_muzzleloader' and season_id = '00000000-0000-0000-0000-00000000a011'),
       (select id from ids where label = 'e03')) $$,
  'P0001', 'This entrant is on staff or in a staff household and can''t win prizes.', 'an ineligible entrant cannot win an award');
select throws_ok(
  $$ select public.set_award_winner(
       (select id from public.awards where kind = 'readers_choice' and season_id = '00000000-0000-0000-0000-00000000a011'),
       (select id from ids where label = 'e12')) $$,
  'P0001', 'Readers'' Choice goes to a finalist.', 'Readers'' Choice goes only to a finalist');
select lives_ok(
  $$ select public.set_award_winner(
       (select id from public.awards where kind = 'readers_choice' and season_id = '00000000-0000-0000-0000-00000000a011'),
       (select id from ids where label = 'e01')) $$,
  'the top vote-getter among the finalists wins Readers'' Choice');

-- The drawing skips the staff household, and a forfeited prize is drawn again -----------------------

select lives_ok($$ select public.run_prize_drawing('00000000-0000-0000-0000-00000000a011') $$, 'the drawing runs');
select is((select count(*)::int from public.drawing_winners d
  where d.entry_id = (select id from ids where label = 'e03')), 0, 'the staff household holds no prize');

create temp table before_redraw as select sponsor_id, entry_id from public.drawing_winners;
select lives_ok($$ select public.redraw_prize('00000000-0000-0000-0000-00000000c011') $$, 'staff redraw an unclaimed prize');
select is((select count(*)::int from public.prize_forfeits), 1, 'the forfeit is recorded');
select is((select entry_id from public.prize_forfeits), (select entry_id from before_redraw where sponsor_id = '00000000-0000-0000-0000-00000000c011'),
  'by the winner who did not claim it');
select isnt((select entry_id from public.drawing_winners where sponsor_id = '00000000-0000-0000-0000-00000000c011'),
  (select entry_id from before_redraw where sponsor_id = '00000000-0000-0000-0000-00000000c011'), 'the prize has a new winner');
select is((select count(distinct p.email)::int from public.drawing_winners d join public.entry_private p on p.entry_id = d.entry_id), 2,
  'who does not already hold the other prize');
select lives_ok($$ select public.moderate_entry((select entry_id from public.prize_forfeits), 'rejected', 'Never claimed, not their deer') $$,
  'the former winner can now be taken down');
reset role;

select * from finish();
rollback;
