import { addDays, apDate, apDay, apLastDay, daysUntil, wausauDay, wausauMidnight } from "./format";
import { DEMO } from "./sales";
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

// The gun opener's weekend, a display window like the countdown above (not a season phase):
// from the day before the opener through the Monday after, in Wausau. `days` are the opener and
// the day after, the harvest dates that make a deer an opening-weekend deer. A `?demo` preview
// shows it whenever entries are open, so a prospect can see the Opening Weekend spot.
export function openingWeekend(season: Season): { on: boolean; days: [string, string] } {
  const opener = wausauDay(season.gun_opener_at);
  const now = Date.now();
  const during =
    now >= Date.parse(wausauMidnight(addDays(opener, -1))) && now < Date.parse(wausauMidnight(addDays(opener, 3)));
  return { on: season.phase === "entries" && (during || DEMO), days: [opener, addDays(opener, 1)] };
}

export function openingWeekendSponsor(board: Board): Sponsor | undefined {
  return board.sponsors.find((s) => s.tier === "opening_weekend");
}

// Every entrant whose deer goes on the board gets this sponsor's offer, by email when it's posted.
export function thankYouSponsor(board: Board): Sponsor | undefined {
  return board.sponsors.find((s) => s.tier === "thank_you");
}

export function weeklySponsor(board: Board): Sponsor | undefined {
  return board.sponsors.find((s) => s.tier === "deer_of_the_week");
}

// Deer of the Week runs on Fridays while entries are open, so the last is the last Friday before
// entries close (set_weekly_pick refuses any later one).
export function lastWeeklyFriday(season: Season): string {
  const lastDay = wausauDay(new Date(Date.parse(season.entries_close_at) - 1).toISOString());
  const weekday = new Date(`${lastDay}T12:00:00Z`).getUTCDay();
  return addDays(lastDay, -((weekday - 5 + 7) % 7));
}

export function presentingSponsor(board: Board): Sponsor | undefined {
  return board.sponsors.find((s) => s.tier === "presenting");
}

// The awards with the grand prize, Readers' Choice, first: it leads the list and the winners.
export function grandPrizeFirst(awards: Award[]): Award[] {
  return [...awards].sort((a, b) => Number(b.kind === "readers_choice") - Number(a.kind === "readers_choice"));
}

// Readers' Choice belongs to the presenting sponsor, so a missed attach step in the SQL
// editor still credits them rather than leaving the grand prize without a sponsor.
export function awardSponsor(board: Board, award: Award): Sponsor | undefined {
  const sponsor = board.sponsors.find((s) => s.id === award.sponsor_id);
  return sponsor ?? (award.kind === "readers_choice" ? presentingSponsor(board) : undefined);
}
