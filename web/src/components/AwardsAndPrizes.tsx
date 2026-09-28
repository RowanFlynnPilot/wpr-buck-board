// What entrants can win: each award with its prize and presenting sponsor, and the
// Prize Partner drawing. The whole page before entries open; the foot of it after.
import { apDate } from "../format";
import { awardSponsor } from "../phase";
import type { Board } from "../types";
import { SponsorCredit } from "./SponsorCredit";

export function AwardsAndPrizes({ board }: { board: Board }) {
  const { season } = board;
  const drawing = board.sponsors
    .filter((s) => s.tier === "prize_partner")
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <section className="prizes">
      <div>
        <h2>The awards</h2>
        <p className="prizes-intro">
          Every deer is considered for each award it qualifies for, so there's no category to pick when you enter.
        </p>
        <ul className="award-list">
          {board.awards.map((award) => {
            const sponsor = awardSponsor(board, award);
            return (
              <li key={award.id}>
                <h3>{award.label}</h3>
                <p>{award.description}</p>
                {sponsor && (
                  <>
                    <p className="award-prize">Prize: {sponsor.prize}</p>
                    <SponsorCredit sponsor={sponsor} />
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {drawing.length > 0 && (
        <div>
          <h2>The prize drawing</h2>
          <p className="prizes-intro">
            Everyone who enters gets one ticket, however many deer they enter.
            {season.phase !== "winners" && ` Winners are announced ${apDate(season.winners_at)}.`}
          </p>
          <ul className="drawing-list">
            {drawing.map((sponsor) => (
              <li key={sponsor.id}>
                <p className="award-prize">{sponsor.prize}</p>
                <SponsorCredit sponsor={sponsor} lead="From" />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
