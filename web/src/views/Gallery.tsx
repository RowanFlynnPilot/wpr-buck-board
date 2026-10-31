// Dedicated page: every approved entry, filterable by the award each one qualifies for. A link
// to one deer (a share, or a photo on the front-page strip) opens it above the rest.
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { track } from "../analytics";
import { AwardsAndPrizes } from "../components/AwardsAndPrizes";
import { CountyMap } from "../components/CountyMap";
import { DeerOfTheWeek } from "../components/DeerOfTheWeek";
import { EmptyLead } from "../components/EmptyLead";
import { LeadDeer } from "../components/LeadDeer";
import { EntryCard } from "../components/EntryCard";
import { OpeningWeekend } from "../components/OpeningWeekend";
import { SponsorCredit } from "../components/SponsorCredit";
import { loadAwardWinners, loadCatalog, loadDnrTally, loadFinalists, loadGallery, loadSeason, loadWeeklyPicks } from "../reads";
import { scrollIntoView, viewLink } from "../host";
import {
  awardSponsor,
  grandPrizeFirst,
  gunOpenerLine,
  openingWeekend,
  phaseLine,
  presentingSponsor,
  thankYouSponsor,
  weeklySponsor,
} from "../phase";
import { LINKED_ENTRY } from "../share";
import type { AwardKind } from "../types";
import { useLoad } from "../useLoad";
import { useReveal } from "../useReveal";

// Set once the board has shown the deer a link opened (see linkedEntry below).
let linkedShown = false;

const PAGE_SIZE = 24;

// The ballot signs readers in, so it brings the Supabase client; it's fetched only for the vote.
const ReadersChoice = lazy(() => import("../components/ReadersChoice").then((m) => ({ default: m.ReadersChoice })));

async function loadGalleryPage() {
  const season = await loadSeason();
  const voting = season.phase === "voting" || season.phase === "tallying";
  const [catalog, entries, winners, finalists, weekly, dnr] = await Promise.all([
    loadCatalog(season.id),
    loadGallery(season.id),
    season.phase === "winners" ? loadAwardWinners(season.id) : Promise.resolve([]),
    voting ? loadFinalists(season.id) : Promise.resolve([]),
    season.phase === "upcoming" ? Promise.resolve([]) : loadWeeklyPicks(season.id),
    season.phase === "upcoming" ? Promise.resolve(null) : loadDnrTally(season.id),
  ]);
  return { board: { season, ...catalog }, entries, winners, finalists, weekly, dnr };
}

