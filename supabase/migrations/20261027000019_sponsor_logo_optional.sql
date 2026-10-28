-- A sponsor can go on the board before its logo arrives, and a business that gives a drawing
-- prize needn't send one: without a logo the board sets the sponsor's name in type. Add the logo
-- later (upload it to sponsor-logos first):
--   update public.sponsors set logo_path = '<object name>' where qr_slug = '<slug>';
-- The existing check still refuses an empty path.

alter table public.sponsors alter column logo_path drop not null;
