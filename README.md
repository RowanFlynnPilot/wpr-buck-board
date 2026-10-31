# Hunting Brag Board

Wausau Pilot & Review's sponsored reader deer-photo contest. Readers enter a photo and a few details; staff moderate; the gallery sorts every deer into the awards it qualifies for; readers vote for Readers' Choice in December.

- `supabase/`: Postgres schema, RLS, RPCs, the `submit-entry` and `entry-posted` edge functions, and pgTAP tests
- `web/`: React/Vite app on GitHub Pages, embedded in WordPress by iframe
- `share/`: Cloudflare Worker for share pages (`wausaupilotandreview.com/brag/<entry-id>`), so a shared deer previews with its photo

Project rules, invariants, and operations SQL are in [CLAUDE.md](CLAUDE.md).

## Local development

```sh
supabase start                       # migrations + the 2026 season seed
supabase test db                     # pgTAP suite
deno test supabase/functions/_shared # photo metadata and entry email tests
deno test share/                     # share-page tests

cp supabase/functions/.env.example supabase/functions/.env   # Cloudflare's always-pass Turnstile test secret
supabase functions serve --env-file supabase/functions/.env

cd web
cp .env.example .env.local           # paste the publishable key from `supabase status`
npm install
npm run dev                          # http://localhost:5173/wpr-buck-board/#/enter
```

Views: `#/embed` (front page), `#/gallery`, `#/enter`, `#/admin` (staff, opened directly). `?entry=<id>#/gallery` opens one deer.

Entry emails are off locally unless `supabase/functions/.env` sets `RESEND_API_KEY`; set `RESEND_API_URL` too, to a stand-in that records requests, to see both emails without sending them (the example file shows how).

The share Worker runs locally with `npx wrangler dev` in `share/`, given the three settings it reads: `--var SUPABASE_URL:http://127.0.0.1:54321 --var SUPABASE_PUBLISHABLE_KEY:<key> --var GALLERY_PAGE_URL:<a page embedding #/gallery>`. Send a crawler's user agent (`curl -A facebookexternalhit …/brag/<id>`) to see its Open Graph page; anything else gets the redirect.

## First deploy

