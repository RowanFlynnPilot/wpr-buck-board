-- Hunting Brag Board — Readers' Choice (Dec. 14–18) and the end of the season, matching the
-- published rules.
--
-- 1. Finalists: staff pick up to 10 posted deer; readers vote only among them. Picked before
--    voting opens (or during it, until the first vote lands); a finalist may be withdrawn at any
--    time, and its votes then stop counting. Finalists are public from the vote on.
-- 2. One vote per person: a vote is keyed by the voter's email with Gmail's dots and any +tag
--    removed, so one inbox can't vote twice; throwaway email domains are refused.
-- 3. Staff and their households can share a deer but can't win prizes: entry_private.prize_eligible,
--    set by staff, which set_award_winner and the drawing respect.
-- 4. A winner who doesn't claim a prize forfeits it: redraw_prize() records the forfeit and draws
--    again among the entrants left.

-- 1. Finalists -----------------------------------------------------------------------

create table public.finalists (
  season_id uuid not null references public.seasons (id) on delete cascade,
  entry_id uuid not null,
  picked_by uuid references auth.users (id) on delete set null,
  picked_at timestamptz not null default now(),
  primary key (season_id, entry_id),
  foreign key (entry_id, season_id) references public.entries (id, season_id) on delete cascade
);

alter table public.finalists enable row level security;
grant select on public.finalists to anon, authenticated;
create policy "Finalists are public once voting opens" on public.finalists for select to anon
  using (exists (
    select 1 from public.seasons s
    where s.id = finalists.season_id and public.phase_at(s, now()) in ('voting', 'tallying', 'winners')
  ));
create policy "Finalists: once voting opens, or staff" on public.finalists for select to authenticated
  using (public.is_staff() or exists (
    select 1 from public.seasons s
    where s.id = finalists.season_id and public.phase_at(s, now()) in ('voting', 'tallying', 'winners')
  ));

create function public.set_finalist(p_entry_id uuid, p_finalist boolean) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.entries;
  v_season public.seasons;
  v_count integer;
begin
  if not public.is_staff() then
    raise exception 'Staff only.' using errcode = '42501';
  end if;

  select * into v_entry from public.entries where id = p_entry_id;
  if not found then
    raise exception 'Entry % does not exist.', p_entry_id;
  end if;
  select * into v_season from public.seasons where id = v_entry.season_id;

  if not p_finalist then
    delete from public.finalists where entry_id = p_entry_id;
    return;
  end if;

  if v_entry.status <> 'approved' then
    raise exception 'Only a deer on the board can be a finalist.';
  end if;

  -- Readers vote among a set list: once a vote is in, the list only shrinks.
  if public.phase_at(v_season, now()) not in ('entries', 'judging', 'voting')
    or exists (select 1 from public.votes where season_id = v_season.id) then
    raise exception 'Finalists are set before voting opens.';
  end if;

  select count(*) into v_count from public.finalists where season_id = v_season.id and entry_id <> p_entry_id;
  if v_count >= 10 then
    raise exception 'Readers'' Choice has up to 10 finalists. Remove one to add another.';
  end if;

  insert into public.finalists (season_id, entry_id, picked_by)
  values (v_season.id, p_entry_id, auth.uid())
  on conflict do nothing;
end;
$$;

-- 2. One vote per person ---------------------------------------------------------------

-- The address that counts: lowercased, any +tag dropped, and for Gmail the dots too, since
-- Gmail delivers john.doe and johndoe (and googlemail.com) to the same inbox.
create function public.vote_email_key(p_email text) returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when split_part(lower(trim(p_email)), '@', 2) in ('gmail.com', 'googlemail.com')
      then replace(split_part(split_part(lower(trim(p_email)), '@', 1), '+', 1), '.', '') || '@gmail.com'
    else split_part(split_part(lower(trim(p_email)), '@', 1), '+', 1) || '@' || split_part(lower(trim(p_email)), '@', 2)
  end
$$;

