begin;
create extension if not exists pgtap with schema extensions;
select plan(49);

-- These assert the privilege map in both directions, so a missing grant fails CI
-- as loudly as an extra one.

-- Public reads (positive).
select ok(has_table_privilege('anon', 'public.seasons', 'select'), 'anon reads seasons');
select ok(has_table_privilege('anon', 'public.sponsors', 'select'), 'anon reads sponsors');
select ok(has_table_privilege('anon', 'public.awards', 'select'), 'anon reads awards');
select ok(has_table_privilege('anon', 'public.wi_counties', 'select'), 'anon reads counties');
select ok(has_table_privilege('anon', 'public.entries', 'select'), 'anon reads entries (RLS limits to approved)');
select ok(has_table_privilege('anon', 'public.current_season', 'select'), 'anon reads current_season');
select ok(has_table_privilege('anon', 'public.gallery_entries', 'select'), 'anon reads gallery_entries');
select ok(has_table_privilege('anon', 'public.award_winners', 'select'), 'anon reads award winners (RLS gates by date)');
select ok(has_table_privilege('anon', 'public.drawing_winners', 'select'), 'anon reads drawing winners (RLS gates by date)');
select ok(has_table_privilege('authenticated', 'public.entry_private', 'select'), 'authenticated reads entry_private (RLS: staff only)');
select ok(has_table_privilege('authenticated', 'public.votes', 'select'), 'authenticated reads votes (RLS: own or staff)');
select ok(has_table_privilege('authenticated', 'public.entry_edits', 'select'), 'authenticated reads entry_edits (RLS: staff only)');
select ok(has_table_privilege('authenticated', 'public.readers_choice_standings', 'select'), 'authenticated reads vote standings (RLS on votes: staff only)');

-- The entry function writes its emails from these, as service_role (migration 0010).
select ok(has_table_privilege('service_role', 'public.entries', 'select'), 'service role reads entries for the entry emails');
select ok(has_table_privilege('service_role', 'public.seasons', 'select'), 'service role reads seasons for the entry emails');
select ok(has_table_privilege('service_role', 'public.entry_private', 'select'), 'service role reads entrant details for the entry emails');

-- Private data (negative).
select ok(not has_table_privilege('anon', 'public.entry_private', 'select'), 'anon cannot read entry_private');
select ok(not has_table_privilege('anon', 'public.votes', 'select'), 'anon cannot read votes');
select ok(not has_table_privilege('anon', 'public.newsletter_optins', 'select'), 'anon cannot read newsletter opt-ins');
select ok(not has_table_privilege('anon', 'public.staff', 'select'), 'anon cannot read staff');
select ok(not has_table_privilege('authenticated', 'public.staff', 'select'), 'authenticated cannot read staff');
select ok(not has_table_privilege('anon', 'public.readers_choice_standings', 'select'), 'anon cannot read vote standings');
select ok(not has_table_privilege('anon', 'public.entry_edits', 'select'), 'anon cannot read the entry edit log');

-- No direct writes for API roles (negative).
select ok(not has_table_privilege('anon', 'public.entries', 'insert,update,delete'), 'anon cannot write entries');
select ok(not has_table_privilege('authenticated', 'public.entries', 'insert,update,delete'), 'authenticated cannot write entries');
select ok(not has_table_privilege('authenticated', 'public.votes', 'insert,update,delete'), 'authenticated cannot write votes directly');
select ok(not has_table_privilege('authenticated', 'public.award_winners', 'insert,update,delete'), 'authenticated cannot write winners directly');
select ok(not has_table_privilege('authenticated', 'public.seasons', 'insert,update,delete'), 'authenticated cannot change the calendar');
select ok(not has_table_privilege('authenticated', 'public.entry_edits', 'insert,update,delete'), 'authenticated cannot write the edit log directly');
select is(
  (select array_agg(role || ' ' || tbl order by role, tbl)
   from unnest(array['anon', 'authenticated']) role,
        unnest(array['public.staff', 'public.entry_private', 'public.drawing_winners', 'public.newsletter_optins',
                     'public.sponsors', 'public.awards', 'public.wi_counties']) tbl
   where has_table_privilege(role, tbl, 'insert,update,delete,truncate')),
  null,
  'no API role can write staff, entrant details, the drawing, opt-ins or the catalog directly'
);

-- RPC execute map.
select ok(has_function_privilege('service_role', 'public.submit_entry(text, text, text, date, public.weapon, public.deer_type, smallint, boolean, public.age_group, boolean, text, uuid, text, text, boolean, text, text, boolean, text)', 'execute'),
  'service role can submit entries');
select ok(not has_function_privilege('anon', 'public.submit_entry(text, text, text, date, public.weapon, public.deer_type, smallint, boolean, public.age_group, boolean, text, uuid, text, text, boolean, text, text, boolean, text)', 'execute'),
  'anon cannot call submit_entry');
select ok(not has_function_privilege('authenticated', 'public.submit_entry(text, text, text, date, public.weapon, public.deer_type, smallint, boolean, public.age_group, boolean, text, uuid, text, text, boolean, text, text, boolean, text)', 'execute'),
  'authenticated cannot call submit_entry');
select ok(has_function_privilege('authenticated', 'public.moderate_entry(uuid, public.entry_status, text)', 'execute'), 'authenticated can call moderate_entry (staff check inside)');
select ok(not has_function_privilege('anon', 'public.moderate_entry(uuid, public.entry_status, text)', 'execute'), 'anon cannot call moderate_entry');
select ok(has_function_privilege('authenticated', 'public.cast_vote(uuid, boolean)', 'execute'), 'authenticated can vote');
select ok(not has_function_privilege('anon', 'public.cast_vote(uuid, boolean)', 'execute'), 'anon cannot vote');
select ok(has_function_privilege('authenticated', 'public.is_staff()', 'execute'), 'authenticated can check staff status');
select ok(has_function_privilege('authenticated', 'public.edit_entry(uuid, text, text, text)', 'execute'), 'authenticated can call edit_entry (staff check inside)');
select ok(not has_function_privilege('anon', 'public.edit_entry(uuid, text, text, text)', 'execute'), 'anon cannot call edit_entry');
select ok(has_function_privilege('authenticated', 'public.set_share_card(uuid, text)', 'execute'), 'authenticated can call set_share_card (staff check inside)');
select ok(not has_function_privilege('anon', 'public.set_share_card(uuid, text)', 'execute'), 'anon cannot call set_share_card');
select ok(has_function_privilege('authenticated', 'public.set_award_winner(uuid, uuid)', 'execute'), 'authenticated can call set_award_winner (staff check inside)');
select ok(not has_function_privilege('anon', 'public.set_award_winner(uuid, uuid)', 'execute'), 'anon cannot pick winners');
select ok(has_function_privilege('authenticated', 'public.run_prize_drawing(uuid)', 'execute'), 'authenticated can call run_prize_drawing (staff check inside)');
select ok(not has_function_privilege('anon', 'public.run_prize_drawing(uuid)', 'execute'), 'anon cannot run the drawing');

-- Hygiene.
select is(
  (select array_agg(c.relname::text order by c.relname) from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and not c.relrowsecurity),
  null,
  'every public table has row-level security enabled'
);
select is(
  (select array_agg(p.proname::text order by p.proname) from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prosecdef
     and not coalesce(p.proconfig @> array['search_path=""'], false)),
  null,
  'every security-definer function pins an empty search_path'
);
select is(
  (select array_agg(c.relname::text order by c.relname) from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'v'
     and not coalesce(c.reloptions @> array['security_invoker=true'], false)),
  null,
  'every view runs as the caller'
);

select * from finish();
rollback;
