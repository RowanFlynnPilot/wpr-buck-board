// Dedicated page: every approved entry, filterable by the award each one qualifies for.
import { useState } from "react";
import { AwardsAndPrizes } from "../components/AwardsAndPrizes";
import { EntryCard } from "../components/EntryCard";
import { SponsorCredit } from "../components/SponsorCredit";
import { loadAwardWinners, loadCatalog, loadGallery, loadSeason } from "../data";
import { env } from "../env";
import { awardSponsor, gunOpenerLine, phaseLine, presentingSponsor } from "../phase";
import type { AwardKind } from "../types";
import { useLoad } from "../useLoad";

const PAGE_SIZE = 24;

async function loadGalleryPage() {
  const season = await loadSeason();
  const [catalog, entries, winners] = await Promise.all([
    loadCatalog(season.id),
    loadGallery(season.id),
    season.phase === "winners" ? loadAwardWinners(season.id) : Promise.resolve([]),
  ]);
  return { board: { season, ...catalog }, entries, winners };
}

export function Gallery() {
  const page = useLoad(loadGalleryPage);
  const [filter, setFilter] = useState<AwardKind | null>(null);
  const [shown, setShown] = useState(PAGE_SIZE);

  if (page.status === "loading") return <p className="status">Loading the Brag Board…</p>;
  if (page.status === "failed") return <p className="status">The Brag Board isn't loading right now. Try again in a few minutes.</p>;

  const { board, entries, winners } = page.data;
  const { season } = board;
  const presenting = presentingSponsor(board);
  // Every entry qualifies for Readers' Choice, so it isn't a useful filter.
  const filters = board.awards.filter((a) => a.kind !== "readers_choice");
  const selected = filters.find((a) => a.kind === filter);
  const selectedSponsor = selected && awardSponsor(board, selected);
  const visible = filter ? entries.filter((e) => e.award_kinds.includes(filter)) : entries;

  const choose = (kind: AwardKind | null) => {
    setFilter(kind);
    setShown(PAGE_SIZE);
  };

  return (
    <main className="gallery">
      <header className="masthead">
        <div className="masthead-title">
          <h1>
            Hunting Brag Board
            {presenting && <span className="title-sponsor">presented by {presenting.name}</span>}
          </h1>
          <p className="masthead-season">{season.year} season</p>
        </div>
        {presenting && <SponsorCredit sponsor={presenting} placement="board-title" lead={null} />}
        <p className="masthead-line">
          {season.phase !== "upcoming" && entries.length > 0 && <strong>{entries.length} deer on the board. </strong>}
          {phaseLine(season)} {gunOpenerLine(season)}
        </p>
        {season.phase === "entries" && (
          <a className="button button-blaze" href={env.enterPageUrl} target="_top">
            Enter your deer
          </a>
        )}
      </header>

      {winners.length > 0 && (
        <section className="winners" aria-labelledby="winners-heading">
          <h2 id="winners-heading">{season.year} winners</h2>
          <div className="entry-grid">
            {board.awards.flatMap((award) => {
              const winner = winners.find((w) => w.award_id === award.id);
              const entry = winner && entries.find((e) => e.id === winner.entry_id);
              return entry
                ? [<EntryCard key={award.id} entry={entry} award={award.label} awardSponsor={awardSponsor(board, award)} />]
                : [];
            })}
          </div>
        </section>
      )}

      {season.phase === "upcoming" ? (
        <AwardsAndPrizes board={board} />
      ) : (
        <>
          <nav className="filters" aria-label="Filter by award">
            <button type="button" aria-pressed={filter === null} onClick={() => choose(null)}>
              All deer
            </button>
            {filters.map((award) => (
              <button key={award.id} type="button" aria-pressed={filter === award.kind} onClick={() => choose(award.kind)}>
                {award.label}
              </button>
            ))}
          </nav>

          {selected && (
            <div className="award-panel">
              <div>
                <h2>{selected.label}</h2>
                <p>{selected.description}</p>
                {selectedSponsor && <p className="award-prize">Prize: {selectedSponsor.prize}</p>}
              </div>
              {selectedSponsor && <SponsorCredit sponsor={selectedSponsor} placement="award-filter" />}
            </div>
          )}

          {visible.length === 0 ? (
            <p className="empty">
              {season.phase === "entries" ? (
                <>
                  No deer here yet.{" "}
                  <a href={env.enterPageUrl} target="_top">
                    Enter yours
                  </a>{" "}
                  and it could be the first.
                </>
              ) : (
                "No deer here."
              )}
            </p>
          ) : (
            <div className="entry-grid">
              {visible.slice(0, shown).map((entry) => (
                <EntryCard key={entry.id} entry={entry} />
              ))}
            </div>
          )}

          {visible.length > shown && (
            <button type="button" className="button more" onClick={() => setShown(shown + PAGE_SIZE)}>
              Show more deer
            </button>
          )}

          <AwardsAndPrizes board={board} />
        </>
      )}
    </main>
  );
}
