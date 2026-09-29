# Hunting Brag Board — project guide

Sponsored reader deer-photo contest for Wausau Pilot & Review, from Shereen's 2026 sponsor sheet (sales contact: Chris Weber). Contest #3 on the WPR contest pattern (pet contest, County's Choice); written fresh, carrying over the pet contest's lessons.

**2026 calendar** (America/Chicago, stored in `seasons`): entries open Oct. 12 for deer taken since Sept. 12 · gun opener Nov. 21 · entries close end of Dec. 13 · Readers' Choice vote Dec. 14–18 · winners Dec. 21.

**Sponsors:** Presenting ($500, one, name in title, presents Readers' Choice and the grand prize) · Award ($300, six, one award each) · Prize Partner ($200, open-ended, one drawing prize each).

**Awards:** First Deer, Youth Hunter (17 and under, entered by a parent), Archery & Crossbow, Gun & Muzzleloader, Best Story (staff pick), Veteran Hunter (65+), plus Readers' Choice (public vote).

The repo is `wpr-buck-board`; reader-facing copy keeps the sponsor sheet's name, Hunting Brag Board. The repo name must match `base` in `web/vite.config.ts` (`/wpr-buck-board/`), because GitHub Pages serves the app from that path and the WordPress iframes point at it.

## Layout

```
supabase/migrations/   0001 schema · 0002 functions + views · 0003 grants + RLS · 0004 storage · 0005 prod copy repair · 0006 sponsor web-address check · 0007 staff edits · 0008 share cards · 0009 entry form questions · 0010 launch fixes
supabase/seasons/      one file per season; local seed, run once in prod
supabase/tests/        pgTAP (supabase test db)
supabase/functions/    submit-entry + _shared (Deno)
share/                 Cloudflare Worker: share pages at wausaupilotandreview.com/brag/<entry-id> (Deno tests)
web/                   React/Vite, hash routes: #/embed #/gallery #/enter #/admin
web/public/            WPR typewriter badge and wordmark: committed copies, never hot-linked
web/src/sales.ts       sales contact, UTM-tagged sponsor links, ?demo previews
web/src/analytics.ts   Plausible pageviews and events
web/src/share.ts       share links, and links that open one deer (?entry=)
web/src/shareCard.ts   share card images, drawn in staff browsers
```

Staff sign-ins are kept per tab (sessionStorage), not in localStorage: `rowanflynnpilot.github.io` is one origin shared by every WPR tool on GitHub Pages, and the token unlocks entrants' emails and phones. The board on its own domain is the real fix (Open decisions).

The reader pages (`#/gallery`, `#/enter`) carry WPR's flag and footer, like the pet contest; the front-page strip already sits inside WPR's front page, and `#/admin` is staff-only. The presenting sponsor's name is part of the board's title ("Hunting Brag Board presented by …"), per the sponsor sheet.

**Sponsor slots.** Until entries close, an unsold slot shows a "Sponsorship available" card that emails Chris and copies the address (the WordPress iframe needs `allow="clipboard-write"`). `?demo` before the hash (`/wpr-buck-board/?demo#/gallery`) fills every unsold slot with "Your business here" for pitches; sold slots are never overridden. On the entry form (`/wpr-buck-board/?demo#/enter`) it is also a try-it preview for staff and sponsors: the form is open whatever the date and works as it does for readers, photo handling included, but sends nothing (no bot check, no upload, no entry), and ends on the deer as a board card. Sponsor links carry `rel="noopener noreferrer sponsored"` and `utm_source=wausaupilotandreview&utm_medium=widget&utm_campaign=brag-board&utm_content=<placement>`. A sponsor address the browser can't parse shows the logo unlinked rather than breaking the page; migration 0006 refuses most typos at insert. Readers' Choice credits the presenting sponsor even if the attach step below was missed, and winner cards credit their award's sponsor.

**Analytics.** Cookieless Plausible on `rowanflynnpilot.github.io`, the site WPR's other tools report to (`web/src/analytics.ts`; off in `?demo`). The hash script makes each view its own page, and with the front-page iframe's `loading="lazy"` a `#/embed` pageview means the strip was seen. Events: `Sponsor Click` {sponsor, placement}, `Sponsor Inquiry` {slot}, `Entry Submitted`, `Donate Click` {from}, `App Error` {message}, `Entry Shared` {method: share sheet, facebook, copy link}, `Entry Opened` {from: share, front-page}. Never send anything about an entrant, including which entry. Each view sits in an error boundary, so a crash shows a status line instead of an empty frame.

**Share pages.** Every deer on the board has a Share button, and its link is `wausaupilotandreview.com/brag/<entry-id>`: the Worker in `share/`, on WPR's Cloudflare zone, because Supabase edge functions serve HTML as plain text without a paid custom domain. Link-preview crawlers (Facebook, iMessage, X, Slack, WhatsApp…) get Open Graph tags: the deer's share card, or until it has one the full photo, either with its size (without it Facebook shows no photo on a deer's first share), "Carter’s first deer on the Hunting Brag Board", and the presenting sponsor. People are redirected before any lookup to the Brag Board page at `#entry=<id>&from=share`, which keeps the click's referrer (Facebook) for WPR's analytics and costs Supabase nothing. The embed snippet hands `#entry=` to the app as `?entry=`, and the app takes it off its own address before Plausible loads, so the pageview is `#/gallery` and never names a deer; the gallery opens that deer under the title and scrolls the WordPress page to it. Front-page strip photos link the same way (`from=front-page`). The Worker reads only `gallery_entries` with the publishable key, so a deer that isn't on the board has no share page, only the redirect; if Supabase takes more than 3 seconds, the crawler gets the redirect too, rather than no preview. Phones get their own share sheet (the iframe needs `allow="web-share"`); elsewhere Share offers Facebook and Copy link.

**Entry emails.** After `submit-entry` saves an entry it sends two emails through Resend (`_shared/email.ts`, as the pet contest does), after the response so the entrant isn't kept waiting: a confirmation to the entrant in Shereen's words with what was entered (replies go to editor@), and a notice to Shereen and Chris with the thumbnail, every answer, the contact details and a link to `#/admin` (replies go to the entrant). Both are built from the entry as stored (`_shared/entry_emails.ts`), so a youth hunter appears as the parent chose. A failed send is logged and never fails the entry; staff still see it in the queue. Setup and the free plan's 100-a-day limit: README "First deploy" step 11.

**Share cards.** A 1200x630 image per posted deer (`web/src/shareCard.ts`): the photo, cropped from the middle, beside WPR's badge and rule, "Hunting Brag Board", "presented by" the presenting sponsor with its logo, and the name, hometown, deer and county set like the board's cards. Staff browsers draw it on a canvas, with the app's own fonts, when they post a deer, when they edit a posted deer's words, and on Remake all; each save is a new name, `share-cards/<entry_id>/<uuid>.jpg`, recorded by `set_share_card` in `entries.share_card`, and the card it replaces is removed. A deer posted while its card fails still goes up: the On the board tab shows "No share image yet" and a Make button, and its share link uses the photo meanwhile.

## Invariants — keep these true

1. **The calendar is the state machine.** `phase_at(season, ts)` is the only phase logic. The web app reads `phase` from the `current_season` view; it never computes phase itself. Nothing is toggled by hand.
2. **`qualifies(entry, kind)` is the only award rule.** Entrants never choose categories. The gallery reads `award_kinds` from `gallery_entries`.
3. **Explicit privileges only.** Migration 0003 revokes everything from `anon`/`authenticated` (and their default privileges) and grants exactly what's needed. Any new table, view, or function needs an explicit grant **and** assertions in `04_privileges.test.sql` in both directions — a missing grant must fail CI as loudly as a leak. The suite passes with and without Supabase's permissive default grants.
4. **Security definer functions** set `search_path = ''` and fully qualify every name. **Views** are `security_invoker`. `04_privileges` checks both.
5. **Public vs. private data.** `entries` holds only what can be public. Submitter name, email, phone, a youth entry's parent-or-guardian relationship, the hunter's name as entered, and the moderation audit live in `entry_private` (staff only); staff edits to an entry's words are logged, before and after, in `entry_edits` (staff only). No direct writes to any of them — RPCs only.
6. **Same-season rules are foreign keys**, via composite `(id, season_id)` keys, not function checks.
7. **Photos:** the browser decodes once (orientation baked in) and encodes a 1600px full image and a 640px thumbnail. `submit-entry` strips APP1/APP13 (Exif/XMP/IPTC — GPS) from both, stores them as `entry-photos/<photo_id>/full.jpg` and `/thumb.jpg` with a one-year cache header (ids are never reused), then calls `submit_entry()`; if anything after the upload fails, it removes both. Nothing else writes to `entry-photos`. Grids and the front-page strip use thumbnails only; the full image opens on click. Hunters' stand locations must never be public.
8. **Fail fast.** Missing env vars (including a `SUPABASE_SECRET_KEYS` without a `default` key; the function uses Supabase's new secret key, not the deprecated service_role key) stop the edge function at load and the web build at build time. Email is the one optional setting: without `RESEND_API_KEY`, entries save and nothing is sent, and the function logs that email is off. Business rules raise plain-English `P0001` messages the form shows as-is; any other database error is logged and the entrant sees a generic retry message, so a raw constraint name never reaches a reader.
9. **Bots stop at the door.** `submit-entry` verifies the form's Cloudflare Turnstile token with Cloudflare before it reads or stores a photo. Tokens are single-use, so the form remounts the widget after any failed attempt.
10. **Winners stay on the board.** `moderate_entry` refuses to take down an award or drawing winner; pick a different winner first.
11. **Share cards** live in their own bucket, `share-cards`, written by staff through the only `storage.objects` policies in the project (0008: insert, select and delete, for staff, in that bucket only); `set_share_card` records a card only for a posted deer, from its own folder, once it's uploaded.

## Commands

```sh
supabase start && supabase test db          # 188 pgTAP tests
deno test supabase/functions/_shared        # 14 tests: JPEG (real GPS-tagged fixture), Resend sender, entry emails
deno test share/                            # 14 share-page tests
deno check supabase/functions/submit-entry/index.ts
cd web && npm run build                     # tsc + vite; needs the six VITE_ vars
```

CI runs three jobs on every PR, whatever it touches, and `main` requires all three (branch protection; admins can still push directly), so GitHub auto-merge waits for them: `database` (`supabase.yml`: Deno tests + pgTAP, about two minutes; full `supabase start`, because migration 0004 writes storage columns the storage service creates), `web` (`pages.yml`: the production build) and `share` (`share.yml`: the Worker's tests). A renamed job must be renamed in the protection rule too, or every PR waits forever. Deploys run only from `main`, even when a workflow is run by hand, and on a push only when their own files change (so after changing a `VITE_` variable, run Pages and Share pages by hand): `db push` and function deploy in a non-cancelling concurrency group; Pages; and `share.yml` deploys the Worker with `wrangler` using the `VITE_` repository variables, once the Cloudflare secrets exist (README "First deploy" step 10; until then it warns and skips).

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

Every share card names the presenting sponsor, so after the presenting sponsor is added or changes (or its logo), open `#/admin` > On the board > **Remake all share images**. A few seconds per deer; links already shared keep their old preview on Facebook until re-scraped (below).

A deer taken down after it was shared: its share page stops at once, but Facebook shows the preview it already scraped until someone pastes the link into the Sharing Debugger (developers.facebook.com/tools/debug) and clicks Scrape Again.

Staff fix a typo with **Edit…** in the `#/admin` queue (`edit_entry(entry_id, hunter_name, hometown, story)`): only those three fields change, so award qualification and any winner already picked are untouched. For a hunter 17 and under, the parent chooses on the form whether the board uses the first and last name or the first name only; `submit_entry` publishes accordingly, and the queue shows the full name as entered.

Winners and the drawing go through RPCs so the rules hold: `set_award_winner(award_id, entry_id)` (after entries close; must qualify; Readers' Choice only after voting, only to a top vote-getter) and `run_prize_drawing(season_id)` (once; one prize per Prize Partner; one prize per entrant by email; refused while any entry is still waiting for review, since only posted deer get a ticket). Winners stay hidden from the public until `winners_at`.

## Phases

**Oct. 12 (built):** entry form with Turnstile (its questions, order and wording follow Shereen's 2026 entry form plan of Sept. 29, except that entrants don't pick awards, `qualifies()` does; one photo where the plan allowed three; and entries go to the staff queue, not a Google Sheet), moderation queue, gallery with award filters and sponsor credits, phase-aware front-page embed (with a gun-opener countdown the week before Nov. 21 and an opening-day line). Before entries open, the gallery page is the awards and prizes: each award with its prize and sponsor, and the Prize Partner drawing. During the season that section sits at the foot of the gallery, which is the one place Prize Partners are credited.

Verified end to end in Chromium and WebKit (Safari's engine), browser in a WordPress-style host iframe through the real `submit-entry` function to Cloudflare's siteverify and a mocked Supabase: an EXIF-rotated phone photo comes out upright with no metadata; both images land under one photo id with the year-long cache header; a failed Turnstile check stores nothing and the form gets a fresh token; a refused entry removes both photos and shows the database's message; the host page scrolls the iframe back into view after a submission; the browser's CORS preflight passes the function's own allow-list with a publishable key. Still check once on a real iPhone before launch.

**Before Oct. 12 (not code):**
- Custom SMTP, Turnstile widget, keys, secrets, seed, staff accounts, magic-link template: README "First deploy".
- Sponsor logos uploaded and rows inserted, with prize text written the way it should read on the page.
- WordPress: the README snippet as is (`allow="clipboard-write; web-share"` and `route()` included) on Shereen's Brag Board page (https://wausaupilotandreview.com/wausau-pilot-hunting-brag-board/, `#/gallery`; one frame that is the board and, at `#enter`, the form), then on the front page (`#/embed`). The page is already live outside the menu, so publishing the board there early gives Chris a live awards-and-prizes page to sell from.
- Entry emails on: a Resend key and verified domain (README "First deploy" step 11), then one real entry to see both emails arrive.
- Share pages deployed: a Cloudflare token and account ID as GitHub secrets, then the Share pages workflow (README "First deploy" step 10). Share buttons appear with the first posted deer.
- One real-iPhone entry end to end, then take it down in `#/admin`.
- County's Choice nominations open the same day; settle which gets the front page.

**First week (next):**
- Share pages (built; see Share pages above).
- Share card image framed with the presenting sponsor (built; see Share cards above).
- Friday newsletter block (built; the entry form promises "new Brag Board entries every Friday", first due Oct. 16): `#/admin` > Friday newsletter lists deer approved since a date (default: a week ago), staff pick up to eight, and Copy HTML gives one Noptin Custom HTML block. `web/src/newsletter.ts` renders it to match the wpr-newsletter templates (600px rows, Oswald eyebrow, Merriweather/Source Sans 3, teal rule) inside the same wrapper that repo's `noptin_blocks.py` uses, under Noptin's ~13 KB per-block limit, with `utm_source=newsletter&utm_medium=email&utm_campaign=brag-board-<date>`. Sponsor logos go in only as PNG, JPEG or GIF (email clients drop SVG and WebP); otherwise the name. Next step, if wanted: have wpr-newsletter's build pull the section automatically on Fridays, like its featured-pet block.
- Counter-card QR codes: link to the WordPress Brag Board page with `?ref=<sponsors.qr_slug>` (e.g. `?ref=example-meats`). Plausible reads `ref` as the traffic source and ignores `src`; the visit lands in the WordPress site's own analytics, since the iframe never sees its parent's query string. (Plausible in the app itself is built; see Analytics above.)

**December:**
- Readers' Choice vote UI (must ship before Dec. 14: the embed's voting-phase button points to it): `signInWithOtp` → 6-digit code → `cast_vote(entry_id, newsletter_opt_in)`. New voters get the "Confirm signup" email, so that template also needs `{{ .Token }}`. Custom SMTP defaults to 30 auth emails an hour; raise it under Authentication > Rate Limits before voting opens. Test the iframe session in Safari (storage partitioning).
- Staff UI for `set_award_winner` and `run_prize_drawing`.

## Open decisions (Shereen / Rowan)

- Entries per hunter: unlimited now (the drawing still counts each email once).
- Can one entry win more than one award? Allowed now.
- Rejected photos stay in storage at unguessable URLs; no cleanup job.
- Supabase egress. Measured on a real deer photo: full 326 KB, thumbnail 62 KB, so the front-page strip costs about 370 KB per view that scrolls to it (it was about 2 MB before thumbnails). Multiply by monthly front-page views and compare with the project's plan: the free tier's 5 GB won't last; Pro includes 250 GB. Photos are cached for a year, so repeat readers cost nothing.
- Readers' Choice is one vote per email per season. Daily voting would be a schema change.
- A custom domain for the board (e.g. a subdomain of wausaupilotandreview.com as the GitHub Pages domain): it gives the staff sign-in an origin of its own, where today every WPR tool on rowanflynnpilot.github.io shares one. Moving means updating the Turnstile hostname, the entry function's `ALLOWED_ORIGIN`, the snippet's origin check and Plausible's site.
