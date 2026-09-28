-- Hunting Brag Board — schema.
--
-- Public-safe data lives in `entries`; anything about the person who submitted
-- (contact details, moderation audit) lives in `entry_private`, which only staff
-- can read. Cross-table "same season" rules are enforced with composite foreign
-- keys against unique (id, season_id) pairs rather than in function code.

create type public.weapon as enum ('bow', 'crossbow', 'rifle', 'shotgun', 'muzzleloader', 'handgun');
create type public.deer_type as enum ('buck', 'antlerless');
create type public.age_group as enum ('youth', 'adult', 'veteran');
create type public.entry_status as enum ('pending', 'approved', 'rejected');
create type public.sponsor_tier as enum ('presenting', 'award', 'prize_partner');
-- Declaration order is display order (matches the sponsor sheet).
create type public.award_kind as enum (
  'first_deer', 'youth', 'archery_crossbow', 'gun_muzzleloader', 'best_story', 'veteran', 'readers_choice'
);
create type public.season_phase as enum ('upcoming', 'entries', 'judging', 'voting', 'tallying', 'winners');

-- Reference data: harvest county must be one of Wisconsin's 72 counties.
create table public.wi_counties (
  name text primary key
);

insert into public.wi_counties (name) values
  ('Adams'), ('Ashland'), ('Barron'), ('Bayfield'), ('Brown'), ('Buffalo'), ('Burnett'), ('Calumet'),
  ('Chippewa'), ('Clark'), ('Columbia'), ('Crawford'), ('Dane'), ('Dodge'), ('Door'), ('Douglas'),
  ('Dunn'), ('Eau Claire'), ('Florence'), ('Fond du Lac'), ('Forest'), ('Grant'), ('Green'), ('Green Lake'),
  ('Iowa'), ('Iron'), ('Jackson'), ('Jefferson'), ('Juneau'), ('Kenosha'), ('Kewaunee'), ('La Crosse'),
  ('Lafayette'), ('Langlade'), ('Lincoln'), ('Manitowoc'), ('Marathon'), ('Marinette'), ('Marquette'), ('Menominee'),
  ('Milwaukee'), ('Monroe'), ('Oconto'), ('Oneida'), ('Outagamie'), ('Ozaukee'), ('Pepin'), ('Pierce'),
  ('Polk'), ('Portage'), ('Price'), ('Racine'), ('Richland'), ('Rock'), ('Rusk'), ('St. Croix'),
  ('Sauk'), ('Sawyer'), ('Shawano'), ('Sheboygan'), ('Taylor'), ('Trempealeau'), ('Vernon'), ('Vilas'),
  ('Walworth'), ('Washburn'), ('Washington'), ('Waukesha'), ('Waupaca'), ('Waushara'), ('Winnebago'), ('Wood');

-- One row per contest year. The calendar drives every phase; nothing is toggled by hand.
create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  year smallint not null unique,
  is_active boolean not null default false,
  harvest_since date not null,
  entries_open_at timestamptz not null,
  gun_opener_at timestamptz not null,
  entries_close_at timestamptz not null,
  voting_open_at timestamptz not null,
  voting_close_at timestamptz not null,
  winners_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint season_calendar_order check (
    entries_open_at < gun_opener_at
    and gun_opener_at < entries_close_at
    and entries_close_at <= voting_open_at
    and voting_open_at < voting_close_at
    and voting_close_at <= winners_at
  ),
  constraint harvest_window_starts_before_entries_open check (harvest_since <= (entries_open_at at time zone 'America/Chicago')::date)
);

create unique index seasons_one_active on public.seasons (is_active) where is_active;

