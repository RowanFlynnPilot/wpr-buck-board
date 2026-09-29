// Front-page strip. One embed for the whole season: what it shows follows the calendar.
import { EntryCard } from "../components/EntryCard";
import { SponsorCredit } from "../components/SponsorCredit";
import { countEntries, loadAwardWinners, loadCatalog, loadGallery, loadSeason } from "../data";
import { env } from "../env";
import { gunOpenerLine, phaseLine, presentingSponsor } from "../phase";
import { photoUrl } from "../supabase";
import { useLoad } from "../useLoad";

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
    return { board, count: entries.length, latest: [], picks };
  }
  const [catalog, latest, count] = await Promise.all([
    loadCatalog(season.id),
    loadGallery(season.id, 6),
    countEntries(season.id),
  ]);
  return { board: { season, ...catalog }, count, latest, picks: [] };
}

export function Embed() {
  const page = useLoad(loadEmbed);
  if (page.status === "loading") return <p className="status">Loading the Brag Board…</p>;
  if (page.status === "failed") return <p className="status">The Brag Board isn't loading right now. Try again in a few minutes.</p>;

  const { board, count, latest, picks } = page.data;
  const { season } = board;
  const presenting = presentingSponsor(board);
  const gunLine = gunOpenerLine(season);

  return (
    <section className="strip">
      <div className="strip-head">
        <h2 className="strip-title">
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
        {phaseLine(season)} {gunLine}
      </p>

      {latest.length > 0 && (
        <ul className="strip-photos">
          {latest.map((entry) => (
            <li key={entry.id}>
              <a href={env.galleryPageUrl} target="_top">
                <img src={photoUrl(entry.photo_id, "thumb")} alt={`${entry.hunter_name}'s deer`} loading="lazy" />
                <span>{entry.hunter_name}</span>
              </a>
            </li>
          ))}
        </ul>
      )}

      {picks.length > 0 && (
        <div className="strip-winners">
          {picks.map(({ award, entry }) => (
            <EntryCard key={award.id} entry={entry} award={award.label} />
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