export function Gallery() {
  const page = useLoad(loadGalleryPage);
  const [filter, setFilter] = useState<AwardKind | null>(null);
  const [shown, setShown] = useState(PAGE_SIZE);
  const ready = page.status === "ready";
  const linkedRef = useRef<HTMLElement>(null);
  // The deer a link opened leads the board's first showing only: back on the board after the form
  // (views switch inside the frame, without a reload) the reader gets the front, and the link isn't
  // counted twice.
  const [linkedEntry] = useState(() => (linkedShown ? null : LINKED_ENTRY));
  useEffect(() => {
    linkedShown = true;
  }, []);

  // On a phone the title fills the first screen, so take the reader down to the deer they tapped.
  useEffect(() => {
    if (!ready || !linkedEntry) return;
    track("Entry Opened", { from: linkedEntry.from });
    if (linkedRef.current) void scrollIntoView(linkedRef.current);
  }, [ready, linkedEntry]);

  // Cards and sections rise into view as the reader scrolls; re-armed whenever the list changes.
  useReveal([ready, filter, shown]);

  if (page.status === "loading") return <p className="status">Loading the Brag Board…</p>;
  if (page.status === "failed") return <p className="status">The Brag Board isn't loading right now. Try again in a few minutes.</p>;

  const { board, entries, winners, finalists, weekly, dnr } = page.data;
  const { season } = board;
  const presenting = presentingSponsor(board);
  const linkedId = linkedEntry?.id;
  const linked = linkedId ? entries.find((e) => e.id === linkedId) : undefined;
  const linkedWin = linked ? winners.find((w) => w.entry_id === linked.id) : undefined;
  const linkedAward = linkedWin ? board.awards.find((a) => a.id === linkedWin.award_id) : undefined;
  // Every entry qualifies for Readers' Choice, so it isn't a useful filter.
  const filters = board.awards.filter((a) => a.kind !== "readers_choice");
  const selected = filters.find((a) => a.kind === filter);
  const selectedSponsor = selected && awardSponsor(board, selected);
  const visible = filter ? entries.filter((e) => e.award_kinds.includes(filter)) : entries;
  // The newest deer opens the board, large. While the board fills up it stands in the front, beside
  // the title, whatever the filter (the list below then holds every deer that qualifies); during the
  // vote and after, the ballot and the winners lead, and the newest deer waits above the filters,
  // dropped for a filter. Not when a link opened a deer: that deer leads instead.
  const filling = season.phase === "upcoming" || season.phase === "entries" || season.phase === "judging";
  const newest = !linkedEntry && season.phase !== "upcoming" ? entries[0] : undefined;
  // Before the first deer, and before entries open, a picture of the thing itself holds the front.
  const empty = entries.length === 0 && !linkedEntry && (season.phase === "upcoming" || season.phase === "entries");
  const front = filling && (newest !== undefined || empty);
  const lead = front || !filter ? newest : undefined;
  const rest = lead && !filter ? visible.slice(1) : visible;
  const thankYou = thankYouSponsor(board);
  // Every Deer of the Week wears a tag all season; the latest leads its band after the front.
  const weekOf = (id: string) => weekly.find((w) => w.entry_id === id)?.week_of;
  const latestWeekly = weekly[0] && entries.find((e) => e.id === weekly[0].entry_id);
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
      {/* While the board fills up, the title and the newest deer are one composition: the front. */}
      <div className={front ? "front" : "board-title"}>
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
          {thankYou && (season.phase === "upcoming" || season.phase === "entries") && (
            <p className="masthead-thanks">
              Every entrant whose deer goes on the board gets <strong>{thankYou.prize}</strong>, from {thankYou.name}.
            </p>
          )}
          {season.phase === "entries" && (
            <a className="button button-blaze" {...viewLink("enter")}>
              Enter your deer
            </a>
          )}
        </header>
        {front &&
          (newest ? (
            <LeadDeer entry={newest} storyFacts={storyFacts} weekOf={weekOf(newest.id)} />
          ) : (
            <EmptyLead season={season} />
          ))}
      </div>

      {linkedEntry &&
        (linked ? (
          <section ref={linkedRef} className="linked-entry" aria-label="The deer from your link">
            <EntryCard
              entry={linked}
              award={linkedAward?.label}
              awardSponsor={linkedAward ? awardSponsor(board, linkedAward) : undefined}
              share
              storyFacts={storyFacts}
              featured
              weekOf={weekOf(linked.id)}
            />
          </section>
        ) : (
          <p className="linked-missing">The deer from that link isn't on the board.</p>
        ))}

      {winners.length > 0 && (
        <section className="winners" aria-labelledby="winners-heading">
          <h2 id="winners-heading">{season.year} winners</h2>
          <div className="entry-grid">
            {grandPrizeFirst(board.awards).flatMap((award) => {
              const winner = winners.find((w) => w.award_id === award.id);
              const entry = winner && entries.find((e) => e.id === winner.entry_id);
              return entry
                ? [
                    <EntryCard
                      key={award.id}
                      entry={entry}
                      award={award.label}
                      awardSponsor={awardSponsor(board, award)}
                      ribbon={award.kind === "readers_choice" ? "grand" : "award"}
                      share
                      storyFacts={storyFacts}
                    />,
                  ]
                : [];
            })}
          </div>
        </section>
      )}

      {finalists.length > 0 && (
        <Suspense fallback={<p className="status">Loading the ballot…</p>}>
          <ReadersChoice
            season={season}
            finalists={entries.filter((e) => finalists.includes(e.id))}
            presenting={presenting}
            storyFacts={storyFacts}
          />
        </Suspense>
      )}

      {weekend.on && (
        <OpeningWeekend board={board} count={openerDeer.length} first={firstOpenerBuck} storyFacts={storyFacts} />
      )}

      {season.phase === "entries" && (latestWeekly || weeklySponsor(board)) && (
        <DeerOfTheWeek
          board={board}
          pick={latestWeekly && { entry: latestWeekly, weekOf: weekly[0].week_of }}
          storyFacts={storyFacts}
        />
      )}

      {season.phase === "upcoming" ? (
        <AwardsAndPrizes board={board} />
      ) : (
        <>
          {lead && !front && (
            <div className="lead" data-reveal>
              <LeadDeer entry={lead} storyFacts={storyFacts} weekOf={weekOf(lead.id)} />
            </div>
          )}

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
                  <a {...viewLink("enter")}>
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
                <EntryCard key={entry.id} entry={entry} share storyFacts={storyFacts} weekOf={weekOf(entry.id)} />
              ))}
            </div>
          )}

          {rest.length > shown && (
            <button type="button" className="button more" onClick={() => setShown(shown + PAGE_SIZE)}>
              Show more deer
            </button>
          )}

          <CountyMap entries={entries} dnr={dnr} />

          <AwardsAndPrizes board={board} />
        </>
      )}
    </main>
  );
}
