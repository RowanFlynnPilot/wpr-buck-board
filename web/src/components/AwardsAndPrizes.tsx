// What entrants can win: each award with its prize and presenting sponsor, and the
// Prize Partner drawing. The whole page before entries open; the foot of it after.
// Until entries close, an unsold slot shows who to call about it instead of an empty space.
import { apDate } from "../format";
import { awardSponsor } from "../phase";
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

  return (
    <section className="prizes">
      <div>
        <h2>The awards</h2>
        <p className="prizes-intro">
          Every deer is considered for each award it qualifies for, so there's no category to pick when you enter.
        </p>
        <ul className="award-list">
          {board.awards.map((award) => {
            // Readers' Choice falls back to the presenting sponsor, so it only goes unsponsored
            // (and shows the presenting upsell) while that slot is unsold.
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
                  selling &&
                  (award.kind === "readers_choice" ? (
                    <UpsellCard
                      pitch="Put your name on the Brag Board itself: in its title, on the front page all season, and on the grand prize."
                      action="Book the presenting sponsorship"
                      slot="presenting sponsor"
                    />
                  ) : (
                    <UpsellCard
                      pitch={`Put your business on the ${award.label} award.`}
                      action="Book this award"
                      slot={`${award.label} award`}
                    />
                  ))
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
            Everyone who enters gets one ticket, however many deer they enter.
            {season.phase !== "winners" && ` Winners are announced ${apDate(season.winners_at)}.`}
          </p>
          <ul className="drawing-list">
            {drawing.map((sponsor) => (
              <li key={sponsor.id}>
                <p className="award-prize">{sponsor.prize}</p>
                <SponsorCredit sponsor={sponsor} placement="prize-drawing" lead="From" />
              </li>
            ))}
            {selling && (
              <li>
                <UpsellCard
                  pitch="Add a prize to the drawing and reach every hunter who enters."
                  action="Become a Prize Partner"
                  slot="Prize Partner"
                />
              </li>
            )}
          </ul>
        </div>
      )}
    </section>
  );
}