alter table public.votes add column email_key text;
update public.votes v set email_key = public.vote_email_key(u.email) from auth.users u where u.id = v.voter_id;
alter table public.votes alter column email_key set not null;
create unique index votes_one_per_email on public.votes (season_id, email_key);

-- Throwaway inboxes. Readable by the ballot, so it can say so before a code is sent; staff add
-- to it in the SQL editor.
create table public.blocked_email_domains (
  domain text primary key check (domain = lower(domain) and domain like '%.%')
);
alter table public.blocked_email_domains enable row level security;
grant select on public.blocked_email_domains to anon, authenticated;
create policy "Anyone can read the blocked domains" on public.blocked_email_domains for select to anon, authenticated
  using (true);
insert into public.blocked_email_domains (domain) values
  ('mailinator.com'), ('guerrillamail.com'), ('guerrillamailblock.com'), ('sharklasers.com'), ('10minutemail.com'),
  ('10minutemail.net'), ('tempmail.com'), ('temp-mail.org'), ('tempr.email'), ('yopmail.com'), ('trashmail.com'),
  ('getnada.com'), ('dispostable.com'), ('maildrop.cc'), ('throwawaymail.com'), ('fakeinbox.com'), ('mohmal.com'),
  ('emailondeck.com'), ('mintemail.com'), ('spam4.me'), ('mailnesia.com'), ('tempmailo.com'), ('burnermail.io'),
  ('mailsac.com'), ('inboxkitten.com');

create or replace function public.cast_vote(p_entry_id uuid, p_newsletter_opt_in boolean) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_season public.seasons;
  v_email text := lower(auth.jwt() ->> 'email');
begin
  if auth.uid() is null or v_email is null or v_email = '' then
    raise exception 'Sign in with your email to vote.' using errcode = '42501';
  end if;

  if exists (select 1 from public.blocked_email_domains where domain = split_part(v_email, '@', 2)) then
    raise exception 'Vote with a personal or work email address, not a temporary one.';
  end if;

  select * into v_season from public.seasons where is_active;
  if not found then
    raise exception 'There is no active Brag Board season.';
  end if;

  if public.phase_at(v_season, now()) <> 'voting' then
    raise exception 'Readers'' Choice voting is not open.';
  end if;

  if not exists (
    select 1 from public.finalists f
    join public.entries e on e.id = f.entry_id
    where f.entry_id = p_entry_id and f.season_id = v_season.id and e.status = 'approved'
  ) then
    raise exception 'That entry is not in the running.';
  end if;

  begin
    insert into public.votes (season_id, voter_id, entry_id, email_key)
    values (v_season.id, auth.uid(), p_entry_id, public.vote_email_key(v_email));
  exception when unique_violation then
    raise exception 'You have already voted for Readers'' Choice this season.';
  end;

  if p_newsletter_opt_in then
    insert into public.newsletter_optins (email, source) values (v_email, 'vote')
    on conflict (email) do nothing;
  end if;
end;
$$;

-- Only finalists' votes count, so a withdrawn finalist drops out of the standings.
create or replace view public.readers_choice_standings with (security_invoker = true) as
select v.season_id, v.entry_id, count(*) as votes
from public.votes v
join public.finalists f on f.season_id = v.season_id and f.entry_id = v.entry_id
join public.entries e on e.id = v.entry_id
where e.status = 'approved'
group by v.season_id, v.entry_id;

-- 3. Prize eligibility ---------------------------------------------------------------------

alter table public.entry_private add column prize_eligible boolean not null default true;

create function public.set_prize_eligible(p_entry_id uuid, p_eligible boolean) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_staff() then
    raise exception 'Staff only.' using errcode = '42501';
  end if;
  update public.entry_private set prize_eligible = p_eligible where entry_id = p_entry_id;
  if not found then
    raise exception 'Entry % does not exist.', p_entry_id;
  end if;
end;
$$;