1. Create the Supabase project. Set `[db].major_version` in `supabase/config.toml` to match it. Under Settings > API Keys, use the publishable and secret keys (create them if the tab offers to); the legacy anon and service_role keys are deprecated by the end of 2026, inside this contest's season.
2. Authentication > SMTP: set up custom SMTP (Resend, Postmark or SES, sending from a wausaupilotandreview.com address; the DNS records go in Cloudflare). This is required: Supabase's built-in sender only reaches members of the Supabase organization, caps at 2 emails an hour, and doesn't allow template edits.
3. GitHub secrets: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF`.
4. Cloudflare dashboard > Turnstile > Add widget: mode Managed, hostname `rowanflynnpilot.github.io` (the form runs inside that iframe, not on wausaupilotandreview.com).
5. GitHub repository variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_GALLERY_PAGE_URL` (the Brag Board page, https://wausaupilotandreview.com/wausau-pilot-hunting-brag-board/), `VITE_ENTER_PAGE_URL` (the same address with `#enter`), `VITE_RULES_URL` (Shereen's rules, on the same page for now), `VITE_TURNSTILE_SITE_KEY`. Enable Pages with "GitHub Actions" as the source. Changing a variable deploys nothing by itself: run Pages, and Share pages, from the Actions tab afterward.
6. `supabase secrets set ALLOWED_ORIGIN=https://rowanflynnpilot.github.io TURNSTILE_SECRET_KEY=<widget secret>`
7. Push to `main`. CI tests, pushes migrations, deploys the function, and publishes the web app, but each deploy runs only when its own files changed, so for a first deploy run Supabase, Pages and Share pages by hand from the Actions tab (from `main`; the deploy steps refuse any other branch).
8. In the SQL editor, run `supabase/seasons/2026.sql` once, then `supabase/seasons/2026-sponsors.sql` (the sponsors and prizes; confirm the names with Chris first). Add each staff member under Authentication > Users (Add user, auto-confirm), then insert them into `staff` (see CLAUDE.md).
9. Authentication > Email Templates > Magic Link: paste `supabase/templates/magic_link.html`. Staff sign in at `#/admin` with the 6-digit code it sends. Also paste `supabase/templates/confirm_signup.html` into Confirm signup: a reader voting for Readers' Choice for the first time is a new account and gets that template instead. Before Dec. 14, raise Authentication > Rate Limits > "emails sent" well above the default 30 an hour (each voter gets one), and check a vote end to end from a phone inside the WordPress page, in Safari too.
10. Share pages. In WPR's Cloudflare dashboard, create an API token from the "Edit Cloudflare Workers" template, limited to WPR's account and the wausaupilotandreview.com zone. Add it and the account ID (Workers & Pages overview, right-hand column) as the GitHub secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, then run Actions > Share pages > Run workflow. It deploys `wpr-brag-board-share` on the route `wausaupilotandreview.com/brag/*`, with the Supabase URL, publishable key and gallery page taken from the `VITE_` variables (after changing one of those, run it again). Check it with a posted deer's id: `curl -A facebookexternalhit https://wausaupilotandreview.com/brag/<id>` prints the deer's Open Graph tags, the same link in a browser opens the deer on the Brag Board page, and Facebook's Sharing Debugger (developers.facebook.com/tools/debug) shows the preview. The share buttons go live with the gallery, so do this before entries open.
11. Entry emails (a confirmation to the entrant, replies to the editor; a notice to Shereen and Chris for each entry; and, from `entry-posted`, one email to the entrant when staff post the deer). In Resend (the same account as step 2's SMTP, if that's Resend), verify wausaupilotandreview.com (its DNS records go in Cloudflare), create an API key, then `supabase secrets set RESEND_API_KEY=re_...`. Defaults, each overridable with a secret of the same name: `EMAIL_FROM` "Wausau Pilot & Review <bragboard@wausaupilotandreview.com>", `EMAIL_REPLY_TO` editor@wausaupilotandreview.com, `STAFF_EMAILS` editor@ and weber.chris@ (comma-separated), `STAFF_QUEUE_URL` the `#/admin` page, `GALLERY_PAGE_URL` the Brag Board page (the posted email's links; share links are `/brag/` on its host). Without the key, entries save and nothing is sent. Each entry sends two emails (three once posted) and Resend's free plan allows 100 a day, so the gun-opener weekend (more than 33 posted entries a day) needs the paid plan for November. Check it with one real entry: both emails should arrive within a minute.

## WordPress embed

The board lives on one WordPress page, Shereen's [Hunting Brag Board page](https://wausaupilotandreview.com/wausau-pilot-hunting-brag-board/), in a single frame that shows the board or the entry form; her rules tell readers to fill out the form "on this page." The front page carries the strip.

**The pages hold only an iframe, no script.** WPR's server firewall refuses a page save that has script in it (on Oct. 31 the first snippet, which built the frame in script, never reached the page), and WordPress strips script from accounts without full HTML rights anyway. WPR's other tools on the site are iframe-only for the same reason. Paste into a **Custom HTML** block (not a Paragraph or Code block), from a plain-text source, since "smart" quotes break the attributes. Then purge the page in LiteSpeed (admin bar > LiteSpeed Cache > Purge this page).

Brag Board page, at the very top, above the rules:

```html
<iframe src="https://rowanflynnpilot.github.io/wpr-buck-board/#/gallery" title="Hunting Brag Board" style="width:100%;height:88vh;min-height:640px;border:0;display:block" allow="clipboard-write; web-share" data-no-lazy="1"></iframe>
```

- The frame is most of a screen tall and the board scrolls inside it. Its Enter your deer and See the board buttons switch views inside the frame, so the board needs nothing else from the page.
- `allow="clipboard-write; web-share"`: the "Sponsor the Brag Board" button copies the sales address for readers with no mail app, and a deer's Share button opens a phone's own share sheet (without it, Share falls back to Facebook and Copy link).
- `data-no-lazy="1"` keeps LiteSpeed from swapping the address for `about:blank` until the reader scrolls (it does that to every other iframe on the site); the board is the page's main content.

**Optional, site-wide: `embed.js`.** One line in the site's header or footer code (a header/footer code plugin such as WPCode, or wherever the site keeps other third-party scripts), added once by an administrator:

```html
<script src="https://rowanflynnpilot.github.io/wpr-buck-board/embed.js" defer data-no-optimize="1"></script>
```

With it, the board's frame is sized to the board, with no inner scrollbar, and the page scrolls to the form after Enter. On the Brag Board page it also opens the form at `#enter` and a deer at `#entry=<id>`, where share links, the front-page strip's photos and the posted email land; without it those links open the board at the top. No other anchor moves the board, so a half-filled form survives a click on `#comments`. The front-page strip fills the height its own iframe sets and is left at it, and a `?demo` frame stays as pasted. The frames are found by their address, so nothing in the page changes. If the firewall refuses to save that too, ask the host to check its ModSecurity log for the save and allow the rule.

Front page, where the strip should sit:

```html
<iframe src="https://rowanflynnpilot.github.io/wpr-buck-board/#/embed" title="Hunting Brag Board" style="width:100%;height:max(540px,calc(880px - 60vw));border:0;display:block" loading="lazy" allow="clipboard-write; web-share"></iframe>
```

- In a frame the strip fills the frame's height exactly: the words take what they need and the pictures the rest, the newest deer large and the others in as many columns as the width holds (the newest and two more on a phone, all seven from about 560px). The height is 540px on a wide screen and grows on narrow ones, where the words wrap onto more lines (about 650px on a phone). With very large text the strip scrolls inside the frame rather than clipping.
- `loading="lazy"`: the strip, its fonts and photos load only as a reader scrolls near it, so a `#/embed` pageview in Plausible means the strip was seen.

For sales pitches, `https://rowanflynnpilot.github.io/wpr-buck-board/?demo#/gallery` (or `#/embed`) fills every unsold slot with "Your business here" under a ribbon that explains the preview. Readers never see it. `https://rowanflynnpilot.github.io/wpr-buck-board/?demo#/enter` is the entry form to try out, on a phone too: it works as it will for readers but sends nothing, and ends on the deer as it would look on the board.
