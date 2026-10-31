// What entrants can win: each award with its prize and presenting sponsor, and the
// Prize Partner drawing. The whole page before entries open; the foot of it after.
// Each award wears a rosette, and Readers' Choice, the grand prize, leads in a card of its own.
// An award with no sponsor is an honor, shown without a prize line. Until entries close,
// Readers' Choice or a drawing with no prize yet tells readers its prize is to be announced,
// and the section ends with one card for businesses: one ask, not one per award.
import { apDate, apDay, apNumber } from "../format";
import { awardSponsor, grandPrizeFirst, lastWeeklyFriday, presentingSponsor, thankYouSponsor, weeklySponsor } from "../phase";
import { DEMO } from "../sales";
import { Rosette } from "./Rosette";
import type { Board, Sponsor } from "../types";
import { SponsorCredit } from "./SponsorCredit";
import { UpsellCard } from "./UpsellCard";

export function AwardsAndPrizes({ board }: { board: Board }) {
  const { season } = board;
  const selling = !DEMO && (season.phase === "upcoming" || season.phase === "entries");
  const drawing = drawingPrizes(board.sponsors);
  const awards = grandPrizeFirst(board.awards);
  const openAward = board.awards.some((award) => award.kind !== "readers_choice" && !awardSponsor(board, award));
  // Both run while entries are open; afterward the awards and the drawing are what's left to win.
  const running = season.phase === "upcoming" || season.phase === "entries";
  const weekly = running ? weeklySponsor(board) : undefined;
  const thankYou = running ? thankYouSponsor(board) : undefined;

  return (
    <section className="prizes" data-reveal>
      <div>
        <h2>The awards</h2>
        <p className="prizes-intro">
          Every deer is considered for each award it qualifies for, so there's no category to pick when you enter.
        </p>
        <ul className="award-list">
          {awards.map((award) => {
            // Readers' Choice falls back to the presenting sponsor, so its prize is unannounced
            // only while that slot is unsold. Any other award without a sponsor is an honor.
            const sponsor = awardSponsor(board, award);
            const grand = award.kind === "readers_choice";
            return (
              <li key={award.id} className={grand ? "award-grand" : undefined}>
                <Rosette grand={grand} />
                <div className="award-body">
                  <h3>{award.label}</h3>
                  <p>{award.description}</p>
                  {sponsor ? (
                    <>
                      <p className="award-prize">
                        {grand ? "Grand prize" : "Prize"}: {sponsor.prize}
                      </p>
                      <SponsorCredit sponsor={sponsor} placement="awards-list" />
                    </>
                  ) : (
                    selling && grand && <p className="award-prize-tba">Grand prize to be announced</p>
                  )}
                </div>
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
              {drawing.map(({ sponsor, count }) => (
                <li key={sponsor.id}>
                  <p className="award-prize">{sponsor.prize}</p>
                  {count > 1 && <p className="drawing-count">{apNumber(count).replace(/^./, (c) => c.toUpperCase())} winners</p>}
                  <SponsorCredit sponsor={sponsor} placement="prize-drawing" lead="From" />
                </li>
              ))}
            </ul>
          ) : (
            <p className="award-prize-tba">Prizes to be announced</p>
          )}
        </div>
      )}

      {weekly && (
        <div>
          <h2>Deer of the Week</h2>
          <p className="prizes-intro">
            Every Friday through {apDay(lastWeeklyFriday(season))}, our editors pick one deer from the board.
          </p>
          <ul className="drawing-list">
            <li>
              <p className="award-prize">Each week: {weekly.prize}</p>
              <SponsorCredit sponsor={weekly} placement="awards-list" lead="From" />
            </li>
          </ul>
        </div>
      )}

      {thankYou && (
        <div>
          <h2>A thank-you for every entrant</h2>
          <p className="prizes-intro">Everyone whose deer goes on the board gets it, by email, when the deer is posted.</p>
          <ul className="drawing-list">
            <li>
              <p className="award-prize">{thankYou.prize}</p>
              <SponsorCredit sponsor={thankYou} placement="awards-list" lead="From" />
            </li>
          </ul>
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
                  : !thankYouSponsor(board)
                    ? "Give every entrant a thank-you from your business, or add a prize to the drawing."
                    : !weeklySponsor(board)
                      ? "Present Deer of the Week, or add a prize to the drawing."
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

// The drawing's prizes, by giver. A business giving several of one prize (six sets of tickets)
// has a Prize Partner row for each, so each is drawn and redrawn on its own; the board lists it
// once, with how many winners it has.
function drawingPrizes(sponsors: Sponsor[]): { sponsor: Sponsor; count: number }[] {
  const prizes: { sponsor: Sponsor; count: number }[] = [];
  for (const sponsor of sponsors.filter((s) => s.tier === "prize_partner").sort((a, b) => a.name.localeCompare(b.name))) {
    const same = prizes.find((p) => p.sponsor.name === sponsor.name && p.sponsor.prize === sponsor.prize);
    if (same) same.count += 1;
    else prizes.push({ sponsor, count: 1 });
  }
  return prizes;
}
