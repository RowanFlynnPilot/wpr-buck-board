begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

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

create temp table ids (label text primary key, id text not null);
grant select on ids to anon, authenticated;

insert into ids values ('posted', public.submit_entry('Carter', 'Antigo', 'Langlade', current_date - 2, 'rifle',
  'buck', 8::smallint, true, 'youth', true, null, gen_random_uuid(), 'Mike Johnson', 'mike@example.com', false));
insert into ids values ('waiting', public.submit_entry('Pete', 'Mosinee', 'Marathon', current_date - 1, 'bow',
  'antlerless', null, false, 'adult', false, null, gen_random_uuid(), 'Pete Smith', 'pete@example.com', false));
update public.entries set status = 'approved' where id = (select id::uuid from ids where label = 'posted');

-- Card names: <entry id>/<uuid>.jpg.
insert into ids values
  ('card1', (select id from ids where label = 'posted') || '/' || gen_random_uuid() || '.jpg'),
  ('card2', (select id from ids where label = 'posted') || '/' || gen_random_uuid() || '.jpg'),
  ('never uploaded', (select id from ids where label = 'posted') || '/' || gen_random_uuid() || '.jpg'),
  ('waiting card', (select id from ids where label = 'waiting') || '/' || gen_random_uuid() || '.jpg');

-- Who may upload a card ----------------------------------------------------------

set local role anon;
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('share-cards', (select id from ids where label = 'card1')) $$,
  '42501', null, 'anon cannot upload a share card');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b002","email":"reader@example.com"}', true);
set local role authenticated;
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('share-cards', (select id from ids where label = 'card1')) $$,
  '42501', null, 'non-staff cannot upload a share card');
select throws_ok($$ select public.set_share_card((select id::uuid from ids where label = 'posted'), (select id from ids where label = 'card1')) $$,
  '42501', 'Staff only.', 'non-staff cannot set a share card');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b001","email":"editor@example.com"}', true);
set local role authenticated;
select lives_ok($$ insert into storage.objects (bucket_id, name) values
  ('share-cards', (select id from ids where label = 'card1')),
  ('share-cards', (select id from ids where label = 'card2')),
  ('share-cards', (select id from ids where label = 'waiting card')) $$,
  'staff upload share cards');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('entry-photos', gen_random_uuid() || '/full.jpg') $$,
  '42501', null, 'staff still cannot write entry photos: submit-entry is the only writer');
select is((select count(*)::int from storage.objects where bucket_id = 'share-cards'), 3, 'staff see the share cards');

-- What a card must be -------------------------------------------------------------

select throws_ok($$ select public.set_share_card((select id::uuid from ids where label = 'posted'), (select id from ids where label = 'waiting card')) $$,
  'P0001', 'A share image goes in its own deer''s folder.', 'a card from another deer''s folder is refused');
select throws_ok($$ select public.set_share_card((select id::uuid from ids where label = 'posted'), 'not-a-card.png') $$,
  'P0001', 'A share image goes in its own deer''s folder.', 'a name that isn''t a card is refused');
select throws_ok($$ select public.set_share_card((select id::uuid from ids where label = 'posted'), (select id from ids where label = 'never uploaded')) $$,
  'P0001', 'That share image hasn''t been uploaded.', 'a card that isn''t in storage is refused');
select throws_ok($$ select public.set_share_card((select id::uuid from ids where label = 'waiting'), (select id from ids where label = 'waiting card')) $$,
  'P0001', 'Only a deer on the board gets a share image.', 'a deer waiting for review gets no card');

-- Setting and replacing -------------------------------------------------------------

select is(public.set_share_card((select id::uuid from ids where label = 'posted'), (select id from ids where label = 'card1')),
  null, 'the first card replaces nothing');
select is(public.set_share_card((select id::uuid from ids where label = 'posted'), (select id from ids where label = 'card2')),
  (select id from ids where label = 'card1'), 'a new card returns the one it replaces');

-- The Storage API allows deletes this way; the policy decides who.
set local storage.allow_delete_query = 'true';
select lives_ok($$ delete from storage.objects where bucket_id = 'share-cards' and name = (select id from ids where label = 'card1') $$,
  'staff remove the old card');
reset role;

select is((select count(*)::int from storage.objects where bucket_id = 'share-cards'), 2, 'the old card is gone');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b002","email":"reader@example.com"}', true);
set local role authenticated;
select lives_ok($$ delete from storage.objects where bucket_id = 'share-cards' $$, 'a non-staff delete runs');
reset role;
select is((select count(*)::int from storage.objects where bucket_id = 'share-cards'), 2, 'but removes nothing');

set local role anon;
select is((select share_card from public.gallery_entries where id = (select id::uuid from ids where label = 'posted')),
  (select id from ids where label = 'card2'), 'the board names the current card, for the share page');
reset role;
select is((select share_card from public.entries where id = (select id::uuid from ids where label = 'waiting')),
  null, 'the waiting deer still has none');

select * from finish();
rollback;
