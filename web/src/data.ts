import { FunctionsHttpError, type PostgrestError } from "@supabase/supabase-js";
import type { PreparedPhoto } from "./photo";
import { supabase } from "./supabase";
import type { Award, AwardWinner, Board, EntryStatus, GalleryEntry, ModerationEntry, Season, Sponsor } from "./types";

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
  return { awards, sponsors };
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
      .select(`${ENTRY_COLUMNS}, status, entry_private(submitter_name, email, moderated_at, rejection_reason)`)
      .eq("season_id", seasonId)
      .eq("status", status)
      .order("created_at", { ascending: status === "pending" }),
  );
}

export async function moderate(entryId: string, decision: "approved" | "rejected", reason: string | null) {
  await rows<null>(supabase.rpc("moderate_entry", { p_entry_id: entryId, p_decision: decision, p_reason: reason }));
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
  if (error instanceof FunctionsHttpError) {
    const { error: message } = (await error.context.json()) as { error: string };
    throw new Error(message);
  }
  if (error) throw new Error(error.message);
}
