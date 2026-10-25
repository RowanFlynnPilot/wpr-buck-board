-- Hunting Brag Board — a thank-you for every entrant, and Deer of the Week.
--
-- 1. A thank-you offer. One sponsor a season (tier thank_you) gives every entrant whose deer goes
--    on the board something, a coupon or tickets, named in the sponsor's prize text. It arrives in
--    the "your deer is on the board" email, not at entry, so a junk entry can't collect it. How to
--    redeem it, and any code, live in thank_you_offers, which only that email reads: a code on the
--    public board would be everyone's. posted_notice() now hands the email the offer.
-- 2. Deer of the Week. Each Friday while entries are open, staff pick one deer from the board
--    (set_weekly_pick), presented by the Deer of the Week sponsor with its weekly prize. A pick is
--    public from its Friday on, so it can be queued the day before. It is a prize like any other:
--    staff households can't win it, and a picked deer stays on the board.
-- The confirmation email names the thank-you, so the entry function reads sponsors.

-- 1. A thank-you offer -------------------------------------------------------------------------

create unique index sponsors_one_thank_you_per_season on public.sponsors (season_id) where tier = 'thank_you';
create unique index sponsors_one_deer_of_the_week_per_season on public.sponsors (season_id)
where tier = 'deer_of_the_week';

create table public.thank_you_offers (
  sponsor_id uuid primary key references public.sponsors (id) on delete cascade,
  -- As the email should read it, e.g. "Show this email at the counter by Dec. 31. One per customer."
  how_to_redeem text not null check (length(trim(how_to_redeem)) > 0),
  -- A code to give at the register, if the sponsor uses one.
  code text check (code ~ '^[A-Za-z0-9-]{3,40}$'),
  created_at timestamptz not null default now()
);

-- Redemption details belong to the thank-you sponsor only.
create function public.thank_you_offers_tier() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select tier from public.sponsors where id = new.sponsor_id) is distinct from 'thank_you' then
    raise exception 'Redemption details are for the thank-you sponsor.';
  end if;
  return new;
end;
$$;

create trigger thank_you_offers_tier
before insert or update on public.thank_you_offers
for each row execute function public.thank_you_offers_tier();

-- No API access: staff add it in the SQL editor, and posted_notice() reads it as its owner.
alter table public.thank_you_offers enable row level security;
revoke all on public.thank_you_offers from anon, authenticated;

create or replace function public.posted_notice(p_entry_id uuid) returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'hunter_name', e.hunter_name,
    'hometown', e.hometown,
    'county', e.county,
    'harvest_date', e.harvest_date,
    'weapon', e.weapon,
    'deer_type', e.deer_type,
    'points', e.points,
    'first_deer', e.first_deer,
    'age_group', e.age_group,
    'photo_id', e.photo_id,
    'share_card', e.share_card,
    'submitter_name', p.submitter_name,
    'email', p.email,
    'entries_close_at', s.entries_close_at,
    'voting_open_at', s.voting_open_at,
    'voting_close_at', s.voting_close_at,
    'winners_at', s.winners_at,
    -- Null without a thank-you sponsor; its redemption details null until staff add them.
    'thank_you', (
      select jsonb_build_object(
        'sponsor', sp.name,
        'offer', sp.prize,
        'website_url', sp.website_url,
        'how_to_redeem', o.how_to_redeem,
        'code', o.code
      )
      from public.sponsors sp
      left join public.thank_you_offers o on o.sponsor_id = sp.id
      where sp.season_id = e.season_id and sp.tier = 'thank_you'
    )
  )
  from public.entries e
  join public.entry_private p on p.entry_id = e.id
  join public.seasons s on s.id = e.season_id
  where e.id = p_entry_id and e.status = 'approved' and p.posted_notice_at is null
$$;

grant select on public.sponsors to service_role;

-- 2. Deer of the Week -------------------------------------------------------------------------

create table public.weekly_picks (
  season_id uuid not null references public.seasons (id) on delete cascade,
  -- The Friday it's announced, with the newsletter.
  week_of date not null check (extract(isodow from week_of) = 5),
  entry_id uuid not null,
  picked_by uuid references auth.users (id) on delete set null,
  picked_at timestamptz not null default now(),
  primary key (season_id, week_of),
  unique (season_id, entry_id),
  foreign key (entry_id, season_id) references public.entries (id, season_id) on delete cascade
);

