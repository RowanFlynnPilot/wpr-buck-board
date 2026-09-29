# Hunting Brag Board — project guide

Sponsored reader deer-photo contest for Wausau Pilot & Review, from Shereen's 2026 sponsor sheet (sales contact: Chris Weber). Contest #3 on the WPR contest pattern (pet contest, County's Choice); written fresh, carrying over the pet contest's lessons.

**2026 calendar** (America/Chicago, stored in `seasons`): entries open Oct. 12 for deer taken since Sept. 12 · gun opener Nov. 21 · entries close end of Dec. 13 · Readers' Choice vote Dec. 14–18 · winners Dec. 21.

**Sponsors:** Presenting ($500, one, name in title, presents Readers' Choice and the grand prize) · Award ($300, six, one award each) · Prize Partner ($200, open-ended, one drawing prize each).

**Awards:** First Deer, Youth Hunter (17 and under, entered by a parent), Archery & Crossbow, Gun & Muzzleloader, Best Story (staff pick), Veteran Hunter (65+), plus Readers' Choice (public vote).

The repo is `wpr-buck-board`; reader-facing copy keeps the sponsor sheet's name, Hunting Brag Board. The repo name must match `base` in `web/vite.config.ts` (`/wpr-buck-board/`), because GitHub Pages serves the app from that path and the WordPress iframes point at it.

## Layout

```
supabase/migrations/   0001 schema · 0002 functions + views · 0003 grants + RLS · 0004 storage · 0005 prod copy repair · 0006 sponsor web-address check
supabase/seasons/      one file per season; local seed, run once in prod
supabase/tests/        pgTAP (supabase test db)
supabase/functions/    submit-entry + _shared (Deno)
web/                   React/Vite, hash routes: #/embed #/gallery #/enter #/admin
web/public/            WPR typewriter badge and wordmark: committed copies, never hot-linked
web/src/sales.ts       sales contact, UTM-tagged sponsor links, ?demo previews
web/src/analytics.ts   Plausible pageviews and events
```

The reader pages (`#/gallery`, `#/enter`) carry WPR's flag and footer, like the pet contest; the front-page strip already sits inside WPR's front page, and `#/admin` is staff-only. The presenting sponsor's name is part of the board's title ("Hunting Brag Board presented by …"), per the sponsor sheet.

**Sponsor slots.** Until entries close, an unsold slot shows a "Sponsorship available" card that emails Chris and copies the address (the WordPress iframe needs `allow="clipboard-write"`). `?demo` before the hash (`/wpr-buck-board/?demo#/gallery`) fills every unsold slot with "Your business here" for pitches; sold slots are never overridden. Sponsor links carry `rel="noopener noreferrer sponsored"` and `utm_source=wausaupilotandreview&utm_medium=widget&utm_campaign=brag-board&utm_content=<placement>`. A sponsor address the browser can't parse shows the logo unlinked rather than breaking the page; migration 0006 refuses most typos at insert. Readers' Choice credits the presenting sponsor even if the attach step below was missed, and winner cards credit their award's sponsor.

**Analytics.** Cookieless Plausible on `rowanflynnpilot.github.io`, the site WPR's other tools report to (`web/src/analytics.ts`; off in `?demo`). The hash script makes each view its own page, and with the front-page iframe's `loading="lazy"` a `#/embed` pageview means the strip was seen. Events: `Sponsor Click` {sponsor, placement}, `Sponsor Inquiry` {slot}, `Entry Submitted`, `Donate Click` {from}, `App Error` {message}. Never send anything about an entrant. Each view sits in an error boundary, so a crash shows a status line instead of an empty frame.

## Invariants — keep these true

1. **The calendar is the state machine.** `phase_at(season, ts)` is the only phase logic. The web app reads `phase` from the `current_season` view; it never computes phase itself. Nothing is toggled by hand.
2. **`qualifies(entry, kind)` is the only award rule.** Entrants never choose categories. The gallery reads `award_kinds` from `gallery_entries`.
3. **Explicit privileges only.** Migration 0003 revokes everything from `anon`/`authenticated` (and their default privileges) and grants exactly what's needed. Any new table, view, or function needs an explicit grant **and** assertions in `04_privileges.test.sql` in both directions — a missing grant must fail CI as loudly as a leak. The suite passes with and without Supabase's permissive default grants.
4. **Security definer functions** set `search_path = ''` and fully qualify every name. **Views** are `security_invoker`. `04_privileges` checks both.
5. **Public vs. private data.** `entries` holds only what can be public. Submitter name, email, and the moderation audit live in `entry_private` (staff only). No direct writes to either — RPCs only.
6. **Same-season rules are foreign keys**, via composite `(id, season_id)` keys, not function checks.
7. **Photos:** the browser decodes once (orientation baked in) and encodes a 1600px full image and a 640px thumbnail. `submit-entry` strips APP1/APP13 (Exif/XMP/IPTC — GPS) from both, stores them as `entry-photos/<photo_id>/full.jpg` and `/thumb.jpg` with a one-year cache header (ids are never reused), then calls `submit_entry()`; if anything after the upload fails, it removes both. Nothing else writes to `entry-photos`. Grids and the front-page strip use thumbnails only; the full image opens on click. Hunters' stand locations must never be public.
8. **Fail fast.** Missing env vars (including a `SUPABASE_SECRET_KEYS` without a `default` key; the function uses Supabase's new secret key, not the deprecated service_role key) stop the edge function at load and the web build at build time. Business rules raise plain-English `P0001` messages the form shows as-is; any other database error is logged and the entrant sees a generic retry message, so a raw constraint name never reaches a reader.
9. **Bots stop at the door.** `submit-entry` verifies the form's Cloudflare Turnstile token with Cloudflare before it reads or stores a photo. Tokens are single-use, so the form remounts the widget after any failed attempt.
10. **Winners stay on the board.** `moderate_entry` refuses to take down an award or drawing winner; pick a different winner first.

## Commands

```sh
supabase start && supabase test db          # 114 pgTAP tests
deno test supabase/functions/_shared        # 5 JPEG tests (real GPS-tagged fixture)
deno check supabase/functions/submit-entry/index.ts
cd web && npm run build                     # tsc + vite; needs the five VITE_ vars
```

CI (`.github/workflows/supabase.yml`): Deno tests + pgTAP on every PR (full `supabase start`, because migration 0004 writes storage columns the storage service creates); on `main`, `db push` and function deploy in a non-cancelling concurrency group. `pages.yml` builds on PRs, deploys on `main`.

## Operations (SQL editor)

Run these in the dashboard's SQL editor. The 2026 seed's en dash reached production as "â€“" through a client that read the file as Windows-1252 (migration 0005 repairs it); from a Windows `psql`, set `PGCLIENTENCODING=UTF8` first, or curly apostrophes in sponsor names garble the same way.

```sql
-- Staff: the user must exist first (Dashboard > Authentication > Add user).
insert into public.staff (user_id) select id from auth.users where email = 'editor@wausaupilotandreview.com';

-- Sponsor: upload the logo to the sponsor-logos bucket first; logo_path is the object name.
insert into public.sponsors (season_id, name, tier, logo_path, website_url, prize, qr_slug)
select id, 'Example Meats', 'award', 'example-meats.png', 'https://example.com', '$100 processing gift card', 'example-meats'
from public.seasons where year = 2026;

-- Attach an award sponsor (Readers' Choice takes the presenting sponsor; a trigger enforces tiers).
update public.awards set sponsor_id = (select id from public.sponsors where qr_slug = 'example-meats')
where kind = 'first_deer' and season_id = (select id from public.seasons where year = 2026);

-- Newsletter opt-ins for import.
select email, source, created_at from public.newsletter_optins order by created_at;

-- Readers' Choice standings.
select e.hunter_name, s.votes from public.readers_choice_standings s join public.entries e on e.id = s.entry_id order by s.votes desc;
```

Winners and the drawing go through RPCs so the rules hold: `set_award_winner(award_id, entry_id)` (after entries close; must qualify; Readers' Choice only after voting, only to a top vote-getter) and `run_prize_drawing(season_id)` (once; one prize per Prize Partner; one prize per entrant by email). Winners stay hidden from the public until `winners_at`.

## Phases

**Oct. 12 (built):** entry form with Turnstile, moderation queue, gallery with award filters and sponsor credits, phase-aware front-page embed (with a gun-opener countdown the week before Nov. 21 and an opening-day line). Before entries open, the gallery page is the awards and prizes: each award with its prize and sponsor, and the Prize Partner drawing. During the season that section sits at the foot of the gallery, which is the one place Prize Partners are credited.

Verified end to end in Chromium and WebKit (Safari's engine), browser in a WordPress-style host iframe through the real `submit-entry` function to Cloudflare's siteverify and a mocked Supabase: an EXIF-rotated phone photo comes out upright with no metadata; both images land under one photo id with the year-long cache header; a failed Turnstile check stores nothing and the form gets a fresh token; a refused entry removes both photos and shows the database's message; the host page scrolls the iframe back into view after a submission; the browser's CORS preflight passes the function's own allow-list with a publishable key. Still check once on a real iPhone before launch.

**Before Oct. 12 (not code):**
- Decide whether out-of-state deer count. The form says "taken in Wisconsin" and the county list enforces it; changing that is a schema and copy change, so decide before launch.
- Shereen's rules page live at `VITE_RULES_URL` (the form links to it and requires the checkbox).
- Custom SMTP, Turnstile widget, keys, secrets, seed, staff accounts, magic-link template: README "First deploy".
- Sponsor logos uploaded and rows inserted, with prize text written the way it should read on the page.
- WordPress: `/brag-board/` (gallery) and `/brag-board/enter/` (form) pages, then the front-page embed. Publishing the gallery page early gives Chris a live awards-and-prizes page to sell from.
- One real-iPhone entry end to end, then take it down in `#/admin`.
- County's Choice nominations open the same day; settle which gets the front page.

**First week (next):**
- Share pages. Supabase edge functions rewrite `text/html` to `text/plain` without a paid custom domain, so share pages come from a Cloudflare Worker on wausaupilotandreview.com (e.g. `/brag/<entry-id>`): read the entry from the REST API with the publishable key, return Open Graph tags, redirect people to the gallery page. Facebook shows our domain, not supabase.co.
- Share card image framed with the presenting sponsor (generate at approval time).
- Friday newsletter block (built; the entry form promises "new Brag Board entries every Friday", first due Oct. 16): `#/admin` > Friday newsletter lists deer approved since a date (default: a week ago), staff pick up to eight, and Copy HTML gives one Noptin Custom HTML block. `web/src/newsletter.ts` renders it to match the wpr-newsletter templates (600px rows, Oswald eyebrow, Merriweather/Source Sans 3, teal rule) inside the same wrapper that repo's `noptin_blocks.py` uses, under Noptin's ~13 KB per-block limit, with `utm_source=newsletter&utm_medium=email&utm_campaign=brag-board-<date>`. Sponsor logos go in only as PNG, JPEG or GIF (email clients drop SVG and WebP); otherwise the name. Next step, if wanted: have wpr-newsletter's build pull the section automatically on Fridays, like its featured-pet block.
- Counter-card QR codes: link to the WordPress Brag Board page with `?ref=<sponsors.qr_slug>` (e.g. `?ref=example-meats`). Plausible reads `ref` as the traffic source and ignores `src`; the visit lands in the WordPress site's own analytics, since the iframe never sees its parent's query string. (Plausible in the app itself is built; see Analytics above.)

**December:**
- Readers' Choice vote UI (must ship before Dec. 14: the embed's voting-phase button points to it): `signInWithOtp` → 6-digit code → `cast_vote(entry_id, newsletter_opt_in)`. New voters get the "Confirm signup" email, so that template also needs `{{ .Token }}`. Custom SMTP defaults to 30 auth emails an hour; raise it under Authentication > Rate Limits before voting opens. Test the iframe session in Safari (storage partitioning).
- Staff UI for `set_award_winner` and `run_prize_drawing`.

## Open decisions (Shereen / Rowan)

- Wisconsin harvests only? The county list enforces it today.
- Entries per hunter: unlimited now (the drawing still counts each email once).
- Can one entry win more than one award? Allowed now.
- Rejected photos stay in storage at unguessable URLs; no cleanup job.
- Supabase egress. Measured on a real deer photo: full 326 KB, thumbnail 62 KB, so the front-page strip costs about 370 KB per view that scrolls to it (it was about 2 MB before thumbnails). Multiply by monthly front-page views and compare with the project's plan: the free tier's 5 GB won't last; Pro includes 250 GB. Photos are cached for a year, so repeat readers cost nothing.
- Readers' Choice is one vote per email per season. Daily voting would be a schema change.
