import { FunctionsFetchError, FunctionsHttpError, type PostgrestError } from "@supabase/supabase-js";
import type { PreparedPhoto } from "./photo";
import { ENTRY_COLUMNS, readAsSignedIn } from "./reads";
import { supabase } from "./supabase";
import type { DrawnPrize, EntryFields, EntryStatus, ModerationEntry, PostedEntry, Sponsor, Standing } from "./types";

// The board's reads live in reads.ts, without the client. Where this module is loaded (the staff
// page, the entry form, the vote), they carry the signed-in session's token, which the client keeps
// fresh, so staff and voters read as themselves.
readAsSignedIn(async () => (await supabase.auth.getSession()).data.session?.access_token ?? null);
export {
  countEntries,
  countHarvested,
  loadAwardWinners,
  loadBlockedDomains,
  loadCatalog,
  loadCounties,
  loadDnrTally,
  loadFinalistEntries,
  loadFinalists,
  loadGallery,
  loadSeason,
  loadWeeklyPicks,
} from "./reads";

type Result = { data: unknown; error: PostgrestError | null };

async function rows<T>(query: PromiseLike<Result>): Promise<T> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data as T;
}

// Staff reads of `entries` take the award kinds from the same function the gallery view uses.
const QUEUE_COLUMNS = `${ENTRY_COLUMNS}, award_kinds`;

// Readers' Choice (migration 0014): staff pick finalists; a signed-in reader votes.
export async function setFinalist(entryId: string, on: boolean): Promise<void> {
  await rows<null>(supabase.rpc("set_finalist", { p_entry_id: entryId, p_finalist: on }));
}

// A null entry clears that Friday's pick.
export async function setWeeklyPick(weekOf: string, entryId: string | null): Promise<void> {
  await rows<null>(supabase.rpc("set_weekly_pick", { p_week_of: weekOf, p_entry_id: entryId }));
}

export async function setPrizeEligible(entryId: string, eligible: boolean): Promise<void> {
  await rows<null>(supabase.rpc("set_prize_eligible", { p_entry_id: entryId, p_eligible: eligible }));
}

// Staff: votes per finalist (RLS on votes keeps readers to their own row).
export async function loadStandings(seasonId: string): Promise<Standing[]> {
  return rows<Standing[]>(supabase.from("readers_choice_standings").select("entry_id, votes").eq("season_id", seasonId));
}

// A signed-in reader's own vote this season, or null.
export async function loadMyVote(seasonId: string): Promise<string | null> {
  const mine = await rows<{ entry_id: string }[]>(supabase.from("votes").select("entry_id").eq("season_id", seasonId));
  return mine[0]?.entry_id ?? null;
}

export async function castVote(entryId: string, newsletter: boolean): Promise<void> {
  await rows<null>(supabase.rpc("cast_vote", { p_entry_id: entryId, p_newsletter_opt_in: newsletter }));
}

export async function setAwardWinner(awardId: string, entryId: string): Promise<void> {
  await rows<null>(supabase.rpc("set_award_winner", { p_award_id: awardId, p_entry_id: entryId }));
}

export async function loadDrawingWinners(seasonId: string): Promise<DrawnPrize[]> {
  return rows<DrawnPrize[]>(supabase.from("drawing_winners").select("sponsor_id, entry_id").eq("season_id", seasonId));
}

export async function loadForfeits(seasonId: string): Promise<DrawnPrize[]> {
  return rows<DrawnPrize[]>(supabase.from("prize_forfeits").select("sponsor_id, entry_id").eq("season_id", seasonId));
}

export async function runDrawing(seasonId: string): Promise<void> {
  await rows<null>(supabase.rpc("run_prize_drawing", { p_season_id: seasonId }));
}

export async function redrawPrize(sponsorId: string): Promise<void> {
  await rows<null>(supabase.rpc("redraw_prize", { p_sponsor_id: sponsorId }));
}

export async function loadModerationQueue(seasonId: string, status: EntryStatus): Promise<ModerationEntry[]> {
  return rows<ModerationEntry[]>(
    supabase
      .from("entries")
      .select(
        `${QUEUE_COLUMNS}, status, share_card, entry_private(submitter_name, email, phone, guardian_relationship, hunter_full_name, moderated_at, rejection_reason, prize_eligible), entry_edits(edited_at)`,
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
      .select(`${ENTRY_COLUMNS}, entry_private!inner(moderated_at, email, submitter_name, prize_eligible)`)
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

// Staff, after posting a deer: email the entrant that it's on the board. The entry-posted
// function sends it once, and only while email is on; a failure never undoes the post.
export async function notifyPosted(entryId: string): Promise<void> {
  const { error } = await supabase.functions.invoke("entry-posted", { body: { entry_id: entryId } });
  if (error) throw new Error(error.message);
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
  // Radio answers, sent as the strings the function reads.
  first_deer: "" | "true" | "false";
  age_group: string;
  guardian_consent: boolean;
  story: string;
  submitter_name: string;
  email: string;
  newsletter_opt_in: boolean;
  phone: string;
  guardian_relationship: string;
  first_name_only: "" | "true" | "false";
  photo_credit: string;
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
