// Dedicated page: every approved entry, filterable by the award each one qualifies for. A link
// to one deer (a share, or a photo on the front-page strip) opens it above the rest.
import { useEffect, useRef, useState } from "react";
import { track } from "../analytics";
import { AwardsAndPrizes } from "../components/AwardsAndPrizes";
import { CountyMap } from "../components/CountyMap";
import { EmptyLead } from "../components/EmptyLead";
import { LeadDeer } from "../components/LeadDeer";
import { EntryCard } from "../components/EntryCard";
import { OpeningWeekend } from "../components/OpeningWeekend";
import { ReadersChoice } from "../components/ReadersChoice";
import { SponsorCredit } from "../components/SponsorCredit";
import { loadAwardWinners, loadCatalog, loadFinalists, loadGallery, loadSeason } from "../data";
import { env } from "../env";
import { scrollIntoView } from "../host";
import { awardSponsor, gunOpenerLine, openingWeekend, phaseLine, presentingSponsor } from "../phase";
import { LINKED_ENTRY } from "../share";
import type { AwardKind } from "../types";
import { useLoad } from "../useLoad";
import { useReveal } from "../useReveal";

const PAGE_SIZE = 24;

async function loadGalleryPage() {
  const season = await loadSeason();
  const voting = season.phase === "voting" || season.phase === "tallying";
  const [catalog, entries, winners, finalists] = await Promise.all([
    loadCatalog(season.id),
    loadGallery(season.id),
    season.phase === "winners" ? loadAwardWinners(season.id) : Promise.resolve([]),
    voting ? loadFinalists(season.id) : Promise.resolve([]),
  ]);
  return { board: { season, ...catalog }, entries, winners, finalists };
}

export function Gallery() {
  const page = useLoad(loadGalleryPage);
  const [filter, setFilter] = useState<AwardKind | null>(null);
  const [shown, setShown] = useState(PAGE_SIZE);
  const ready = page.status === "ready";
  const linkedRef = useRef<HTMLElement>(null);

  // On a phone the title fills the first screen, so take the reader down to the deer they tapped.
  useEffect(() => {
    if (!ready || !LINKED_ENTRY) return;
    track("Entry Opened", { from: LINKED_ENTRY.from });
    if (linkedRef.current) void scrollIntoView(linkedRef.current);
  }, [ready]);

  // Cards and sections rise into view as the reader scrolls; re-armed whenever the list changes.
  useReveal([ready, filter, shown]);

  if (page.status === "loading") return <p className="status">Loading the Brag Board…</p>;
  if (page.status === "failed") return <p className="status">The Brag Board isn't loading right now. Try again in a few minutes.</p>;

  const { board, entries, winners, finalists } = page.data;
  const { season } = board;
  const presenting = presentingSponsor(board);
  const linkedId = LINKED_ENTRY?.id;
  const linked = linkedId ? entries.find((e) => e.id === linkedId) : undefined;
  const linkedWin = linked ? winners.find((w) => w.entry_id === linked.id) : undefined;
  const linkedAward = linkedWin ? board.awards.find((a) => a.id === linkedWin.award_id) : undefined;
  // Every entry qualifies for Readers' Choice, so it isn't a useful filter.
  const filters = board.awards.filter((a) => a.kind !== "readers_choice");
  const selected = filters.find((a) => a.kind === filter);
  const selectedSponsor = selected && awardSponsor(board, selected);
  const visible = filter ? entries.filter((e) => e.award_kinds.includes(filter)) : entries;
  // The newest deer opens the board, large; the grid takes the rest. Not when a link opened a deer
  // (that deer leads instead) or an award filter is on.
  const lead = !filter && !LINKED_ENTRY && season.phase !== "upcoming" ? visible[0] : undefined;
  const rest = lead ? visible.slice(1) : visible;
  // Before the first deer, and before entries open, a picture of the thing itself holds the lead.
  const empty = entries.length === 0 && !LINKED_ENTRY && (season.phase === "upcoming" || season.phase === "entries");
  // What a deer's Story image names: the season and the presenting sponsor.
  const storyFacts = { year: season.year, presenting };
  const weekend = openingWeekend(season);
  const openerDeer = weekend.on ? entries.filter((e) => weekend.days.includes(e.harvest_date)) : [];
  // Entries come newest first, so the last opening-day buck is the first one posted.
  const firstOpenerBuck = openerDeer.filter((e) => e.harvest_date === weekend.days[0] && e.deer_type === "buck").at(-1);

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

      {LINKED_ENTRY &&
        (linked ? (
          <section ref={linkedRef} className="linked-entry" aria-label="The deer from your link">
            <EntryCard
              entry={linked}
              award={linkedAward?.label}
              awardSponsor={linkedAward ? awardSponsor(board, linkedAward) : undefined}
              share
              storyFacts={storyFacts}
              featured
            />
          </section>
        ) : (
          <p className="linked-missing">The deer from that link isn't on the board.</p>
        ))}

      {winners.length > 0 && (
        <section className="winners" aria-labelledby="winners-heading">
          <h2 id="winners-heading">{season.year} winners</h2>
          <div className="entry-grid">
            {board.awards.flatMap((award) => {
              const winner = winners.find((w) => w.award_id === award.id);
              const entry = winner && entries.find((e) => e.id === winner.entry_id);
              return entry
                ? [<EntryCard key={award.id} entry={entry} award={award.label} awardSponsor={awardSponsor(board, award)} share storyFacts={storyFacts} />]
                : [];
            })}
          </div>
        </section>
      )}

      {finalists.length > 0 && (
        <ReadersChoice
          season={season}
          finalists={entries.filter((e) => finalists.includes(e.id))}
          presenting={presenting}
          storyFacts={storyFacts}
        />
      )}

      {weekend.on && (
        <OpeningWeekend board={board} count={openerDeer.length} first={firstOpenerBuck} storyFacts={storyFacts} />
      )}

      {season.phase === "upcoming" ? (
        <>
          {empty && <EmptyLead season={season} />}
          <AwardsAndPrizes board={board} />
        </>
      ) : (
        <>
          {lead && <LeadDeer entry={lead} storyFacts={storyFacts} />}
          {empty && <EmptyLead season={season} />}

          {entries.length > 0 && (
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
          )}

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

          {empty ? null : visible.length === 0 ? (
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
              {rest.slice(0, shown).map((entry) => (
                <EntryCard key={entry.id} entry={entry} share storyFacts={storyFacts} />
              ))}
            </div>
          )}

          {rest.length > shown && (
            <button type="button" className="button more" onClick={() => setShown(shown + PAGE_SIZE)}>
              Show more deer
            </button>
          )}

          <CountyMap entries={entries} />

          <AwardsAndPrizes board={board} />
        </>
      )}
    </main>
  );
}
