// Staff: the Brag Board section for Friday's newsletter (the entry form promises readers
// "new Brag Board entries every Friday"). Pick the deer, check the preview, copy the HTML,
// paste it into a Custom HTML block in the Noptin campaign before it sends.
import { useState } from "react";
import { countEntries, loadCatalog, loadPostedSince, loadSeason, loadWeeklyPicks, setWeeklyPick } from "../data";
import { env } from "../env";
import {
  addDays,
  apDate,
  apDay,
  describeDeer,
  fridayOnOrAfter,
  possessive,
  todayInWausau,
  wausauMidnight,
} from "../format";
import { MAX_DEER, NOPTIN_BLOCK_LIMIT, newsletterRows, wrapForNoptin } from "../newsletter";
import { lastWeeklyFriday, presentingSponsor, weeklySponsor } from "../phase";
import { drawFeedCard } from "../shareCard";
import { photoUrl } from "../storage";
import type { Board, PostedEntry, Sponsor, WeeklyPick } from "../types";
import { useLoad } from "../useLoad";

// Three rows of two unless an editor picks more.
const DEFAULT_PICKS = 6;

// The newsletter's own faces, so the preview looks like the email rather than the admin page.
const PREVIEW_FONTS =
  "https://fonts.googleapis.com/css2?family=Merriweather:wght@700&family=Oswald:wght@700&family=Source+Sans+3:wght@400;700&display=swap";

async function loadBoard() {
  const season = await loadSeason();
  const [catalog, onBoard, weekly] = await Promise.all([
    loadCatalog(season.id),
    countEntries(season.id),
    loadWeeklyPicks(season.id),
  ]);
  return { board: { season, ...catalog }, onBoard, weekly };
}

export function NewsletterBlock() {
  const page = useLoad(loadBoard);
  const today = todayInWausau();
  const weekAgo = addDays(today, -7);
  const [since, setSince] = useState(weekAgo);

  if (page.status === "loading") return <p className="status">Loading…</p>;
  if (page.status === "failed") return <p className="status">Couldn't load the season: {page.error.message}</p>;

  return (
    <section className="newsletter">
      <p className="hint">
        The Brag Board section for Friday's newsletter, laid out like the rest of the email. Pick up to {MAX_DEER} deer,
        copy the HTML, and paste it into a Custom HTML block in the Noptin campaign before it sends. Links are tagged
        for newsletter analytics.
      </p>
      <label className="newsletter-since">
        Deer posted since
        <input type="date" value={since} max={today} onChange={(e) => e.target.value && setSince(e.target.value)} />
      </label>
      <Picks
        key={since}
        board={page.data.board}
        onBoard={page.data.onBoard}
        weekly={page.data.weekly}
        since={since}
        thisWeek={since === weekAgo}
        edition={today}
      />
    </section>
  );
}

