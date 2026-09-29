-- Hunting Brag Board — staff edits to an entry's words.
--
-- Moderators could only post or reject, so a typo, or a youth hunter entered by full name
-- (the form asks for a first name only), meant rejecting a kid's first deer over a last name.
-- edit_entry lets staff fix the name on the board, the hometown and the story. Everything that
-- decides awards (weapon, deer, points, age group, first deer, county, date) stays as the
-- entrant gave it, so qualifies() and any winner already picked are untouched. Each edit keeps
-- the before and after text in entry_edits, staff-only, beside the moderation audit.

create table public.entry_edits (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.entries (id) on delete cascade,
  edited_by uuid references auth.users (id) on delete set null,
  edited_at timestamptz not null default now(),
  before jsonb not null,
  after jsonb not null
);

create index entry_edits_entry on public.entry_edits (entry_id, edited_at desc);

alter table public.entry_edits enable row level security;

revoke all on public.entry_edits from anon, authenticated;
grant select on public.entry_edits to authenticated;
create policy "Staff read entry edits" on public.entry_edits for select to authenticated
  using (public.is_staff());

create function public.edit_entry(p_entry_id uuid, p_hunter_name text, p_hometown text, p_story text) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := trim(p_hunter_name);
  v_hometown text := trim(p_hometown);
  v_story text := nullif(trim(p_story), '');
  v_before jsonb;
  v_after jsonb;
begin
  if not public.is_staff() then
    raise exception 'Staff only.' using errcode = '42501';
  end if;

  if v_name is null or length(v_name) not between 1 and 60 then
    raise exception 'The name on the board must be 1 to 60 characters.';
  end if;
  if v_hometown is null or length(v_hometown) not between 1 and 60 then
    raise exception 'The hometown must be 1 to 60 characters.';
  end if;
  if length(v_story) > 1200 then
    raise exception 'The story can be at most 1,200 characters.';
  end if;

  select jsonb_build_object('hunter_name', e.hunter_name, 'hometown', e.hometown, 'story', e.story)
  into v_before
  from public.entries e
  where e.id = p_entry_id
  for update;
  if not found then
    raise exception 'Entry % does not exist.', p_entry_id;
  end if;

  v_after := jsonb_build_object('hunter_name', v_name, 'hometown', v_hometown, 'story', v_story);
  -- Saving without a change records nothing.
  if v_after = v_before then
    return;
  end if;

  update public.entries
  set hunter_name = v_name, hometown = v_hometown, story = v_story
  where id = p_entry_id;

  insert into public.entry_edits (entry_id, edited_by, before, after)
  values (p_entry_id, (select auth.uid()), v_before, v_after);
end;
$$;

revoke all on function public.edit_entry(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.edit_entry(uuid, text, text, text) to authenticated;
