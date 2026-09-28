-- 2026 Hunting Brag Board season.
-- Local: loaded as the seed by `supabase db reset`.
-- Production: run once in the SQL editor after the migrations are pushed.

insert into public.seasons (
  year, is_active, harvest_since,
  entries_open_at, gun_opener_at, entries_close_at,
  voting_open_at, voting_close_at, winners_at
) values (
  2026, true, date '2026-09-12',
  timestamptz '2026-10-12 00:00 America/Chicago',  -- entries open
  timestamptz '2026-11-21 00:00 America/Chicago',  -- gun deer opener (front-page countdown)
  timestamptz '2026-12-14 00:00 America/Chicago',  -- entries close at the end of Dec. 13
  timestamptz '2026-12-14 00:00 America/Chicago',  -- Readers' Choice voting Dec. 14–18
  timestamptz '2026-12-19 00:00 America/Chicago',
  timestamptz '2026-12-21 06:00 America/Chicago'   -- winners announced
);

insert into public.awards (season_id, kind, label, description)
select s.id, a.kind::public.award_kind, a.label, a.description
from public.seasons s
cross join (values
  ('first_deer', 'First Deer', 'Hunters who tagged their first deer ever.'),
  ('youth', 'Youth Hunter', 'Hunters 17 and under, entered by a parent or guardian.'),
  ('archery_crossbow', 'Archery & Crossbow', 'Deer taken with a bow or crossbow.'),
  ('gun_muzzleloader', 'Gun & Muzzleloader', 'Deer taken with a rifle, shotgun, handgun or muzzleloader.'),
  ('best_story', 'Best Story', 'The best hunt story, chosen by our staff.'),
  ('veteran', 'Veteran Hunter', 'Hunters 65 and older.'),
  ('readers_choice', 'Readers'' Choice', 'Voted on by Pilot readers, Dec. 14–18.')
) as a (kind, label, description)
where s.year = 2026;
