import { FunctionsFetchError, FunctionsHttpError, type PostgrestError } from "@supabase/supabase-js";
import type { PreparedPhoto } from "./photo";
import { withDemoSponsors } from "./sales";
import { supabase } from "./supabase";
import type {
  Award,
  AwardWinner,
  Board,
  EntryFields,
  EntryStatus,
  GalleryEntry,
  ModerationEntry,
  PostedEntry,
  Season,
  Sponsor,
} from "./types";

type Result = { data: unknown; error: PostgrestError | null };

async function rows<T>(query: PromiseLike<Result>): Promise<T> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data as T;
}

const ENTRY_COLUMNS =
  "id, hunter_name, hometown, county, harvest_date, weapon, deer_type, points, first_deer, age_group, story, photo_id, created_at";

export async function loadSeason(): Promise<Season> {
  return rows<Season>(supabase.from("current_season").select("*").single());
}

// Awards and sponsors for a season. Views fetch this alongside their own data so the
// front-page embed costs two round trips, not three.
export async function loadCatalog(seasonId: string): Promise<Pick<Board, "awards" | "sponsors">> {
  const [awards, sponsors] = await Promise.all([
    rows<Award[]>(
      supabase.from("awards").select("id, kind, label, description, sponsor_id").eq("season_id", seasonId).order("kind"),
    ),
    rows<Sponsor[]>(
      supabase.from("sponsors").select("id, name, tier, logo_path, website_url, prize, qr_slug").eq("season_id", seasonId),
    ),
  ]);
  return withDemoSponsors({ awards, sponsors });
}

export async function loadGallery(seasonId: string, limit?: number): Promise<GalleryEntry[]> {
  const query = supabase
    .from("gallery_entries")
    .select(`${ENTRY_COLUMNS}, award_kinds`)
    .eq("season_id", seasonId)
    .order("created_at", { ascending: false });
  return rows<GalleryEntry[]>(limit === undefined ? query : query.limit(limit));
}

export async function countEntries(seasonId: string): Promise<number> {
  const { count, error } = await supabase
    .from("gallery_entries")
    .select("id", { count: "exact", head: true })
    .eq("season_id", seasonId);
  if (error) throw new Error(error.message);
  if (count === null) throw new Error("Entry count was not returned.");
  return count;
}

export async function loadAwardWinners(seasonId: string): Promise<AwardWinner[]> {
  return rows<AwardWinner[]>(supabase.from("award_winners").select("award_id, entry_id").eq("season_id", seasonId));
}

export async function loadCounties(): Promise<string[]> {
  const counties = await rows<{ name: string }[]>(supabase.from("wi_counties").select("name").order("name"));
  return counties.map((c) => c.name);
}

export async function loadModerationQueue(seasonId: string, status: EntryStatus): Promise<ModerationEntry[]> {
  return rows<ModerationEntry[]>(
    supabase
      .from("entries")
      .select(
        `${ENTRY_COLUMNS}, status, share_card, entry_private(submitter_name, email, moderated_at, rejection_reason), entry_edits(edited_at)`,
      )
      .eq("season_id", seasonId)
      .eq("status", status)
      .order("created_at", { ascending: status === "pending" }),
  );
}

// Staff: entries approved at or after `since` (an ISO timestamp), newest first. "Posted"
// means approved, so an entry sent in Thursday and approved Saturday lands in the next week.
export async function loadPostedSince(seasonId: string, since: string): Promise<PostedEntry[]> {
  return rows<PostedEntry[]>(
    supabase
      .from("entries")
      .select(`${ENTRY_COLUMNS}, entry_private!inner(moderated_at)`)
      .eq("season_id", seasonId)
      .eq("status", "approved")
      .gte("entry_private.moderated_at", since)
      .order("created_at", { ascending: false }),
  );
}

export async function moderate(entryId: string, decision: "approved" | "rejected", reason: string | null) {
  await rows<null>(supabase.rpc("moderate_entry", { p_entry_id: entryId, p_decision: decision, p_reason: reason }));
}

// Staff fix the words on an entry; the database refuses anything else and logs the change.
export async function editEntry(entryId: string, fields: { hunter_name: string; hometown: string; story: string }) {
  await rows<null>(
    supabase.rpc("edit_entry", {
      p_entry_id: entryId,
      p_hunter_name: fields.hunter_name,
      p_hometown: fields.hometown,
      p_story: fields.story,
    }),
  );
}

// Everything a share card shows, read fresh so a card never carries words staff just changed.
export interface CardFacts {
  entry: EntryFields;
  year: number;
  presenting: Sponsor | undefined;
}

export async function loadCardFacts(entryId: string): Promise<CardFacts> {
  const entry = await rows<EntryFields & { season_id: string; seasons: { year: number } }>(
    supabase.from("entries").select(`${ENTRY_COLUMNS}, season_id, seasons(year)`).eq("id", entryId).single(),
  );
  const [presenting] = await rows<Sponsor[]>(
    supabase
      .from("sponsors")
      .select("id, name, tier, logo_path, website_url, prize, qr_slug")
      .eq("season_id", entry.season_id)
      .eq("tier", "presenting"),
  );
  return { entry, year: entry.seasons.year, presenting };
}

// Staff: store a share card under a new name, make it the deer's current one, then remove the
// card it replaced (a leftover old card is harmless, so that step only warns).
export async function saveShareCard(entryId: string, card: Blob): Promise<void> {
  const bucket = supabase.storage.from("share-cards");
  const name = `${entryId}/${crypto.randomUUID()}.jpg`;
  const { error } = await bucket.upload(name, card, { contentType: "image/jpeg", cacheControl: "31536000" });
  if (error) throw new Error(`The share image didn't upload: ${error.message}`);

  let previous: string | null;
  try {
    previous = await rows<string | null>(supabase.rpc("set_share_card", { p_entry_id: entryId, p_card: name }));
  } catch (err) {
    await bucket.remove([name]);
    throw err;
  }
  if (previous) {
    const { error: removeError } = await bucket.remove([previous]);
    if (removeError) console.warn(`Old share image ${previous} was left in storage:`, removeError);
  }
}

export async function isStaff(): Promise<boolean> {
  return rows<boolean>(supabase.rpc("is_staff"));
}

export interface EntrySubmission {
  hunter_name: string;
  hometown: string;
  county: string;
  harvest_date: string;
  weapon: string;
  deer_type: string;
  points: string;
  first_deer: boolean;
  age_group: string;
  guardian_consent: boolean;
  story: string;
  submitter_name: string;
  email: string;
  newsletter_opt_in: boolean;
}

export async function submitEntry(entry: EntrySubmission, photo: PreparedPhoto, turnstileToken: string): Promise<void> {
  const body = new FormData();
  for (const [name, value] of Object.entries(entry)) body.append(name, String(value));
  body.append("turnstile_token", turnstileToken);
  body.append("photo", photo.full, "full.jpg");
  body.append("thumb", photo.thumb, "thumb.jpg");

  const { error } = await supabase.functions.invoke("submit-entry", { body });
  if (!error) return;

  // Only submit-entry's own { error } body is written for readers. A gateway's error page,
  // a timeout or a dropped connection gets a plain retry message, never the raw text.
  if (error instanceof FunctionsHttpError) {
    const message = await error.context.json().then(
      (reply: { error?: unknown }) => reply.error,
      () => undefined,
    );
    if (typeof message === "string" && message) throw new Error(message);
  }
  console.error(error);
  throw new Error(
    error instanceof FunctionsFetchError
      ? "Your entry didn't go through. Check your connection and try again."
      : "Your entry couldn't be saved. Check it and try again in a few minutes.",
  );
}
