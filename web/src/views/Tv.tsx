// The counter TV (Nov. 20): the board as a slideshow for a TV at a sponsor's counter or a deer
// processor's, opened full screen in the TV's own browser (or a streaming stick's) and left
// running. One deer at a time, the whole photo as a print beside the hunter's name, the deer and a
// few lines of the story; beside it the board's title and presenting sponsor, the count and a QR
// code to the board. What it shows follows the calendar like the strip: the deer while entries are
// open, the finalists during the vote, the winners from winners day.
//
//   /wpr-buck-board/?at=burks-bar#/tv   — `at` picks the location's QR code (web/public/tv-qr/,
//                                          made by print/tv-qr/make_tv_qr.py) and, for an award
//                                          sponsor, its own credit; anything else uses the general code.
//
// It re-reads the board every five minutes (a new deer joins the loop), keeps the last good board
// if a read fails, holds the screen awake where the browser allows it, reloads itself every six
// hours for a new build, and a remote's arrow keys step through the deer.
import { useEffect, useRef, useState } from "react";
import { galleryPage, loadGalleryPage } from "../boardData";
import { CropPhoto } from "../components/CropPhoto";
import { EntryTags } from "../components/EntryTags";
import { Rosette } from "../components/Rosette";
import { apDay, apNumber, describeDeer, tidyStory, WEAPON_LABELS } from "../format";
import { grandPrizeFirst, isNew, NEW_DAYS, phaseLine, presentingSponsor } from "../phase";
import { contentBox } from "../photoTrim";
import { logoUrl, photoUrl } from "../storage";
import type { GalleryEntry, Sponsor } from "../types";

const BASE = import.meta.env.BASE_URL;
// Locations with a QR code of their own in web/public/tv-qr/.
const LOCATIONS = ["angelos-family-pizza", "burks-bar"];
const SLIDE_SECONDS = 10;
const REFRESH_MS = 5 * 60_000;
const RELOAD_MS = 6 * 60 * 60_000;

type Page = Awaited<ReturnType<typeof loadGalleryPage>>;
interface Slide {
  entry: GalleryEntry;
  award?: { label: string; grand: boolean };
}

function where(): string {
  const at = new URLSearchParams(window.location.search).get("at") ?? "";
  return LOCATIONS.includes(at) ? at : "tv";
}

function slidesOf(page: Page): Slide[] {
  const { board, entries, winners, finalists } = page;
  const { phase } = board.season;
  if (phase === "winners") {
    return grandPrizeFirst(board.awards).flatMap((award) => {
      const winner = winners.find((w) => w.award_id === award.id);
      const entry = winner && entries.find((e) => e.id === winner.entry_id);
      return entry ? [{ entry, award: { label: award.label, grand: award.kind === "readers_choice" } }] : [];
    });
  }
  if (phase === "voting" || phase === "tallying") return entries.filter((e) => finalists.includes(e.id)).map((entry) => ({ entry }));
  return entries.map((entry) => ({ entry }));
}

