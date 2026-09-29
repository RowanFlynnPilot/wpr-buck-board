import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { cardText, type Entry } from "./card.ts";
import { handle, jpegSize } from "./index.ts";

const ENV = {
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
  GALLERY_PAGE_URL: "https://wausaupilotandreview.com/brag-board/",
};
const ID = "3f2a8c1e-5b7d-4e9f-a012-3456789abcde";
const FACEBOOK = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 [FBAN/FBIOS]";

const ENTRY: Entry = {
  season_id: "11111111-1111-1111-1111-111111111111",
  hunter_name: "Carter",
  hometown: "Antigo",
  county: "Langlade",
  harvest_date: "2026-11-22",
  weapon: "rifle",
  deer_type: "buck",
  points: 8,
  first_deer: true,
  photo_id: "22222222-2222-2222-2222-222222222222",
};

// A frame header after the JFIF segment: 1200 wide, 1600 tall.
const JPEG = new Uint8Array([
  0xff, 0xd8,
  0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
  0xff, 0xc0, 0x00, 0x11, 0x08, 0x06, 0x40, 0x04, 0xb0, 0x03, 0x01, 0x22, 0x00,
]);

// A stand-in for Supabase that records what the Worker asked for.
function supabase(options: { entries?: unknown[]; status?: number; sponsor?: string | null } = {}) {
  const calls: string[] = [];
  const fetcher = (input: string, init?: RequestInit) => {
    calls.push(input);
    if (input.includes("/rest/v1/") && new Headers(init?.headers).get("apikey") !== ENV.SUPABASE_PUBLISHABLE_KEY) {
      return Promise.resolve(new Response("no key", { status: 401 }));
    }
    if (input.includes("/rest/v1/gallery_entries")) {
      return Promise.resolve(Response.json(options.entries ?? [ENTRY], { status: options.status ?? 200 }));
    }
    if (input.includes("/rest/v1/sponsors")) {
      const sponsor = options.sponsor === undefined ? "Northwoods Outfitters" : options.sponsor;
      return Promise.resolve(Response.json(sponsor ? [{ name: sponsor }] : []));
    }
    if (input.includes("/storage/v1/object/public/entry-photos/")) {
      return Promise.resolve(new Response(JPEG, { status: 206 }));
    }
    return Promise.resolve(new Response("unexpected", { status: 500 }));
  };
  return { fetcher, calls };
}

function get(path: string, userAgent: string, method = "GET") {
  return new Request(`https://wausaupilotandreview.com${path}`, { method, headers: { "user-agent": userAgent } });
}

Deno.test("people go straight to the deer on the gallery page, with no lookup", async () => {
  const { fetcher, calls } = supabase();
  const response = await handle(get(`/brag/${ID}`, IPHONE), ENV, fetcher);
  assertEquals(response.status, 302);
  assertEquals(
    response.headers.get("location"),
    `https://wausaupilotandreview.com/brag-board/#entry=${ID}&from=share`,
  );
  assertEquals(calls, []);
});

Deno.test("a link-preview crawler gets the deer's Open Graph tags", async () => {
  const { fetcher } = supabase();
  const response = await handle(get(`/brag/${ID.toUpperCase()}/`, FACEBOOK), ENV, fetcher);
  assertEquals(response.status, 200);
  assertEquals(response.headers.get("content-type"), "text/html; charset=utf-8");
  const html = await response.text();
  assertStringIncludes(html, `<meta property="og:url" content="https://wausaupilotandreview.com/brag/${ID}">`);
  assertStringIncludes(html, `<meta property="og:title" content="Carter’s first deer on the Hunting Brag Board">`);
  assertStringIncludes(
    html,
    `<meta property="og:image" content="https://project.supabase.co/storage/v1/object/public/entry-photos/${ENTRY.photo_id}/full.jpg">`,
  );
  assertStringIncludes(html, `<meta property="og:image:width" content="1200">`);
  assertStringIncludes(html, `<meta property="og:image:height" content="1600">`);
  assertStringIncludes(html, `<meta name="twitter:card" content="summary_large_image">`);
  assertStringIncludes(html, `presented by Northwoods Outfitters.`);
  assert(!html.includes("http-equiv"), "no meta refresh: Facebook's crawler would follow it");
});

Deno.test("iMessage previews count as a crawler", async () => {
  const { fetcher } = supabase();
  const imessage = "Mozilla/5.0 (Macintosh) AppleWebKit/601.2.4 Safari/601.2.4 facebookexternalhit/1.1 Facebot Twitterbot/1.0";
  assertEquals((await handle(get(`/brag/${ID}`, imessage), ENV, fetcher)).status, 200);
});

