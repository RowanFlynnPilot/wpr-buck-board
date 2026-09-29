-- Hunting Brag Board — one-time repair of award copy.
--
-- The 2026 season seed reached production through a client that read the file as
-- Windows-1252, so the en dash in "Dec. 14–18" was stored as "â€“". The characters are
-- built with chr() so this file's own encoding can't repeat the mistake. Where the copy
-- is already correct (every local stack, or production after a manual fix) it changes nothing.

update public.awards
set description = replace(description, chr(226) || chr(8364) || chr(8220), chr(8211))
where strpos(description, chr(226) || chr(8364) || chr(8220)) > 0;