alter table public.weekly_picks enable row level security;
grant select on public.weekly_picks to anon, authenticated;
create policy "Deer of the Week is public from its Friday" on public.weekly_picks for select to anon
  using (week_of <= (now() at time zone 'America/Chicago')::date);
create policy "Deer of the Week: from its Friday, or staff" on public.weekly_picks for select to authenticated
  using (public.is_staff() or week_of <= (now() at time zone 'America/Chicago')::date);

-- Picks, replaces (a deer for a week that has one) or, with a null entry, clears that week's pick.
create function public.set_weekly_pick(p_week_of date, p_entry_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_season public.seasons;
  v_entry public.entries;
begin
  if not public.is_staff() then
    raise exception 'Staff only.' using errcode = '42501';
  end if;

  select * into v_season from public.seasons where is_active;
  if not found then
    raise exception 'There is no active Brag Board season.';
  end if;

  if p_entry_id is null then
    delete from public.weekly_picks where season_id = v_season.id and week_of = p_week_of;
    return;
  end if;

  if p_week_of is null or extract(isodow from p_week_of) <> 5
    or p_week_of < (v_season.entries_open_at at time zone 'America/Chicago')::date
    or p_week_of > ((v_season.entries_close_at - interval '1 second') at time zone 'America/Chicago')::date then
    raise exception 'Deer of the Week is picked for a Friday while entries are open.';
  end if;

  select * into v_entry from public.entries where id = p_entry_id and season_id = v_season.id;
  if not found or v_entry.status <> 'approved' then
    raise exception 'Only a deer on the board can be Deer of the Week.';
  end if;

  if not coalesce((select prize_eligible from public.entry_private where entry_id = p_entry_id), true) then
    raise exception 'This entrant is on staff or in a staff household and can''t win prizes.';
  end if;

  if exists (select 1 from public.weekly_picks where entry_id = p_entry_id and week_of <> p_week_of) then
    raise exception 'That deer has already been Deer of the Week.';
  end if;

  insert into public.weekly_picks (season_id, week_of, entry_id, picked_by)
  values (v_season.id, p_week_of, p_entry_id, auth.uid())
  on conflict (season_id, week_of) do update
  set entry_id = excluded.entry_id, picked_by = excluded.picked_by, picked_at = now();
end;
$$;

-- A Deer of the Week is a prize winner, so it stays on the board too (invariant 10).
create or replace function public.moderate_entry(p_entry_id uuid, p_decision public.entry_status, p_reason text) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := nullif(trim(p_reason), '');
begin
  if not public.is_staff() then
    raise exception 'Staff only.' using errcode = '42501';
  end if;

  if p_decision is null or p_decision = 'pending' then
    raise exception 'Decision must be approved or rejected.';
  end if;

  if (p_decision = 'rejected') <> (v_reason is not null) then
    raise exception 'A reason is required when rejecting, and only when rejecting.';
  end if;

  if p_decision = 'rejected' and (
    exists (select 1 from public.award_winners where entry_id = p_entry_id)
    or exists (select 1 from public.drawing_winners where entry_id = p_entry_id)
  ) then
    raise exception 'This entry is a winner. Pick a different winner before taking it down.';
  end if;

  if p_decision = 'rejected' and exists (select 1 from public.finalists where entry_id = p_entry_id) then
    raise exception 'This deer is a Readers'' Choice finalist. Remove it from the finalists first.';
  end if;

  if p_decision = 'rejected' and exists (select 1 from public.weekly_picks where entry_id = p_entry_id) then
    raise exception 'This deer is a Deer of the Week. Pick a different deer for that week first.';
  end if;

  update public.entries set status = p_decision where id = p_entry_id;
  if not found then
    raise exception 'Entry % does not exist.', p_entry_id;
  end if;

  update public.entry_private
  set moderated_by = auth.uid(), moderated_at = now(), rejection_reason = v_reason
  where entry_id = p_entry_id;
end;
$$;

-- Privileges (invariant 3): set_weekly_pick checks is_staff() inside; the trigger stays internal.
revoke all on function public.set_weekly_pick(date, uuid), public.thank_you_offers_tier()
  from public, anon, authenticated;
grant execute on function public.set_weekly_pick(date, uuid) to authenticated;