export function Tv() {
  const [page, setPage] = useState<Page | null>(null);
  const [failed, setFailed] = useState(false);
  const [index, setIndex] = useState(0);
  const [tick, setTick] = useState(0);
  const location = useRef(where());
  // A TV browser shows its own bars; the first press of OK on the remote fills the screen. The
  // button goes once it's used, or after half a minute.
  const fullRef = useRef<HTMLButtonElement>(null);
  const [offerFull, setOfferFull] = useState(() => !!document.fullscreenEnabled && !document.fullscreenElement);
  useEffect(() => {
    if (!offerFull) return;
    fullRef.current?.focus();
    const done = () => document.fullscreenElement && setOfferFull(false);
    const timer = window.setTimeout(() => setOfferFull(false), 30_000);
    document.addEventListener("fullscreenchange", done);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("fullscreenchange", done);
    };
  }, [offerFull, page]);

  // The board, now and every five minutes; a failed read keeps what's on screen.
  useEffect(() => {
    let live = true;
    const read = (first: boolean) =>
      (first ? galleryPage() : loadGalleryPage()).then(
        (next) => live && (setPage(next), setFailed(false)),
        (error: Error) => {
          console.error(error);
          if (live) setFailed(true);
        },
      );
    void read(true);
    const timer = window.setInterval(() => void read(false), REFRESH_MS);
    const reload = window.setTimeout(() => navigator.onLine && window.location.reload(), RELOAD_MS);
    return () => {
      live = false;
      window.clearInterval(timer);
      window.clearTimeout(reload);
    };
  }, []);

  const slides = page ? slidesOf(page) : [];
  const count = slides.length;
  const current = count ? index % count : 0;

  // The next deer every ten seconds; a step by remote starts the ten seconds over.
  useEffect(() => {
    if (count < 2) return;
    const timer = window.setTimeout(() => setIndex((i) => (i + 1) % count), SLIDE_SECONDS * 1000);
    return () => window.clearTimeout(timer);
  }, [current, count, tick]);

  // A remote's arrow keys (most TV browsers send them) step through the deer.
  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      if (!count || (e.key !== "ArrowRight" && e.key !== "ArrowLeft")) return;
      e.preventDefault();
      setIndex((i) => (i + (e.key === "ArrowRight" ? 1 : count - 1)) % count);
      setTick((t) => t + 1);
    };
    window.addEventListener("keydown", keys);
    return () => window.removeEventListener("keydown", keys);
  }, [count]);

  // Keep the screen on where the browser allows it (it lets go when the page is hidden).
  useEffect(() => {
    let lock: { release(): Promise<void> } | null = null;
    const hold = async () => {
      try {
        lock = (await (navigator as Navigator & { wakeLock?: { request(type: "screen"): Promise<{ release(): Promise<void> }> } }).wakeLock?.request("screen")) ?? null;
      } catch {
        // Not allowed here; the TV's own settings decide.
      }
    };
    const again = () => document.visibilityState === "visible" && void hold();
    void hold();
    document.addEventListener("visibilitychange", again);
    return () => {
      document.removeEventListener("visibilitychange", again);
      void lock?.release();
    };
  }, []);

  // The next deer's photo, fetched ahead so it's there when its turn comes.
  useEffect(() => {
    if (count < 2) return;
    new Image().src = photoUrl(slides[(current + 1) % count].entry.photo_id, "full");
  }, [current, count, page]);

  if (!page) {
    return <main className="tv tv-waiting">{failed ? "The Brag Board isn't loading right now. Trying again soon." : "Loading the Brag Board…"}</main>;
  }

  const { board, weekly } = page;
  const { season } = board;
  const presenting = presentingSponsor(board);
  // A location's own credit, for an award sponsor; the presenting sponsor is in the title already.
  const here =
    location.current === "tv" ? undefined : board.sponsors.find((s) => s.qr_slug === location.current && s.tier !== "presenting");
  const hereAward = here && board.awards.find((a) => a.sponsor_id === here.id);
  const slide = count ? slides[current] : null;
  const fresh = page.entries.filter((e) => isNew(season, e.created_at)).length;

  return (
    <main className="tv">
      {offerFull && (
        <button
          ref={fullRef}
          type="button"
          className="tv-full"
          onClick={() => void document.documentElement.requestFullscreen?.().catch(() => setOfferFull(false))}
        >
          Full screen
        </button>
      )}
      <section className="tv-stage">
        {slide ? (
          <TvDeer key={slide.entry.id} slide={slide} season={season} weekOf={weekly.find((w) => w.entry_id === slide.entry.id)?.week_of} />
        ) : (
          <figure className="tv-print tv-print-buck" key="buck">
            <img src={`${BASE}whitetail-buck-nps.jpg`} alt="" />
            <figcaption>A whitetail buck. Photo: David Restivo, National Park Service</figcaption>
          </figure>
        )}
      </section>

      <aside className="tv-side">
        <header className="tv-flag">
          <img className="tv-badge" src={`${BASE}wpr-typewriter-badge.png`} alt="" />
          <img className="tv-wordmark" src={`${BASE}wpr-wordmark.png`} alt="Wausau Pilot & Review" />
        </header>
        <h1 className="tv-title">Hunting Brag Board</h1>
        {presenting && (
          <p className="tv-presented">
            <SponsorMark sponsor={presenting} /> <span>presented by {presenting.name}</span>
          </p>
        )}

        {page.entries.length > 0 && season.phase !== "upcoming" && (
          <p className="tv-count">
            <strong>{page.entries.length.toLocaleString("en-US")}</strong>{" "}
            <span>
              deer on the board
              {fresh > 0 && season.phase === "entries" && (
                <small>
                  {" "}
                  {apNumber(fresh)} new in the last {apNumber(NEW_DAYS)} days
                </small>
              )}
            </span>
          </p>
        )}

        <div className="tv-cta">
          <p className="tv-ask">{ask(season.phase)}</p>
          <div className="tv-scan">
            <img className="tv-qr" src={`${BASE}tv-qr/${location.current}.svg`} alt="" />
            <div>
              <p className="tv-scan-label">{scan(season.phase)}</p>
              <p className="tv-line">{phaseLine(season)}</p>
            </div>
          </div>
          {here && hereAward && (
            <p className="tv-here">
              <SponsorMark sponsor={here} small /> <span>{hereAward.label} award presented by {here.name}</span>
            </p>
          )}
        </div>

        {count > 1 && (
          <p className="tv-dots" aria-hidden="true">
            {slides.map((s, i) => (
              <span key={s.entry.id} className={i === current ? "on" : undefined} />
            ))}
          </p>
        )}
      </aside>
    </main>
  );
}

