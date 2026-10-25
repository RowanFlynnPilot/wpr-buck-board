// Deer of the Week: each Friday while entries are open, an editor picks one deer from the board
// (set_weekly_pick, from the Friday newsletter tab), presented by the Deer of the Week sponsor with
// its weekly prize. The board shows the latest pick here, after the front; every pick wears a tag
// on its card all season. Before the first pick it says when that comes, so the slot has
// something to show from the day it sells.
import type { CardFacts } from "../data";
import { apDay, fridayOnOrAfter, todayInWausau } from "../format";
import { lastWeeklyFriday, weeklySponsor } from "../phase";
import type { Board, GalleryEntry } from "../types";
import { EntryCard } from "./EntryCard";
import { SponsorCredit } from "./SponsorCredit";

export function DeerOfTheWeek({
  board,
  pick,
  storyFacts,
}: {
  board: Board;
  pick?: { entry: GalleryEntry; weekOf: string };
  storyFacts: Omit<CardFacts, "entry">;
}) {
  const sponsor = weeklySponsor(board);
  const last = lastWeeklyFriday(board.season);
  const next = fridayOnOrAfter(todayInWausau());
  return (
    <section className={pick ? "weekly weekly-with-pick" : "weekly"} aria-labelledby="weekly-heading" data-reveal>
      <div className="weekly-text">
        <h2 id="weekly-heading" className="weekly-heading">
          Deer of the Week
        </h2>
        <p className="weekly-line">
          Every Friday through {apDay(last)}, our editors pick one deer from the board.
          {!pick && next <= last && ` The first is picked Friday, ${apDay(next)}.`}
        </p>
        {sponsor && <p className="award-prize">Each week's prize: {sponsor.prize}</p>}
        {sponsor && <SponsorCredit sponsor={sponsor} placement="deer-of-the-week" lead="Deer of the Week presented by" />}
      </div>
      {pick && (
        <div className="weekly-pick">
          <EntryCard entry={pick.entry} award={`Deer of the Week, ${apDay(pick.weekOf)}`} share storyFacts={storyFacts} />
        </div>
      )}
    </section>
  );
}