Deno.test("a deer that isn't on the board has no share page", async () => {
  const { fetcher } = supabase({ entries: [] });
  const response = await handle(get(`/brag/${ID}`, FACEBOOK), ENV, fetcher);
  assertEquals(response.status, 302);
  assertEquals(response.headers.get("location"), `${ENV.GALLERY_PAGE_URL}#entry=${ID}&from=share`);
});

Deno.test("a Supabase error falls back to the redirect", async () => {
  const { fetcher } = supabase({ status: 500 });
  const response = await handle(get(`/brag/${ID}`, FACEBOOK), ENV, fetcher);
  assertEquals(response.status, 302);
});

Deno.test("anything else under /brag/ goes to the gallery page", async () => {
  const { fetcher, calls } = supabase();
  for (const path of ["/brag/", "/brag/not-an-id", `/brag/${ID}/extra`]) {
    const response = await handle(get(path, FACEBOOK), ENV, fetcher);
    assertEquals(response.headers.get("location"), ENV.GALLERY_PAGE_URL, path);
  }
  assertEquals(calls, []);
});

Deno.test("HEAD has no body and other methods are refused", async () => {
  const { fetcher } = supabase();
  const head = await handle(get(`/brag/${ID}`, FACEBOOK, "HEAD"), ENV, fetcher);
  assertEquals(head.status, 200);
  assertEquals(await head.text(), "");
  assertEquals((await handle(get(`/brag/${ID}`, FACEBOOK, "POST"), ENV, fetcher)).status, 405);
});

Deno.test("the preview leaves out the size when the photo can't be read", async () => {
  const fetcher = (input: string, init?: RequestInit) =>
    input.includes("/storage/") ? Promise.resolve(new Response("gone", { status: 404 })) : supabase().fetcher(input, init);
  const html = await (await handle(get(`/brag/${ID}`, FACEBOOK), ENV, fetcher)).text();
  assertStringIncludes(html, `<meta property="og:image" content=`);
  assert(!html.includes("og:image:width"));
});

Deno.test("names and hometowns can't break out of the page", async () => {
  const { fetcher } = supabase({ entries: [{ ...ENTRY, hunter_name: `Al "</title><script>`, hometown: "A&B" }] });
  const html = await (await handle(get(`/brag/${ID}`, FACEBOOK), ENV, fetcher)).text();
  assert(!html.includes(`"</title><script>`), "the name stays escaped");
  assertStringIncludes(html, "Al &quot;&lt;/title&gt;&lt;script&gt;’s first deer");
  assertStringIncludes(html, "of A&amp;B took");
});

Deno.test("the preview reads like the board", () => {
  const text = (entry: Partial<Entry>, presenting: string | null = null) =>
    cardText({ entry: { ...ENTRY, first_deer: false, ...entry }, presenting });
  assertEquals(text({}).title, "Carter’s 8-point buck on the Hunting Brag Board");
  assertEquals(text({ hunter_name: "James" }).title, "James’ 8-point buck on the Hunting Brag Board");
  assertEquals(text({ deer_type: "antlerless", points: null }).alt, "Carter’s antlerless deer");
  assertEquals(text({ points: null }).alt, "Carter’s buck");
  assertEquals(
    text({ weapon: "bow", harvest_date: "2026-09-19", county: "Marathon" }).description,
    "Carter of Antigo took this 8-point buck with a bow in Marathon County on Sept. 19. " +
      "See every deer on the Hunting Brag Board.",
  );
});

Deno.test("jpegSize reads the frame header and gives up on anything else", () => {
  assertEquals(jpegSize(JPEG), { width: 1200, height: 1600 });
  assertEquals(jpegSize(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), null);
  assertEquals(jpegSize(JPEG.subarray(0, 26)), null);
  assertEquals(jpegSize(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02])), null);
});

Deno.test("jpegSize skips segments before the frame header", () => {
  // An ICC profile (APP2) and a fill byte ahead of the JFIF segment's frame header.
  const icc = [0xff, 0xe2, 0x00, 0x08, 0x49, 0x43, 0x43, 0x5f, 0x50, 0x52, 0xff];
  const withIcc = new Uint8Array([0xff, 0xd8, ...icc, ...JPEG.subarray(2)]);
  assertEquals(jpegSize(withIcc), { width: 1200, height: 1600 });
});
