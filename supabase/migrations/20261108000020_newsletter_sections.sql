-- Hunting Brag Board — Friday's newsletter section, saved for the newsletter build to pull in.
--
-- The daily newsletters are built and scheduled by the wpr-newsletter pipeline about an hour
-- before they send, so there was never a Friday campaign waiting for staff to paste the section
-- into (Nov. 6: Shereen's picks never reached a newsletter). Now the staff page saves the
-- section staff picked for a Friday, as the rows the newsletter's 600px table takes, and the
-- pipeline reads it with the board's publishable key on that Friday and adds it to both editions.
--
-- Public from its Friday, like Deer of the Week, and only while every deer in it is still on the
-- board: a deer taken down after the section was saved withholds the whole section, so a
-- newsletter never shows a deer the board no longer does.

create table public.newsletter_sections (
  season_id uuid not null references public.seasons (id) on delete cascade,
  -- The Friday the newsletters carry it.
  week_of date not null check (extract(isodow from week_of) = 5),
  -- The section's rows, as newsletter.ts renders them; under the newsletter tool's ~13 KB block limit.
  rows_html text not null check (length(rows_html) between 1 and 13000),
  -- Every deer the section shows (the Deer of the Week and the picks), for the check above.
  entry_ids uuid[] not null check (cardinality(entry_ids) between 1 and 9),
  -- The window the staff page listed deer from, so it reopens on the same list.
  posted_since date not null,
  saved_by uuid references auth.users (id) on delete set null,
  saved_at timestamptz not null default now(),
  primary key (season_id, week_of)
);

alter table public.newsletter_sections enable row level security;
grant select on public.newsletter_sections to anon, authenticated;
create policy "Newsletter section: from its Friday, while its deer are on the board" on public.newsletter_sections
  for select to anon
  using (
    week_of <= (now() at time zone 'America/Chicago')::date
    and not exists (
      select 1 from unnest(entry_ids) as shown(id)
      where not exists (select 1 from public.entries e where e.id = shown.id and e.status = 'approved')
    )
  );
create policy "Newsletter section: staff, or from its Friday while its deer are on the board" on public.newsletter_sections
  for select to authenticated
  using (
    public.is_staff() or (
      week_of <= (now() at time zone 'America/Chicago')::date
      and not exists (
        select 1 from unnest(entry_ids) as shown(id)
        where not exists (select 1 from public.entries e where e.id = shown.id and e.status = 'approved')
      )
    )
  );

-- Saves (or replaces) a Friday's section; with no rows, takes it out of that Friday's newsletters.
create function public.save_newsletter_section(p_week_of date, p_rows_html text, p_entry_ids uuid[], p_posted_since date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_season public.seasons;
begin
  if not public.is_staff() then
    raise exception 'Staff only.' using errcode = '42501';
  end if;

  select * into v_season from public.seasons where is_active;
  if not found then
    raise exception 'There is no active Brag Board season.';
  end if;

  if nullif(trim(coalesce(p_rows_html, '')), '') is null then
    delete from public.newsletter_sections where season_id = v_season.id and week_of = p_week_of;
    return;
  end if;

  if p_week_of is null or extract(isodow from p_week_of) <> 5
    or p_week_of < (v_season.entries_open_at at time zone 'America/Chicago')::date
    or p_week_of > (v_season.winners_at at time zone 'America/Chicago')::date + 7 then
    raise exception 'The Brag Board section is saved for a Friday during the season.';
  end if;

  if p_week_of < (now() at time zone 'America/Chicago')::date then
    raise exception 'That Friday''s newsletters have already gone out.';
  end if;

  if length(p_rows_html) > 13000 then
    raise exception 'The section is too long for the newsletter. Uncheck a deer or two.';
  end if;

  if coalesce(cardinality(p_entry_ids), 0) = 0 or cardinality(p_entry_ids) > 9 then
    raise exception 'Pick between one and eight deer, plus the Deer of the Week.';
  end if;

  if exists (
    select 1 from unnest(p_entry_ids) as picked(id)
    where not exists (
      select 1 from public.entries e where e.id = picked.id and e.season_id = v_season.id and e.status = 'approved'
    )
  ) then
    raise exception 'Only deer on the board can go in the newsletter.';
  end if;

  insert into public.newsletter_sections (season_id, week_of, rows_html, entry_ids, posted_since, saved_by)
  values (v_season.id, p_week_of, p_rows_html, p_entry_ids, coalesce(p_posted_since, p_week_of - 7), auth.uid())
  on conflict (season_id, week_of) do update
  set rows_html = excluded.rows_html, entry_ids = excluded.entry_ids, posted_since = excluded.posted_since,
      saved_by = excluded.saved_by, saved_at = now();
end;
$$;

-- Privileges (invariant 3): save_newsletter_section checks is_staff() inside.
revoke all on function public.save_newsletter_section(date, text, uuid[], date) from public, anon, authenticated;
grant execute on function public.save_newsletter_section(date, text, uuid[], date) to authenticated;
