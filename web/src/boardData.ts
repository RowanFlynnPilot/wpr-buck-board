// The board's reads, started as soon as the app starts when the board is the page (Nov. 20). They
// used to wait for the board's own code to arrive first, half a second on a phone, and the newest
// deer's photo waited on them. Part of the app's first download, so it starts with it.
import { loadAwardWinners, loadCatalog, loadDnrTally, loadFinalists, loadGallery, loadSeason, loadWeeklyPicks } from "./reads";

export async function loadGalleryPage() {
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

let early: ReturnType<typeof loadGalleryPage> | null = null;

// Called once at startup on the board's page.
export function startGalleryPage() {
  early ??= loadGalleryPage();
  // The board attaches its own handlers when it takes this; until then, a failure isn't unhandled.
  early.catch(() => undefined);
}

// The board takes the early start once; a retry (or a later visit to the board) loads afresh.
export function galleryPage() {
  const started = early;
  early = null;
  return started ?? loadGalleryPage();
}
