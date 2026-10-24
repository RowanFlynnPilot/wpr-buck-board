// What entrants can win: each award with its prize and presenting sponsor, and the
// Prize Partner drawing. The whole page before entries open; the foot of it after.
// Until entries close, an award or drawing with no sponsor yet tells readers its prize is to be
// announced, and the section ends with one card for businesses: one ask, not one per award.
import { apDate } from "../format";
import { awardSponsor, presentingSponsor } from "../phase";
import { DEMO } from "../sales";
import type { Board } from "../types";
import { SponsorCredit } from "./SponsorCredit";
import { UpsellCard } from "./UpsellCard";

export function AwardsAndPrizes({ board }: { board: Board }) {
  const { season } = board;
  const selling = !DEMO && (season.phase === "upcoming" || season.phase === "entries");
  const drawing = board.sponsors
    .filter((s) => s.tier === "prize_partner")
    .sort((a, b) => a.name.localeCompare(b.name));
  const openAward = board.awards.some((award) => award.kind !== "readers_choice" && !awardSponsor(board, award));

  return (
    <section className="prizes" data-reveal>
      <div>
        <h2>The awards</h2>
        <p className="prizes-intro">
          Every deer is considered for each award it qualifies for, so there's no category to pick when you enter.
        </p>
        <ul className="award-list">
          {board.awards.map((award) => {
            // Readers' Choice falls back to the presenting sponsor, so its prize is unannounced
            // only while that slot is unsold.
            const sponsor = awardSponsor(board, award);
            return (
              <li key={award.id}>
                <h3>{award.label}</h3>
                <p>{award.description}</p>
                {sponsor ? (
                  <>
                    <p className="award-prize">Prize: {sponsor.prize}</p>
                    <SponsorCredit sponsor={sponsor} placement="awards-list" />
                  </>
                ) : (
                  selling && (
                    <p className="award-prize-tba">
                      {award.kind === "readers_choice" ? "Grand prize to be announced" : "Prize to be announced"}
                    </p>
                  )
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {(drawing.length > 0 || selling) && (
        <div>
          <h2>The prize drawing</h2>
          <p className="prizes-intro">
            Everyone with a deer on the board gets one ticket, however many deer they enter.
            {season.phase !== "winners" && ` Winners are announced ${apDate(season.winners_at)}.`}
          </p>
          {drawing.length > 0 ? (
            <ul className="drawing-list">
              {drawing.map((sponsor) => (
                <li key={sponsor.id}>
                  <p className="award-prize">{sponsor.prize}</p>
                  <SponsorCredit sponsor={sponsor} placement="prize-drawing" lead="From" />
                </li>
              ))}
            </ul>
          ) : (
            <p className="award-prize-tba">Prizes to be announced</p>
          )}
        </div>
      )}

      {/* Prize Partners have no limit, so there's always something to offer while entries are open. */}
      {selling && (
        <div className="prizes-sponsor">
          <UpsellCard
            pitch={
              !presentingSponsor(board)
                ? "Put your business on the Brag Board: in its title all season, on an award, or on a prize in the drawing."
                : openAward
                  ? "Put your business on an award, or add a prize to the drawing."
                  : "Add a prize to the drawing and reach every hunter who enters."
            }
            action="Sponsor the Brag Board"
            slot="awards and prizes"
          />
        </div>
      )}
    </section>
  );
}
