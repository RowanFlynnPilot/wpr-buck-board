-- Hunting Brag Board — share card images.
--
-- A shared deer previews on Facebook with a 1200x630 card: the photo, framed with the board's
-- title and the presenting sponsor, and the hunter's name and deer. Staff browsers draw it
-- (web/src/shareCard.ts) when they post a deer, when they edit a posted deer's words, and on
-- "Remake all" after the presenting sponsor changes. The card is public: it shows only what the
-- board shows.
--
-- Cards live in their own bucket, share-cards/<entry_id>/<random uuid>.jpg, a new name each
-- time, so Facebook and the storage CDN never serve an old card under a current name. entries
-- .share_card names the current one; the share page (share/) reads it from gallery_entries and
-- falls back to the photo when it's empty. entry-photos is untouched: submit-entry is still
-- the only writer there.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('share-cards', 'share-cards', true, 1048576, array['image/jpeg']);

-- The first storage.objects policies in this project, and only for this bucket: staff upload a
-- card, see the bucket's objects (the storage API reads before it deletes) and remove old
-- cards. Everyone else reads cards by public URL only, as with the other buckets.
create policy "Staff upload share cards" on storage.objects for insert to authenticated
  with check (bucket_id = 'share-cards' and public.is_staff());
create policy "Staff see share cards" on storage.objects for select to authenticated
  using (bucket_id = 'share-cards' and public.is_staff());
create policy "Staff remove share cards" on storage.objects for delete to authenticated
  using (bucket_id = 'share-cards' and public.is_staff());

alter table public.entries add column share_card text
  constraint share_card_is_a_card_name check (share_card ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$');

create or replace view public.gallery_entries with (security_invoker = true) as
select
  e.id, e.season_id, e.hunter_name, e.hometown, e.county, e.harvest_date, e.weapon, e.deer_type,
  e.points, e.first_deer, e.age_group, e.story, e.photo_id, e.created_at,
  public.award_kinds(e) as award_kinds,
  e.share_card
from public.entries e
where e.status = 'approved';

-- Record an uploaded card as the entry's current one. Returns the card it replaces, if any, so
-- the browser can remove it.
create function public.set_share_card(p_entry_id uuid, p_card text) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous text;
begin
  if not public.is_staff() then
    raise exception 'Staff only.' using errcode = '42501';
  end if;

  if p_card is null or split_part(p_card, '/', 1) <> p_entry_id::text
    or p_card !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$' then
    raise exception 'A share image goes in its own deer''s folder.';
  end if;

  if not exists (select 1 from storage.objects where bucket_id = 'share-cards' and name = p_card) then
    raise exception 'That share image hasn''t been uploaded.';
  end if;

  select share_card into v_previous from public.entries
  where id = p_entry_id and status = 'approved'
  for update;
  if not found then
    raise exception 'Only a deer on the board gets a share image.';
  end if;

  update public.entries set share_card = p_card where id = p_entry_id;
  return v_previous;
end;
$$;

revoke all on function public.set_share_card(uuid, text) from public, anon, authenticated;
grant execute on function public.set_share_card(uuid, text) to authenticated;
