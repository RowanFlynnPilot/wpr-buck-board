// The board's reads, straight from the database's REST API with the publishable key. The
// front-page strip and the board read only public rows, so they don't need the full Supabase
// client (sign-in, live updates), which was nearly half of what they downloaded. A page that does
// load it (the staff page, the entry form, the vote) hands these reads its session's token through
// readAsSignedIn() in data.ts, so staff and voters read as themselves, RLS and all, as before.
import { env } from "./env";
import { withDemoSponsors } from "./sales";
import type { Award, AwardWinner, Board, DnrTally, GalleryEntry, Season, Sponsor, WeeklyPick } from "./types";

export const ENTRY_COLUMNS =
  "id, hunter_name, hometown, county, harvest_date, weapon, deer_type, points, first_deer, age_group, story, photo_id, photo_credit, created_at";

let sessionToken: () => Promise<string | null> = async () => null;

// Called once by data.ts: the signed-in session's access token (refreshed by the client), or null.
export function readAsSignedIn(token: () => Promise<string | null>): void {
  sessionToken = token;
}

type Query = [name: string, value: string][];

async function request(table: string, query: Query, prefer: { single?: boolean; count?: boolean } = {}) {
  const url = new URL(`${env.supabaseUrl}/rest/v1/${table}`);
  // As the client does: spaces in a select list aren't part of it.
  for (const [name, value] of query) url.searchParams.append(name, name === "select" ? value.replace(/\s/g, "") : value);
  const headers: Record<string, string> = {
    apikey: env.supabasePublishableKey,
    Authorization: `Bearer ${(await sessionToken()) ?? env.supabasePublishableKey}`,
  };
  if (prefer.single) headers.Accept = "application/vnd.pgrst.object+json";
  if (prefer.count) headers.Prefer = "count=exact";
  const response = await fetch(url, { method: prefer.count ? "HEAD" : "GET", headers });
  if (!response.ok) {
    const body = prefer.count ? null : await response.json().catch(() => null);
    throw new Error(body?.message ?? `The board's data didn't load (${response.status}).`);
  }
  return response;
}

async function rows<T>(table: string, query: Query, single = false): Promise<T> {
  return (await request(table, query, { single })).json() as Promise<T>;
}

async function count(table: string, query: Query): Promise<number> {
  const total = Number((await request(table, query, { count: true })).headers.get("content-range")?.split("/")[1]);
  if (!Number.isFinite(total)) throw new Error("Entry count was not returned.");
  return total;
}

export async function loadSeason(): Promise<Season> {
  return rows<Season>("current_season", [["select", "*"]], true);
}

// Awards and sponsors for a season. Views fetch this alongside their own data so the
// front-page embed costs two round trips, not three.
export async function loadCatalog(seasonId: string): Promise<Pick<Board, "awards" | "sponsors">> {
  const [awards, sponsors] = await Promise.all([
    rows<Award[]>("awards", [
      ["select", "id, kind, label, description, sponsor_id"],
      ["season_id", `eq.${seasonId}`],
      ["order", "kind.asc"],
    ]),
    rows<Sponsor[]>("sponsors", [
      ["select", "id, name, tier, logo_path, website_url, prize, qr_slug"],
      ["season_id", `eq.${seasonId}`],
    ]),
  ]);
  return withDemoSponsors({ awards, sponsors });
}

export async function loadGallery(seasonId: string, limit?: number): Promise<GalleryEntry[]> {
  return rows<GalleryEntry[]>("gallery_entries", [
    ["select", `${ENTRY_COLUMNS}, award_kinds`],
    ["season_id", `eq.${seasonId}`],
    ["order", "created_at.desc"],
    ...(limit === undefined ? [] : ([["limit", String(limit)]] as Query)),
  ]);
}

export async function countEntries(seasonId: string): Promise<number> {
  return count("gallery_entries", [
    ["select", "id"],
    ["season_id", `eq.${seasonId}`],
  ]);
}

// Deer on the board taken between two calendar days, inclusive (the opening-weekend count).
export async function countHarvested(seasonId: string, from: string, to: string): Promise<number> {
  return count("gallery_entries", [
    ["select", "id"],
    ["season_id", `eq.${seasonId}`],
    ["harvest_date", `gte.${from}`],
    ["harvest_date", `lte.${to}`],
  ]);
}

export async function loadAwardWinners(seasonId: string): Promise<AwardWinner[]> {
  return rows<AwardWinner[]>("award_winners", [
    ["select", "award_id, entry_id"],
    ["season_id", `eq.${seasonId}`],
  ]);
}

// Readers' Choice (migration 0014). Finalists are public from the vote on; before that, staff only.
export async function loadFinalists(seasonId: string): Promise<string[]> {
  const list = await rows<{ entry_id: string }[]>("finalists", [
    ["select", "entry_id"],
    ["season_id", `eq.${seasonId}`],
  ]);
  return list.map((f) => f.entry_id);
}

export async function loadFinalistEntries(seasonId: string): Promise<GalleryEntry[]> {
  const ids = await loadFinalists(seasonId);
  if (ids.length === 0) return [];
  return rows<GalleryEntry[]>("gallery_entries", [
    ["select", `${ENTRY_COLUMNS}, award_kinds`],
    ["season_id", `eq.${seasonId}`],
    ["id", `in.(${ids.join(",")})`],
    ["order", "created_at.desc"],
  ]);
}

// The DNR's latest count this season (the gun season's, once it's in), or null before the first.
export async function loadDnrTally(seasonId: string): Promise<DnrTally | null> {
  const tallies = await rows<DnrTally[]>("dnr_tallies", [
    ["select", "period, released_on, statewide, marathon, source_url"],
    ["season_id", `eq.${seasonId}`],
    ["order", "released_on.desc"],
    ["limit", "1"],
  ]);
  return tallies[0] ?? null;
}

// Newest first. Readers get each pick from its Friday on; staff also see one queued for Friday.
export async function loadWeeklyPicks(seasonId: string): Promise<WeeklyPick[]> {
  return rows<WeeklyPick[]>("weekly_picks", [
    ["select", "week_of, entry_id"],
    ["season_id", `eq.${seasonId}`],
    ["order", "week_of.desc"],
  ]);
}

export async function loadBlockedDomains(): Promise<string[]> {
  const list = await rows<{ domain: string }[]>("blocked_email_domains", [["select", "domain"]]);
  return list.map((d) => d.domain);
}

export async function loadCounties(): Promise<string[]> {
  const counties = await rows<{ name: string }[]>("wi_counties", [
    ["select", "name"],
    ["order", "name.asc"],
  ]);
  return counties.map((c) => c.name);
}
