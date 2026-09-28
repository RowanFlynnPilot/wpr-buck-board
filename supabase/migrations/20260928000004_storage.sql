-- Hunting Brag Board — storage.
--
-- Both buckets are public-read by URL. There are no storage.objects policies, so
-- anon and authenticated users can neither upload nor list: entry photos are written
-- only by the submit-entry edge function (service role), and sponsor logos are
-- uploaded by staff in the dashboard. Entry photos sit under random UUID folders, so pending
-- and rejected photos are not discoverable.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('entry-photos', 'entry-photos', true, 3145728, array['image/jpeg']),
  ('sponsor-logos', 'sponsor-logos', true, 1048576, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);
