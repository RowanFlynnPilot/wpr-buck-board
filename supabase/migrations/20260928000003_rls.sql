-- Hunting Brag Board — privileges and row-level security.
--
-- Start from zero and grant exactly what each role needs. Supabase's default
-- privileges differ between projects and CLI versions, so nothing here relies on them,
-- and default privileges for future objects are revoked so later migrations must grant
-- explicitly too.

revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from public, anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;

alter table public.wi_counties enable row level security;
alter table public.seasons enable row level security;
alter table public.staff enable row level security;
alter table public.sponsors enable row level security;
alter table public.awards enable row level security;
alter table public.entries enable row level security;
alter table public.entry_private enable row level security;
alter table public.votes enable row level security;
alter table public.newsletter_optins enable row level security;
alter table public.award_winners enable row level security;
alter table public.drawing_winners enable row level security;

-- Catalog data: public.
grant select on public.wi_counties, public.seasons, public.sponsors, public.awards to anon, authenticated;
create policy "Counties are public" on public.wi_counties for select to anon, authenticated using (true);
create policy "Seasons are public" on public.seasons for select to anon, authenticated using (true);
create policy "Sponsors are public" on public.sponsors for select to anon, authenticated using (true);
create policy "Awards are public" on public.awards for select to anon, authenticated using (true);

-- Entries: approved rows are public; staff see everything. No direct writes — RPCs only.
grant select on public.entries to anon, authenticated;
create policy "Approved entries are public" on public.entries for select to anon
  using (status = 'approved');
create policy "Staff see every entry" on public.entries for select to authenticated
  using (status = 'approved' or public.is_staff());

grant select on public.entry_private to authenticated;
create policy "Staff read entrant details" on public.entry_private for select to authenticated
  using (public.is_staff());

grant select on public.votes to authenticated;
create policy "Voters see their own vote; staff see all" on public.votes for select to authenticated
  using (voter_id = (select auth.uid()) or public.is_staff());

grant select on public.newsletter_optins to authenticated;
create policy "Staff read newsletter opt-ins" on public.newsletter_optins for select to authenticated
  using (public.is_staff());

-- Winners stay hidden until the season's winners date, except to staff.
grant select on public.award_winners, public.drawing_winners to anon, authenticated;
create policy "Award winners are public once announced" on public.award_winners for select to anon
  using (exists (
    select 1 from public.seasons s where s.id = award_winners.season_id and public.phase_at(s, now()) = 'winners'
  ));
create policy "Award winners: announced, or staff" on public.award_winners for select to authenticated
  using (public.is_staff() or exists (
    select 1 from public.seasons s where s.id = award_winners.season_id and public.phase_at(s, now()) = 'winners'
  ));
create policy "Drawing winners are public once announced" on public.drawing_winners for select to anon
  using (exists (
    select 1 from public.seasons s where s.id = drawing_winners.season_id and public.phase_at(s, now()) = 'winners'
  ));
create policy "Drawing winners: announced, or staff" on public.drawing_winners for select to authenticated
  using (public.is_staff() or exists (
    select 1 from public.seasons s where s.id = drawing_winners.season_id and public.phase_at(s, now()) = 'winners'
  ));

-- `staff` has RLS on and no grants: membership is managed in the SQL editor.

-- Views run as the caller (security_invoker), so the table policies above apply.
grant select on public.current_season, public.gallery_entries to anon, authenticated;
grant select on public.readers_choice_standings to authenticated;

-- Pure helpers used by views and policies.
grant execute on function public.phase_at(public.seasons, timestamptz) to anon, authenticated;
grant execute on function public.qualifies(public.entries, public.award_kind) to anon, authenticated;
grant execute on function public.award_kinds(public.entries) to anon, authenticated;
grant execute on function public.is_staff() to authenticated;

-- RPCs.
grant execute on function public.submit_entry(
  text, text, text, date, public.weapon, public.deer_type, smallint, boolean,
  public.age_group, boolean, text, uuid, text, text, boolean
) to service_role;
grant execute on function public.moderate_entry(uuid, public.entry_status, text) to authenticated;
grant execute on function public.cast_vote(uuid, boolean) to authenticated;
grant execute on function public.set_award_winner(uuid, uuid) to authenticated;
grant execute on function public.run_prize_drawing(uuid) to authenticated;