function ask(phase: string): string {
  if (phase === "voting") return "Pick the Readers’ Choice.";
  if (phase === "winners") return "Meet this season’s winners.";
  if (phase === "tallying" || phase === "judging") return "See this season’s deer.";
  return "Got your deer? Put it on the board.";
}

function scan(phase: string): string {
  if (phase === "voting") return "Scan to vote";
  if (phase === "entries") return "Scan to enter. It’s free.";
  return "Scan to see the board";
}

function SponsorMark({ sponsor, small = false }: { sponsor: Sponsor; small?: boolean }) {
  return sponsor.logo_path ? (
    <span className={small ? "tv-logo tv-logo-small" : "tv-logo"}>
      <img src={logoUrl(sponsor.logo_path)} alt={sponsor.name} />
    </span>
  ) : small ? null : (
    <span className="tv-logo tv-logo-name">{sponsor.name}</span>
  );
}

// One deer: the whole photo in its own shape (clear of a screenshot's bands, like the pop-up),
// as a print, beside its words.
function TvDeer({ slide, season, weekOf }: { slide: Slide; season: Page["board"]["season"]; weekOf?: string }) {
  const { entry, award } = slide;
  const full = photoUrl(entry.photo_id, "full");
  const thumb = photoUrl(entry.photo_id, "thumb");
  const [ratio, setRatio] = useState<number | null>(null);
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const box = contentBox(img, img.naturalWidth, img.naturalHeight);
      setRatio(box.w / box.h);
    };
    img.src = thumb;
    return () => {
      img.onload = null;
    };
  }, [thumb]);
  const deer = describeDeer(entry.deer_type, entry.points);
  const story = entry.story && tidyStory(entry.story);
  return (
    <div className="tv-deer">
      <figure className="tv-print" style={ratio ? { ["--ratio" as string]: String(ratio) } : undefined}>
        <span className="tv-frame">
          <CropPhoto src={full} preview={thumb} alt="" />
          <EntryTags firstDeer={entry.first_deer} weekOf={weekOf} fresh={isNew(season, entry.created_at)} />
        </span>
        {award && <Rosette grand={award.grand} className="tv-rosette" />}
      </figure>
      <div className="tv-words">
        {award && <p className="tv-award">{award.label}</p>}
        <h2>{entry.hunter_name}</h2>
        <p className="tv-record">
          {deer}, {WEAPON_LABELS[entry.weapon].toLowerCase()}
          <br />
          {entry.hometown} · {entry.county} County, {apDay(entry.harvest_date)}
        </p>
        {story && <p className="tv-story">{story}</p>}
        {entry.photo_credit && <p className="tv-credit">Photo: {entry.photo_credit}</p>}
      </div>
    </div>
  );
}
