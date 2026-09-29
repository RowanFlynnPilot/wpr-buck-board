-- Hunting Brag Board — sponsor links must be real web addresses.
--
-- The page tags every sponsor link for the sponsor's own analytics, which needs an address a
-- browser can parse. The original check looked only at the https:// prefix, so "https://" on
-- its own, or a host with a space in it, got through. Sponsors are added by hand in the SQL
-- editor; this makes a typo fail there, instead of on the page. (The page also shows the logo
-- unlinked if an address still won't parse.)

alter table public.sponsors drop constraint sponsors_website_url_check;

alter table public.sponsors add constraint sponsor_website_is_a_web_address check (
  website_url ~ '^https://[^\s/?#@]+\.[^\s/?#@]+([/?#]\S*)?$'
);
