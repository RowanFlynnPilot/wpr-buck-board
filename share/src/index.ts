// Share pages: https://wausaupilotandreview.com/brag/<entry-id>, a Cloudflare Worker on WPR's
// own domain (Supabase edge functions can't serve HTML without a paid custom domain), so a
// Facebook preview shows the deer under WPR's name rather than supabase.co.
//
// Link-preview crawlers get Open Graph tags. Everyone else is redirected before any lookup,
// to the WordPress gallery page at #entry=<id>, which opens that deer (the embed snippet in
// README.md passes it to the app). A redirect keeps the visit's referrer, so a click from
// Facebook still counts as Facebook in WPR's analytics, and a share that goes around costs
// Supabase nothing. A previewer not on the list below gets the gallery page's own preview.
//
// Reads only the public gallery_entries view with the publishable key: a deer that isn't on
// the board (waiting, not posted, taken down) has no share page, only the redirect.
import { type Card, type Entry, renderSharePage } from "./card.ts";

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  GALLERY_PAGE_URL: string;
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

const ENTRY_PATH = /^\/brag\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i;

// facebookexternalhit also covers iMessage; WhatsApp's name also covers Signal.
const PREVIEW_CRAWLERS =
  /facebookexternalhit|facebot|twitterbot|linkedinbot|slackbot|discordbot|whatsapp|telegrambot|skypeuripreview|pinterestbot|redditbot|embedly|iframely|mastodon\/|cardyb/i;

const ENTRY_COLUMNS = "season_id,hunter_name,hometown,county,harvest_date,weapon,deer_type,points,first_deer,photo_id";

export default {
  fetch: (request: Request, env: Env) => handle(request, env, (input, init) => fetch(input, init)),
};

export async function handle(request: Request, env: Env, fetcher: Fetch): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(null, { status: 405, headers: { allow: "GET, HEAD" } });
  }
  const gallery = setting(env, "GALLERY_PAGE_URL");
  const url = new URL(request.url);
  const id = ENTRY_PATH.exec(url.pathname)?.[1].toLowerCase();
  if (!id) return Response.redirect(gallery, 302);

  const entryPage = `${gallery}#entry=${id}&from=share`;
  if (!PREVIEW_CRAWLERS.test(request.headers.get("user-agent") ?? "")) return Response.redirect(entryPage, 302);

  const card = await loadCard(env, id, fetcher).catch((error) => {
    console.error(`Share page for ${id}:`, error);
    return null;
  });
  if (!card) return Response.redirect(entryPage, 302);

  const html = renderSharePage({ card, shareUrl: `${url.origin}/brag/${id}`, entryPage });
  return new Response(request.method === "HEAD" ? null : html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=300",
      "vary": "user-agent",
      "x-robots-tag": "noindex",
    },
  });
}

async function loadCard(env: Env, id: string, fetcher: Fetch): Promise<Card | null> {
  const supabase = setting(env, "SUPABASE_URL");
  const key = setting(env, "SUPABASE_PUBLISHABLE_KEY");
  const rest = async <T>(query: string): Promise<T> => {
    const response = await fetcher(`${supabase}/rest/v1/${query}`, { headers: { apikey: key } });
    if (!response.ok) throw new Error(`Supabase answered ${response.status}: ${await response.text()}`);
    return response.json();
  };

  const [entry] = await rest<Entry[]>(`gallery_entries?select=${ENTRY_COLUMNS}&id=eq.${id}`);
  if (!entry) return null;

  const photo = `${supabase}/storage/v1/object/public/entry-photos/${entry.photo_id}/full.jpg`;
  const [sponsors, size] = await Promise.all([
    rest<{ name: string }[]>(`sponsors?select=name&tier=eq.presenting&season_id=eq.${entry.season_id}`),
    photoSize(photo, fetcher),
  ]);
  return { entry, presenting: sponsors[0]?.name ?? null, photo: { url: photo, ...size } };
}

// Facebook draws the preview on the first share only if it knows the image's size up front;
// otherwise the first person to share a deer sees no photo. Read it from the JPEG's frame
// header, a few hundred bytes in (submit-entry strips the big metadata segments).
async function photoSize(url: string, fetcher: Fetch): Promise<{ width: number; height: number } | null> {
  try {
    const response = await fetcher(url, { headers: { range: "bytes=0-16383" } });
    if (!response.ok) throw new Error(`storage answered ${response.status}`);
    const size = jpegSize(new Uint8Array(await response.arrayBuffer()));
    if (!size) throw new Error("no frame header in the first 16 KB");
    return size;
  } catch (error) {
    console.warn(`Photo size for ${url}:`, error);
    return null;
  }
}

// Start-of-frame markers: every JPEG coding process except the four reserved codes.
const SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
const SOS = 0xda;

export function jpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1];
    if (marker === 0xff) { // fill byte
      i += 1;
      continue;
    }
    if (SOF.has(marker)) {
      if (i + 9 > bytes.length) return null;
      return { height: (bytes[i + 5] << 8) | bytes[i + 6], width: (bytes[i + 7] << 8) | bytes[i + 8] };
    }
    if (marker === SOS) return null;
    i += 2 + ((bytes[i + 2] << 8) | bytes[i + 3]);
  }
  return null;
}

// Set by the deploy step from the same repository variables the web app builds with.
function setting(env: Env, name: keyof Env): string {
  const value = env[name];
  if (!value) throw new Error(`Missing ${name}. See .github/workflows/share.yml.`);
  return value;
}
