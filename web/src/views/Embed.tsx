// Front-page strip. One embed for the whole season: what it shows follows the calendar.
import { EntryCard } from "../components/EntryCard";
import { OpeningWeekend } from "../components/OpeningWeekend";
import { SponsorCredit } from "../components/SponsorCredit";
import { countEntries, countHarvested, loadAwardWinners, loadCatalog, loadFinalistEntries, loadGallery, loadSeason } from "../reads";
import { env } from "../env";
import { awardSponsor, gunOpenerLine, openingWeekend, phaseLine, presentingSponsor, thankYouSponsor } from "../phase";
import { entryPageUrl } from "../share";
import { photoUrl } from "../storage";
import { useLoad } from "../useLoad";

const BUCK = `${import.meta.env.BASE_URL}whitetail-buck-nps`;

async function loadEmbed() {
  const season = await loadSeason();
  if (season.phase === "winners") {
    const [catalog, entries, winners] = await Promise.all([
      loadCatalog(season.id),
      loadGallery(season.id),
      loadAwardWinners(season.id),
    ]);
    const board = { season, ...catalog };
    const picks = board.awards.flatMap((award) => {
      const winner = winners.find((w) => w.award_id === award.id);
      const entry = winner && entries.find((e) => e.id === winner.entry_id);
      return entry ? [{ award, entry }] : [];
    });
    return { board, count: entries.length, latest: [], picks, opener: null };
  }
  const weekend = openingWeekend(season);
  const voting = season.phase === "voting" || season.phase === "tallying";
  const [catalog, latest, count, opener] = await Promise.all([
    loadCatalog(season.id),
    // During the vote the strip shows the finalists; otherwise the six newest deer.
    // Seven: the newest large, the next six in two rows of three beside it.
    voting ? loadFinalistEntries(season.id) : loadGallery(season.id, 7),
    countEntries(season.id),
    weekend.on ? countHarvested(season.id, ...weekend.days) : Promise.resolve(null),
  ]);
  return { board: { season, ...catalog }, count, latest, picks: [], opener };
}

export function Embed() {
  const page = useLoad(loadEmbed);
  if (page.status === "loading") return <p className="status">Loading the Brag Board…</p>;
  if (page.status === "failed") return <p className="status">The Brag Board isn't loading right now. Try again in a few minutes.</p>;

  const { board, count, latest, picks, opener } = page.data;
  const { season } = board;
  const presenting = presentingSponsor(board);
  const gunLine = gunOpenerLine(season);
  const thankYou = season.phase === "entries" ? thankYouSponsor(board) : undefined;

  return (
    <section className="strip" aria-labelledby="strip-heading">
      <div className="strip-head">
        <h2 id="strip-heading" className="strip-title">
          <a href={env.galleryPageUrl} target="_top">
            Hunting Brag Board
          </a>
          {presenting && <span className="title-sponsor">presented by {presenting.name}</span>}
        </h2>
        {presenting && <SponsorCredit sponsor={presenting} placement="front-page" lead={null} />}
      </div>

      {/* "0 deer on the board" would greet readers on launch morning. */}
      {season.phase !== "upcoming" && count > 0 && (
        <p className="strip-count">
          <strong>{count}</strong> deer on the board
        </p>
      )}
      <p className="strip-line">
        {/* Why a reader would enter, before the dates. */}
        {(season.phase === "upcoming" || season.phase === "entries") && (
          <strong>Show off your deer. It's free to enter, and hunters of all ages are welcome. </strong>
        )}
        {phaseLine(season)} {gunLine}
        {thankYou && ` Every entrant whose deer goes on the board gets ${thankYou.prize}, from ${thankYou.name}.`}
      </p>

      {opener !== null && <OpeningWeekend board={board} count={opener} />}

      {latest.length > 0 && (
        <ul className="strip-photos">
          {latest.map((entry) => (
            <li key={entry.id}>
              <a href={entryPageUrl(entry.id, "front-page")} target="_top">
                <img src={photoUrl(entry.photo_id, "thumb")} alt={`${entry.hunter_name}'s deer`} loading="lazy" />
                <span>{entry.hunter_name}</span>
              </a>
            </li>
          ))}
        </ul>
      )}

      {/* Before the first deer, a picture of the thing itself, as on the board, so WPR's front page
          shows a deer and not just type: the Park Service's buck, at 800px unless the screen wants more. */}
      {latest.length === 0 && picks.length === 0 && (season.phase === "upcoming" || season.phase === "entries") && (
        <figure className="strip-empty">
          <img
            src={`${BUCK}-800.jpg`}
            srcSet={`${BUCK}-800.jpg 800w, ${BUCK}.jpg 1600w`}
            sizes="(max-width: 860px) 100vw, 820px"
            width={800}
            height={534}
            alt="A whitetail buck bedded in autumn bracken, antlers up beside a tree trunk"
            fetchPriority="high"
            decoding="async"
          />
          <figcaption>
            <strong>
              {season.phase === "entries"
                ? "Nothing on the board yet. Yours could be the first."
                : "The season's first deer goes up here."}
            </strong>
            <span className="strip-empty-credit">
              A whitetail buck in autumn bracken. Photo: David Restivo, National Park Service
            </span>
          </figcaption>
        </figure>
      )}

      {picks.length > 0 && (
        <div className="strip-winners">
          {picks.map(({ award, entry }) => (
            <EntryCard key={award.id} entry={entry} award={award.label} awardSponsor={awardSponsor(board, award)} />
          ))}
        </div>
      )}

      <div className="actions">
        {season.phase === "entries" && (
          <a className="button button-blaze" href={env.enterPageUrl} target="_top">
            Enter your deer
          </a>
        )}
        {season.phase === "voting" && (
          <a className="button button-blaze" href={env.galleryPageUrl} target="_top">
            Vote for Readers' Choice
          </a>
        )}
        <a className="button" href={env.galleryPageUrl} target="_top">
          {season.phase === "winners" ? "See every winner" : "See the board"}
        </a>
      </div>
    </section>
  );
}
