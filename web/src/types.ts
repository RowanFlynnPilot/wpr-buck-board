// Hand-written to match supabase/migrations. Replace with generated types
// (`supabase gen types typescript --local`) once the local stack is running.

export type Phase = "upcoming" | "entries" | "judging" | "voting" | "tallying" | "winners";
export type Weapon = "bow" | "crossbow" | "rifle" | "shotgun" | "muzzleloader" | "handgun";
export type DeerType = "buck" | "antlerless";
export type AgeGroup = "youth" | "adult" | "veteran";
export type EntryStatus = "pending" | "approved" | "rejected";
export type SponsorTier = "presenting" | "award" | "prize_partner" | "opening_weekend" | "thank_you" | "deer_of_the_week";
export type AwardKind =
  | "first_deer"
  | "youth"
  | "archery_crossbow"
  | "gun_muzzleloader"
  | "best_story"
  | "veteran"
  | "readers_choice";

export interface Season {
  id: string;
  year: number;
  harvest_since: string;
  entries_open_at: string;
  gun_opener_at: string;
  entries_close_at: string;
  voting_open_at: string;
  voting_close_at: string;
  winners_at: string;
  phase: Phase;
}

export interface Sponsor {
  id: string;
  name: string;
  tier: SponsorTier;
  logo_path: string;
  website_url: string | null;
  prize: string;
  qr_slug: string;
  // Only in `?demo` sales previews: a placeholder standing in for an unsold slot.
  demo?: true;
}

export interface Award {
  id: string;
  kind: AwardKind;
  label: string;
  description: string;
  sponsor_id: string | null;
}

export interface EntryFields {
  id: string;
  hunter_name: string;
  hometown: string;
  county: string;
  harvest_date: string;
  weapon: Weapon;
  deer_type: DeerType;
  points: number | null;
  first_deer: boolean;
  age_group: AgeGroup;
  story: string | null;
  photo_id: string;
  // Who took the photo, if the entrant said.
  photo_credit: string | null;
  created_at: string;
}

export interface GalleryEntry extends EntryFields {
  award_kinds: AwardKind[];
}

export interface ModerationEntry extends EntryFields {
  status: EntryStatus;
  award_kinds: AwardKind[];
  // The current share card (migration 0008): <entry id>/<uuid>.jpg in share-cards.
  share_card: string | null;
  entry_private: {
    submitter_name: string;
    email: string;
    phone: string | null;
    // Youth entries only: "parent" or "legal guardian".
    guardian_relationship: string | null;
    // The name as entered; the board may show a first name only (a parent's choice).
    hunter_full_name: string | null;
    moderated_at: string | null;
    rejection_reason: string | null;
    // False for staff and their households, who share a deer but can't win prizes (migration 0014).
    prize_eligible: boolean;
  };
  // Staff edits to the name, hometown or story (the full before/after is in the table).
  entry_edits: { edited_at: string }[];
}

// An approved entry and when it went up. Staff only: moderated_at lives in entry_private.
export interface PostedEntry extends EntryFields {
  entry_private: { moderated_at: string; email: string; submitter_name: string; prize_eligible: boolean };
}

// The DNR's preliminary registrations, copied in by staff from its release.
export interface DnrTally {
  period: "opening_weekend" | "gun_season";
  released_on: string;
  statewide: number;
  marathon: number | null;
  source_url: string;
}

// A Deer of the Week: the Friday it's announced and the deer. Public from that Friday on.
export interface WeeklyPick {
  week_of: string;
  entry_id: string;
}

export interface AwardWinner {
  award_id: string;
  entry_id: string;
}

export interface Standing {
  entry_id: string;
  votes: number;
}

export interface DrawnPrize {
  sponsor_id: string;
  entry_id: string;
}

export interface Board {
  season: Season;
  awards: Award[];
  sponsors: Sponsor[];
}