// The note an editor sends the Deer of the Week's entrant, from their own mail program.
function winnerMailto(entry: PostedEntry, friday: string, sponsor: Sponsor | undefined): string {
  const first = entry.entry_private.submitter_name.trim().split(/\s+/)[0];
  const deer = entry.first_deer ? "first deer" : describeDeer(entry.deer_type, entry.points).toLowerCase();
  const subject = `${possessive(entry.hunter_name)} ${deer} is the Brag Board's Deer of the Week`;
  const prize =
    sponsor && !sponsor.demo
      ? `This week's prize: ${sponsor.prize}, from ${sponsor.name}. Reply to this email and we'll tell you how to collect it.\n\n`
      : "";
  const body =
    `Hi ${first},\n\n${possessive(entry.hunter_name)} ${deer} is the Hunting Brag Board's Deer of the Week for ` +
    `Friday, ${apDay(friday)}. It leads this week's Brag Board in our Friday newsletter.\n\n${prize}` +
    `Congratulations, and thanks for sharing it with our readers.\n\nWausau Pilot & Review`;
  return `mailto:${entry.entry_private.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function Picks({
  board,
  onBoard,
  weekly,
  since,
  thisWeek,
  edition,
}: {
  board: Board;
  onBoard: number;
  weekly: WeeklyPick[];
  since: string;
  thisWeek: boolean;
  edition: string;
}) {
  // Keyed by `since`, so this loads once per date.
  const posted = useLoad(() => loadPostedSince(board.season.id, wausauMidnight(since)));
  const [chosen, setChosen] = useState<string[] | null>(null);
  const [copied, setCopied] = useState(false);
  // Deer of the Week for the Friday this newsletter goes out, saved as soon as it's picked. It
  // runs while entries are open, so the picker shows only for a Friday that can take one.
  const friday = fridayOnOrAfter(edition);
  const weeklyOpen = board.season.phase === "entries" && friday <= lastWeeklyFriday(board.season);
  const [weeklyId, setWeeklyId] = useState(weekly.find((w) => w.week_of === friday)?.entry_id ?? null);
  const [weeklySaving, setWeeklySaving] = useState(false);
  const [weeklyError, setWeeklyError] = useState<string | null>(null);

  if (posted.status === "loading") return <p className="status">Loading deer…</p>;
  if (posted.status === "failed") return <p className="status">Couldn't load entries: {posted.error.message}</p>;
  if (posted.data.length === 0) return <p className="empty">No deer have been posted since {apDay(since)}.</p>;

  const picked = chosen ?? posted.data.slice(0, DEFAULT_PICKS).map((e) => e.id);
  const toggle = (id: string) => {
    setCopied(false);
    setChosen(picked.includes(id) ? picked.filter((p) => p !== id) : [...picked, id]);
  };

  const sponsor = weeklySponsor(board);
  const weeklyEntry = posted.data.find((e) => e.id === weeklyId);
  const chooseWeekly = async (id: string | null) => {
    setWeeklySaving(true);
    setWeeklyError(null);
    setCopied(false);
    try {
      await setWeeklyPick(friday, id);
      setWeeklyId(id);
    } catch (err) {
      setWeeklyError((err as Error).message);
    } finally {
      setWeeklySaving(false);
    }
  };

  const html = wrapForNoptin(
    newsletterRows({
      season: board.season,
      presenting: presentingSponsor(board),
      weekly: weeklyEntry && { entry: weeklyEntry, sponsor },
      picks: posted.data.filter((e) => picked.includes(e.id)),
      posted: posted.data.length,
      onBoard,
      since: thisWeek ? null : since,
      edition,
      galleryUrl: env.galleryPageUrl,
      enterUrl: env.enterPageUrl,
    }),
  );
  const tooBig = html.length > NOPTIN_BLOCK_LIMIT;

  const copy = () => {
    navigator.clipboard.writeText(html).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  };

  return (
    <>
      {weeklyOpen && (
        <div className="weekly-picker">
          <label>
            Deer of the Week for Friday, {apDay(friday)}
            <select value={weeklyId ?? ""} disabled={weeklySaving} onChange={(e) => chooseWeekly(e.target.value || null)}>
              <option value="">
                {weeklyId && !weeklyEntry ? "Picked: a deer posted before this list starts" : "No pick yet"}
              </option>
              {posted.data.map((entry) => (
                <option key={entry.id} value={entry.id} disabled={!entry.entry_private.prize_eligible}>
                  {entry.hunter_name}, {describeDeer(entry.deer_type, entry.points).toLowerCase()}
                  {!entry.entry_private.prize_eligible && " (staff household: can't win)"}
                </option>
              ))}
            </select>
          </label>
          <p className="hint">
            Saved as soon as you pick it. It leads this section, wears a tag on the board, and goes public on Friday.
            {sponsor && !sponsor.demo && ` This week's prize: ${sponsor.prize}, from ${sponsor.name}.`}
          </p>
          {weeklyEntry && (
            <a className="button" href={winnerMailto(weeklyEntry, friday, sponsor)}>
              Email {weeklyEntry.entry_private.submitter_name.trim().split(/\s+/)[0]} the news
            </a>
          )}
          {weeklyError && (
            <p className="error" role="alert">
              {weeklyError}
            </p>
          )}
        </div>
      )}

      <ul className="newsletter-picks">
        {posted.data.map((entry) => {
          const on = picked.includes(entry.id);
          return (
            <li key={entry.id}>
              <label className={on ? "pick pick-on" : "pick"}>
                <input
                  type="checkbox"
                  checked={on}
                  disabled={!on && picked.length >= MAX_DEER}
                  onChange={() => toggle(entry.id)}
                />
                <img src={photoUrl(entry.photo_id, "thumb")} alt="" />
                <span>
                  <strong>{entry.hunter_name}</strong>, {describeDeer(entry.deer_type, entry.points).toLowerCase()}
                  <span className="pick-when">Posted {apDate(entry.entry_private.moderated_at)}</span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      <div className="actions">
        <button type="button" className="button button-blaze" disabled={picked.length === 0 || tooBig} onClick={copy}>
          Copy HTML
        </button>
        <p className={tooBig ? "newsletter-size newsletter-size-over" : "newsletter-size"} aria-live="polite">
          {copied
            ? "Copied. Paste it into a Custom HTML block in Friday's campaign."
            : tooBig
              ? `${(html.length / 1000).toFixed(1)} KB is over Noptin's ~13 KB block limit. Uncheck a deer or two.`
              : `${picked.length} of ${posted.data.length} deer · ${(html.length / 1000).toFixed(1)} KB of Noptin's ~13 KB block limit`}
        </p>
      </div>

      {picked.length > 0 && (
        <iframe
          title="Newsletter preview"
          className="newsletter-preview"
          sandbox="allow-same-origin"
          srcDoc={`<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${PREVIEW_FONTS}"><style>body{margin:0;padding:24px 0;background:#f6f2e9}</style></head><body>${html}</body></html>`}
          onLoad={(e) => {
            const doc = e.currentTarget.contentDocument;
            if (doc) e.currentTarget.style.height = `${doc.documentElement.scrollHeight}px`;
          }}
        />
      )}

      {picked.length > 0 && <SocialPack key={picked.join()} picks={posted.data.filter((e) => picked.includes(e.id))} board={board} />}
    </>
  );
}

// The same deer for Facebook and Instagram: one feed image per pick (1080x1350, drawn here like
// the share images) and a caption to paste, so Friday's post takes a minute.
function SocialPack({ picks, board }: { picks: PostedEntry[]; board: Board }) {
  const [images, setImages] = useState<{ id: string; url: string; name: string; alt: string }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(0);
  const [copied, setCopied] = useState(false);

  const make = async () => {
    setBusy(true);
    setFailed(0);
    images?.forEach((image) => URL.revokeObjectURL(image.url));
    const made: NonNullable<typeof images> = [];
    let lost = 0;
    for (const entry of picks) {
      try {
        const blob = await drawFeedCard({ entry, year: board.season.year, presenting: presentingSponsor(board) });
        made.push({
          id: entry.id,
          url: URL.createObjectURL(blob),
          name: `${entry.hunter_name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "deer"}-brag-board.jpg`,
          alt: `${entry.hunter_name}'s ${describeDeer(entry.deer_type, entry.points).toLowerCase()}`,
        });
      } catch (err) {
        lost += 1;
        console.error("Feed image:", err);
      }
    }
    setImages(made);
    setFailed(lost);
    setBusy(false);
  };

  // AP style, no hashtags: readers follow the link.
  const names = picks.map((e) => `${e.hunter_name} of ${e.hometown} (${describeDeer(e.deer_type, e.points).toLowerCase()})`);
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
  const caption =
    `New on the Hunting Brag Board this week: ${list}.\n\n` +
    `See every deer and enter yours. It's free, and any deer taken in Wisconsin since ${apDay(board.season.harvest_since)} counts: ${env.galleryPageUrl}`;

  const copyCaption = () => {
    navigator.clipboard.writeText(caption).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  };

  return (
    <div className="social-pack">
      <h3>The same deer for Facebook and Instagram</h3>
      <p className="hint">
        One image per picked deer, sized for a post ({picks.length} {picks.length === 1 ? "image" : "images"}), and a
        caption to paste. Download the images, then post them as an album or carousel with the caption.
      </p>
      <div className="actions">
        <button type="button" className="button" disabled={busy} onClick={make}>
          {busy ? "Making the images…" : images ? "Remake the images" : "Make the images"}
        </button>
        <button type="button" className="link-button" onClick={copyCaption} aria-live="polite">
          {copied ? "Caption copied" : "Copy the caption"}
        </button>
      </div>
      {images && (
        <ul className="social-images">
          {images.map((image) => (
            <li key={image.id}>
              <a href={image.url} download={image.name}>
                <img src={image.url} alt={image.alt} />
                <span>Download</span>
              </a>
            </li>
          ))}
        </ul>
      )}
      {failed > 0 && (
        <p className="error" role="alert">
          {failed} {failed === 1 ? "image" : "images"} didn't draw. Try again, or post that deer's share image instead.
        </p>
      )}
      <textarea className="social-caption" readOnly value={caption} aria-label="Caption for the post" rows={5} />
    </div>
  );
}
