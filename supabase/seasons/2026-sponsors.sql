-- 2026 sponsors and prizes, from Shereen (Oct. 27; names and web addresses from Rowan, Oct. 30).
-- Angelo's Family Pizza presents the board, and its pizza party is the Readers' Choice grand
-- prize; Burks Bar gives Best Story's prize; the other five awards are honors without a prize.
-- The drawing has six sets of Wausau Cyclones tickets, a Palms gift card and two Hyprov tickets
-- at The Grand Theater.
--
-- Production: run once in the SQL editor, after migration 0019 (logos optional) and after the five
-- logos (from each sponsor's own site; copies in wpr-brag-board-media/sponsor-logos) are uploaded
-- to the sponsor-logos bucket under these names. A logo that isn't there shows as a broken image,
-- so upload first; to go up without one, set its logo_path to null and the board sets the name in
-- type. Not part of the local seed.
--
-- burksbar.com has no secure (https) version, and the board links only https addresses, so Burks
-- links to the Facebook page its site points to. If the presenting sponsor or its logo changes
-- after deer are posted, open #/admin > On the board > Remake all share images.

begin;

insert into public.sponsors (season_id, name, tier, logo_path, website_url, prize, qr_slug)
select season.id, s.name, s.tier::public.sponsor_tier, s.logo_path, s.website_url, s.prize, s.qr_slug
from public.seasons season
cross join (values
  ('Angelo’s Family Pizza', 'presenting', 'angelos-family-pizza.jpg', 'https://angelosfamilypizzawausau.com',
    '$150 Angelo’s Pizza Party gift card', 'angelos-family-pizza'),
  ('Burks Bar', 'award', 'burks-bar.png', 'https://www.facebook.com/burksbar/', '$50 gift card', 'burks-bar'),
  ('The Palms Supper Club', 'prize_partner', 'palms-supper-club.png', 'https://thepalmswausau.com', '$25 gift card',
    'palms-supper-club'),
  ('The Grand Theater', 'prize_partner', 'grand-theater.jpg', 'https://www.grandtheater.org',
    'Two tickets to Hyprov: Improv Under Hypnosis, Thursday, Jan. 14', 'grand-theater')
) as s (name, tier, logo_path, website_url, prize, qr_slug)
where season.year = 2026;

-- Six sets of Cyclones tickets: a row for each, so each set is drawn, and redrawn, on its own.
-- The board lists them once, as "Six winners".
insert into public.sponsors (season_id, name, tier, logo_path, website_url, prize, qr_slug)
select season.id, 'Wausau Cyclones', 'prize_partner', 'wausau-cyclones.png', 'https://www.wausaucyclones.com',
  'Cyclones tickets, good for any game', 'wausau-cyclones-' || n
from public.seasons season
cross join generate_series(1, 6) as n
where season.year = 2026;

-- Readers' Choice credits the presenting sponsor anyway; attaching it makes that explicit.
update public.awards set sponsor_id = (select id from public.sponsors where qr_slug = 'angelos-family-pizza')
where kind = 'readers_choice' and season_id = (select id from public.seasons where year = 2026);

update public.awards set sponsor_id = (select id from public.sponsors where qr_slug = 'burks-bar')
where kind = 'best_story' and season_id = (select id from public.seasons where year = 2026);

commit;

-- Check: 10 rows, Angelo's on Readers' Choice and Burks Bar on Best Story.
select s.name, s.tier, s.prize, s.logo_path, a.label as award
from public.sponsors s
left join public.awards a on a.sponsor_id = s.id
where s.season_id = (select id from public.seasons where year = 2026)
order by s.tier, s.name, s.qr_slug;