create or replace function public.set_award_winner(p_award_id uuid, p_entry_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_award public.awards;
  v_season public.seasons;
  v_entry public.entries;
  v_phase public.season_phase;
  v_votes bigint;
  v_top bigint;
begin
  if not public.is_staff() then
    raise exception 'Staff only.' using errcode = '42501';
  end if;

  select * into v_award from public.awards where id = p_award_id;
  if not found then
    raise exception 'Award % does not exist.', p_award_id;
  end if;

  select * into v_season from public.seasons where id = v_award.season_id;
  v_phase := public.phase_at(v_season, now());
  if v_phase in ('upcoming', 'entries') then
    raise exception 'Winners are picked after entries close.';
  end if;

  select * into v_entry from public.entries
  where id = p_entry_id and season_id = v_award.season_id and status = 'approved';
  if not found then
    raise exception 'Entry % is not an approved entry in this season.', p_entry_id;
  end if;

  if not public.qualifies(v_entry, v_award.kind) then
    raise exception 'That entry does not qualify for %.', v_award.label;
  end if;

  if not exists (select 1 from public.entry_private where entry_id = p_entry_id and prize_eligible) then
    raise exception 'This entrant is on staff or in a staff household and can''t win prizes.';
  end if;

  if v_award.kind = 'readers_choice' then
    if v_phase not in ('tallying', 'winners') then
      raise exception 'Readers'' Choice is settled after voting closes.';
    end if;

    if not exists (select 1 from public.finalists where entry_id = p_entry_id) then
      raise exception 'Readers'' Choice goes to a finalist.';
    end if;

    select coalesce(max(votes), 0) into v_top
    from public.readers_choice_standings where season_id = v_season.id;
    select coalesce(sum(votes), 0) into v_votes
    from public.readers_choice_standings where entry_id = p_entry_id;

    if v_votes = 0 or v_votes < v_top then
      raise exception 'Readers'' Choice goes to the top vote-getter (% votes); this entry has %.', v_top, v_votes;
    end if;
  end if;

  insert into public.award_winners (award_id, season_id, entry_id, decided_by)
  values (v_award.id, v_season.id, p_entry_id, auth.uid())
  on conflict (award_id) do update
  set entry_id = excluded.entry_id, decided_by = excluded.decided_by, decided_at = now();
end;
$$;

-- The drawing: as in 0010, now skipping entrants who can't win prizes.
create or replace function public.run_prize_drawing(p_season_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_season public.seasons;
  v_prizes integer;
  v_entrants integer;
  v_waiting integer;
begin
  if not public.is_staff() then
    raise exception 'Staff only.' using errcode = '42501';
  end if;

  select * into v_season from public.seasons where id = p_season_id;
  if not found then
    raise exception 'Season % does not exist.', p_season_id;
  end if;

  if public.phase_at(v_season, now()) in ('upcoming', 'entries') then
    raise exception 'The drawing runs after entries close.';
  end if;

  if exists (select 1 from public.drawing_winners where season_id = p_season_id) then
    raise exception 'The % drawing has already run.', v_season.year;
  end if;

  select count(*) into v_waiting from public.entries where season_id = p_season_id and status = 'pending';
  if v_waiting > 0 then
    raise exception '% still waiting for review. Post or decline % before the drawing.',
      case when v_waiting = 1 then '1 entry is' else v_waiting || ' entries are' end,
      case when v_waiting = 1 then 'it' else 'them' end;
  end if;

  select count(*) into v_prizes
  from public.sponsors where season_id = p_season_id and tier = 'prize_partner';
  if v_prizes = 0 then
    raise exception 'There are no Prize Partner prizes to draw.';
  end if;

  select count(distinct p.email) into v_entrants
  from public.entries e
  join public.entry_private p on p.entry_id = e.id
  where e.season_id = p_season_id and e.status = 'approved' and p.prize_eligible;
  if v_entrants < v_prizes then
    raise exception 'Only % entrants for % prizes.', v_entrants, v_prizes;
  end if;

  with entrants as (
    select distinct on (p.email) e.id as entry_id
    from public.entries e
    join public.entry_private p on p.entry_id = e.id
    where e.season_id = p_season_id and e.status = 'approved' and p.prize_eligible
    order by p.email, e.created_at
  ),
  shuffled as (
    select entry_id, row_number() over (order by random()) as n from entrants
  ),
  prizes as (
    select id, row_number() over (order by name, id) as n
    from public.sponsors
    where season_id = p_season_id and tier = 'prize_partner'
  )
  insert into public.drawing_winners (sponsor_id, season_id, entry_id, drawn_by)
  select prizes.id, p_season_id, shuffled.entry_id, auth.uid()
  from prizes
  join shuffled using (n);
end;
$$;

-- 4. Forfeits and redraws ---------------------------------------------------------------------

create table public.prize_forfeits (
  sponsor_id uuid not null,
  season_id uuid not null,
  entry_id uuid not null,
  forfeited_by uuid references auth.users (id) on delete set null,
  forfeited_at timestamptz not null default now(),
  primary key (sponsor_id, entry_id),
  foreign key (sponsor_id, season_id) references public.sponsors (id, season_id) on delete restrict,
  foreign key (entry_id, season_id) references public.entries (id, season_id) on delete restrict
);
alter table public.prize_forfeits enable row level security;
grant select on public.prize_forfeits to authenticated;
create policy "Staff read forfeits" on public.prize_forfeits for select to authenticated
  using (public.is_staff());

-- A prize's winner didn't claim it (the rules give them 14 days): record the forfeit and draw
-- again among the entrants who hold no prize and have forfeited none, one ticket per email.
create function public.redraw_prize(p_sponsor_id uuid) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current public.drawing_winners;
  v_next uuid;
begin
  if not public.is_staff() then
    raise exception 'Staff only.' using errcode = '42501';
  end if;

  select * into v_current from public.drawing_winners where sponsor_id = p_sponsor_id;
  if not found then
    raise exception 'That prize has not been drawn yet.';
  end if;

  insert into public.prize_forfeits (sponsor_id, season_id, entry_id, forfeited_by)
  values (v_current.sponsor_id, v_current.season_id, v_current.entry_id, auth.uid());

  with taken as (
    select p.email from public.drawing_winners d join public.entry_private p on p.entry_id = d.entry_id
    where d.season_id = v_current.season_id
    union
    select p.email from public.prize_forfeits f join public.entry_private p on p.entry_id = f.entry_id
    where f.season_id = v_current.season_id
  ),
  entrants as (
    select distinct on (p.email) e.id as entry_id
    from public.entries e
    join public.entry_private p on p.entry_id = e.id
    where e.season_id = v_current.season_id and e.status = 'approved' and p.prize_eligible
      and p.email not in (select email from taken)
    order by p.email, e.created_at
  )
  select entry_id into v_next from entrants order by random() limit 1;

  if v_next is null then
    raise exception 'No entrants are left to draw for this prize.';
  end if;

  update public.drawing_winners
  set entry_id = v_next, drawn_by = auth.uid(), drawn_at = now()
  where sponsor_id = p_sponsor_id;
  return v_next;
end;
$$;

-- 5. A finalist stays on the ballot until staff remove it ---------------------------------------

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

  update public.entries set status = p_decision where id = p_entry_id;
  if not found then
    raise exception 'Entry % does not exist.', p_entry_id;
  end if;

  update public.entry_private
  set moderated_by = auth.uid(), moderated_at = now(), rejection_reason = v_reason
  where entry_id = p_entry_id;
end;
$$;

-- Privileges (invariant 3): the staff RPCs check is_staff() inside; vote_email_key stays internal.
revoke all on function public.set_finalist(uuid, boolean), public.set_prize_eligible(uuid, boolean),
  public.redraw_prize(uuid), public.vote_email_key(text) from public, anon, authenticated;
grant execute on function public.set_finalist(uuid, boolean), public.set_prize_eligible(uuid, boolean),
  public.redraw_prize(uuid) to authenticated;
