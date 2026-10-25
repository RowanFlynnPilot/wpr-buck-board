-- Hunting Brag Board — the DNR's own count beside the board's map.
--
-- The DNR publishes preliminary registrations statewide and by county the Tuesday after the gun
-- opener, and again after the nine-day season. Staff copy the statewide and Marathon County
-- numbers in from the release (SQL editor), and the board shows the latest under its county map,
-- linked to the release. Public: these are the DNR's published numbers.

create table public.dnr_tallies (
  season_id uuid not null references public.seasons (id) on delete cascade,
  period text not null check (period in ('opening_weekend', 'gun_season')),
  released_on date not null,
  statewide integer not null check (statewide > 0),
  marathon integer check (marathon >= 0),
  source_url text not null check (source_url ~ '^https://'),
  primary key (season_id, period)
);

alter table public.dnr_tallies enable row level security;
grant select on public.dnr_tallies to anon, authenticated;
create policy "The DNR's published numbers are public" on public.dnr_tallies for select to anon, authenticated
  using (true);
