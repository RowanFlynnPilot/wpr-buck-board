// Hand-written to match supabase/migrations. Replace with generated types
// (`supabase gen types typescript --local`) once the local stack is running.

export type Phase = "upcoming" | "entries" | "judging" | "voting" | "tallying" | "winners";
export type Weapon = "bow" | "crossbow" | "rifle" | "shotgun" | "muzzleloader" | "handgun";
export type DeerType = "buck" | "antlerless";
export type AgeGroup = "youth" | "adult" | "veteran";
export type EntryStatus = "pending" | "approved" | "rejected";
export type SponsorTier = "presenting" | "award" | "prize_partner";
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
  created_at: string;
}

export interface GalleryEntry extends EntryFields {
  award_kinds: AwardKind[];
}

export interface ModerationEntry extends EntryFields {
  status: EntryStatus;
  entry_private: {
    submitter_name: string;
    email: string;
    moderated_at: string | null;
    rejection_reason: string | null;
  };
}

export interface AwardWinner {
  award_id: string;
  entry_id: string;
}

export interface Board {
  season: Season;
  awards: Award[];
  sponsors: Sponsor[];
}
