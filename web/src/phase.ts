import { apDate, apDay, apLastDay, daysUntil } from "./format";
import type { Board, Season, Sponsor, Award } from "./types";

export function phaseLine(season: Season): string {
  switch (season.phase) {
    case "upcoming":
      return `Entries open ${apDate(season.entries_open_at)} for any deer taken since ${apDay(season.harvest_since)}.`;
    case "entries":
      return `Taking entries through ${apLastDay(season.entries_close_at)} for any deer taken since ${apDay(season.harvest_since)}.`;
    case "judging":
      return `Entries are closed. Readers' Choice voting opens ${apDate(season.voting_open_at)}.`;
    case "voting":
      return `Readers' Choice voting is open through ${apLastDay(season.voting_close_at)}.`;
    case "tallying":
      return `Voting is closed. Winners will be announced ${apDate(season.winners_at)}.`;
    case "winners":
      return `The ${season.year} winners are in.`;
  }
}

// Shown in the week before the gun opener and on opening day.
export function gunOpenerLine(season: Season): string | null {
  if (season.phase !== "entries") return null;
  const days = daysUntil(season.gun_opener_at);
  if (days === 0) return "It's opening day of the gun deer season. Good luck out there.";
  if (days < 0 || days > 7) return null;
  return days === 1 ? "The gun deer opener is tomorrow." : `The gun deer opener is ${days} days away.`;
}

export function presentingSponsor(board: Board): Sponsor | undefined {
  return board.sponsors.find((s) => s.tier === "presenting");
}

// Readers' Choice belongs to the presenting sponsor, so a missed attach step in the SQL
// editor still credits them rather than leaving the grand prize without a sponsor.
export function awardSponsor(board: Board, award: Award): Sponsor | undefined {
  const sponsor = board.sponsors.find((s) => s.id === award.sponsor_id);
  return sponsor ?? (award.kind === "readers_choice" ? presentingSponsor(board) : undefined);
}
