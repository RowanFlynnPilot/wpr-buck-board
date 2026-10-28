-- 2026 sponsors and prizes, from Shereen (Oct. 27). Angelo's presents the board, and its pizza
-- party is the Readers' Choice grand prize; Burks Bar gives Best Story's prize; the other five
-- awards are honors without a prize. The drawing has six sets of Wausau Cyclones tickets, a
-- Palms gift card and two Hyprov tickets at The Grand Theater.
--
-- Production: run once in the SQL editor, after migration 0019 (logos optional). Names and prizes
-- print on the board as written here, so confirm the spellings with Chris first, and fill in
-- the web addresses left null (a sponsor without one shows unlinked). Not part of the local seed.
--
-- Logos can follow. Upload each to the sponsor-logos bucket, then
--   update public.sponsors set logo_path = '<object name>' where qr_slug = '<slug>';
-- Until then the board sets the sponsor's name in type. After Angelo's logo goes in, open
-- #/admin > On the board > Remake all share images, since every share image carries it.

begin;

insert into public.sponsors (season_id, name, tier, website_url, prize, qr_slug)
select season.id, s.name, s.tier::public.sponsor_tier, s.website_url, s.prize, s.qr_slug
from public.seasons season
cross join (values
  ('Angelo’s Pizza', 'presenting', null, '$150 Angelo’s Pizza Party gift card', 'angelos-pizza'),
  ('Burks Bar', 'award', null, '$50 gift card', 'burks-bar'),
  ('The Palms Supper Club', 'prize_partner', null, '$25 gift card', 'palms-supper-club'),
  ('The Grand Theater', 'prize_partner', 'https://www.grandtheater.org',
    'Two tickets to Hyprov: Improv Under Hypnosis, Thursday, Jan. 14', 'grand-theater')
) as s (name, tier, website_url, prize, qr_slug)
where season.year = 2026;

-- Six sets of Cyclones tickets: a row for each, so each set is drawn, and redrawn, on its own.
-- The board lists them once, as "Six winners".
insert into public.sponsors (season_id, name, tier, website_url, prize, qr_slug)
select season.id, 'Wausau Cyclones', 'prize_partner', 'https://www.wausaucyclones.com',
  'Cyclones tickets, good for any game', 'wausau-cyclones-' || n
from public.seasons season
cross join generate_series(1, 6) as n
where season.year = 2026;

-- Readers' Choice credits the presenting sponsor anyway; attaching it makes that explicit.
update public.awards set sponsor_id = (select id from public.sponsors where qr_slug = 'angelos-pizza')
where kind = 'readers_choice' and season_id = (select id from public.seasons where year = 2026);

update public.awards set sponsor_id = (select id from public.sponsors where qr_slug = 'burks-bar')
where kind = 'best_story' and season_id = (select id from public.seasons where year = 2026);

commit;

-- Check: 10 rows, Angelo's on Readers' Choice and Burks Bar on Best Story.
select s.name, s.tier, s.prize, a.label as award
from public.sponsors s
left join public.awards a on a.sponsor_id = s.id
where s.season_id = (select id from public.seasons where year = 2026)
order by s.tier, s.name, s.qr_slug;
