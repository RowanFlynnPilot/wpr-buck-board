# Hunting Brag Board

Wausau Pilot & Review's sponsored reader deer-photo contest. Readers enter a photo and a few details; staff moderate; the gallery sorts every deer into the awards it qualifies for; readers vote for Readers' Choice in December.

- `supabase/`: Postgres schema, RLS, RPCs, the `submit-entry` edge function, and pgTAP tests
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
5. GitHub repository variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_GALLERY_PAGE_URL`, `VITE_ENTER_PAGE_URL`, `VITE_RULES_URL`, `VITE_TURNSTILE_SITE_KEY`. Enable Pages with "GitHub Actions" as the source.
6. `supabase secrets set ALLOWED_ORIGIN=https://rowanflynnpilot.github.io TURNSTILE_SECRET_KEY=<widget secret>`
7. Push to `main`. CI tests, pushes migrations, deploys the function, and publishes the web app.
8. In the SQL editor, run `supabase/seasons/2026.sql` once. Add each staff member under Authentication > Users (Add user, auto-confirm), then insert them into `staff` (see CLAUDE.md).
9. Authentication > Email Templates > Magic Link: paste `supabase/templates/magic_link.html`. Staff sign in at `#/admin` with the 6-digit code it sends.
10. Share pages. In WPR's Cloudflare dashboard, create an API token from the "Edit Cloudflare Workers" template, limited to WPR's account and the wausaupilotandreview.com zone. Add it and the account ID (Workers & Pages overview, right-hand column) as the GitHub secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, then run Actions > Share pages > Run workflow. It deploys `wpr-brag-board-share` on the route `wausaupilotandreview.com/brag/*`, with the Supabase URL, publishable key and gallery page taken from the `VITE_` variables (after changing one of those, run it again). Check it with a posted deer's id: `curl -A facebookexternalhit https://wausaupilotandreview.com/brag/<id>` prints the deer's Open Graph tags, the same link in a browser opens the deer on `/brag-board/`, and Facebook's Sharing Debugger (developers.facebook.com/tools/debug) shows the preview. The share buttons go live with the gallery, so do this before entries open.
11. Entry emails (a confirmation to the entrant, replies to the editor; a notice to Shereen and Chris for each entry). In Resend (the same account as step 2's SMTP, if that's Resend), verify wausaupilotandreview.com (its DNS records go in Cloudflare), create an API key, then `supabase secrets set RESEND_API_KEY=re_...`. Defaults, each overridable with a secret of the same name: `EMAIL_FROM` "Wausau Pilot & Review <bragboard@wausaupilotandreview.com>", `EMAIL_REPLY_TO` editor@wausaupilotandreview.com, `STAFF_EMAILS` editor@ and weber.chris@ (comma-separated), `STAFF_QUEUE_URL` the `#/admin` page. Without the key, entries save and nothing is sent. Each entry sends two emails and Resend's free plan allows 100 a day, so the gun-opener weekend (more than 50 entries a day) needs the paid plan for November. Check it with one real entry: both emails should arrive within a minute.

## WordPress embed

Use a Custom HTML block. Front page: `#/embed`, `height="400"`. Brag Board page (`/brag-board/`): `#/gallery`, `height="600"`. Entry page (`/brag-board/enter/`): `#/enter`, `height="600"`. The height is only the starting size (the app resizes the frame), so match it to the page and it won't jump as it loads.

Keep all of the snippet, attributes included:

- `loading="lazy"`: on the front page the strip, its script, fonts and six photos load only as a reader scrolls near it, and a `#/embed` pageview in Plausible then means the strip was actually seen.
- `allow="clipboard-write; web-share"`: an unsold sponsor slot's "Book" button copies the sales address for readers whose computer has no mail app, and a deer's Share button opens a phone's own share sheet (without it, Share falls back to Facebook and Copy link).
- The `#entry=` lines: a link to one deer (`/brag-board/#entry=<id>`, where share links and front-page strip photos land) opens that deer at the top of the board. They do nothing on the other pages.

```html
<iframe id="wpr-buck-board" src="https://rowanflynnpilot.github.io/wpr-buck-board/#/embed"
  title="Hunting Brag Board" loading="lazy" allow="clipboard-write; web-share"
  style="width:100%;border:0;display:block" height="400"></iframe>
<script>
  (function () {
    var frame = document.getElementById("wpr-buck-board");
    var deer = /^#(entry=[0-9a-f-]{36}(&from=[a-z-]+)?)$/i.exec(location.hash);
    if (deer) frame.src = frame.src.replace("#/", "?" + deer[1] + "#/");
    window.addEventListener("message", function (event) {
      if (event.origin !== "https://rowanflynnpilot.github.io" || event.source !== frame.contentWindow) return;
      if (event.data.height) frame.style.height = event.data.height + "px";
      if (event.data.scrollToTop) frame.scrollIntoView({ block: "start" });
      if (typeof event.data.scrollTo === "number") {
        window.scrollTo(0, frame.getBoundingClientRect().top + window.scrollY + event.data.scrollTo);
      }
    });
  })();
</script>
```

For sales pitches, `https://rowanflynnpilot.github.io/wpr-buck-board/?demo#/gallery` (or `#/embed`) fills every unsold slot with "Your business here" under a ribbon that explains the preview. Readers never see it. `https://rowanflynnpilot.github.io/wpr-buck-board/?demo#/enter` is the entry form to try out, on a phone too: it works as it will for readers but sends nothing, and ends on the deer as it would look on the board.