create table public.staff (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.sponsors (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  tier public.sponsor_tier not null,
  logo_path text not null check (length(logo_path) > 0),
  website_url text check (website_url ~ '^https://'),
  prize text not null check (length(trim(prize)) > 0),
  -- Tracked counter-card / QR link identifier, e.g. `joes-meats`.
  qr_slug text not null unique check (qr_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  created_at timestamptz not null default now(),
  unique (id, season_id)
);

create unique index sponsors_one_presenting_per_season on public.sponsors (season_id) where tier = 'presenting';

create table public.awards (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons (id) on delete cascade,
  kind public.award_kind not null,
  label text not null check (length(trim(label)) > 0),
  description text not null check (length(trim(description)) > 0),
  sponsor_id uuid,
  unique (season_id, kind),
  unique (sponsor_id),
  unique (id, season_id),
  foreign key (sponsor_id, season_id) references public.sponsors (id, season_id) on delete set null (sponsor_id)
);

-- Readers' Choice is presented by the presenting sponsor; every other award by an award sponsor.
create function public.awards_sponsor_tier_matches() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_tier public.sponsor_tier;
begin
  if new.sponsor_id is null then
    return new;
  end if;

  select tier into v_tier from public.sponsors where id = new.sponsor_id;

  if new.kind = 'readers_choice' and v_tier <> 'presenting' then
    raise exception 'Readers'' Choice must be presented by the presenting sponsor (got a % sponsor).', v_tier;
  end if;
  if new.kind <> 'readers_choice' and v_tier <> 'award' then
    raise exception 'The % award must be presented by an award sponsor (got a % sponsor).', new.kind, v_tier;
  end if;

  return new;
end;
$$;

create trigger awards_sponsor_tier_matches
before insert or update of sponsor_id, kind on public.awards
for each row execute function public.awards_sponsor_tier_matches();

create table public.entries (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons (id) on delete cascade,
  status public.entry_status not null default 'pending',
  hunter_name text not null check (length(trim(hunter_name)) between 1 and 60),
  hometown text not null check (length(trim(hometown)) between 1 and 60),
  county text not null references public.wi_counties (name),
  harvest_date date not null,
  weapon public.weapon not null,
  deer_type public.deer_type not null,
  points smallint check (points between 1 and 40),
  first_deer boolean not null,
  age_group public.age_group not null,
  guardian_consent boolean not null,
  story text check (length(trim(story)) between 1 and 1200),
  -- Server-generated. Storage objects: entry-photos/<photo_id>/full.jpg and /thumb.jpg.
  photo_id uuid not null unique,
  created_at timestamptz not null default now(),
  unique (id, season_id),
  constraint points_only_for_bucks check (points is null or deer_type = 'buck'),
  constraint youth_entries_need_guardian_consent check (age_group <> 'youth' or guardian_consent)
);

create index entries_season_status_created on public.entries (season_id, status, created_at desc);

-- Staff-only: who submitted, how to reach them, and the moderation audit trail.
create table public.entry_private (
  entry_id uuid primary key references public.entries (id) on delete cascade,
  submitter_name text not null check (length(trim(submitter_name)) between 1 and 100),
  email text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  rules_accepted_at timestamptz not null default now(),
  moderated_by uuid references auth.users (id) on delete set null,
  moderated_at timestamptz,
  rejection_reason text check (length(trim(rejection_reason)) > 0)
);

create index entry_private_email on public.entry_private (email);

-- Readers' Choice: one vote per verified email per season.
create table public.votes (
  season_id uuid not null references public.seasons (id) on delete cascade,
  voter_id uuid not null references auth.users (id) on delete cascade,
  entry_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (season_id, voter_id),
  foreign key (entry_id, season_id) references public.entries (id, season_id) on delete cascade
);

create index votes_entry on public.votes (entry_id);

create table public.newsletter_optins (
  email text primary key check (email = lower(email)),
  source text not null check (source in ('entry', 'vote')),
  created_at timestamptz not null default now()
);

create table public.award_winners (
  award_id uuid primary key,
  season_id uuid not null,
  entry_id uuid not null,
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz not null default now(),
  foreign key (award_id, season_id) references public.awards (id, season_id) on delete cascade,
  foreign key (entry_id, season_id) references public.entries (id, season_id) on delete restrict
);

-- Prize Partner drawing: one prize per sponsor, one prize per entrant.
create table public.drawing_winners (
  sponsor_id uuid primary key,
  season_id uuid not null,
  entry_id uuid not null unique,
  drawn_by uuid references auth.users (id) on delete set null,
  drawn_at timestamptz not null default now(),
  foreign key (sponsor_id, season_id) references public.sponsors (id, season_id) on delete restrict,
  foreign key (entry_id, season_id) references public.entries (id, season_id) on delete restrict
);
