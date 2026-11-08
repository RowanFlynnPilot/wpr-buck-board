// Staff: the Brag Board section for Friday's newsletters (the entry form promises readers
// "new Brag Board entries every Friday"). Pick the deer, check the preview, save it for Friday:
// the wpr-newsletter build reads the saved section that morning and adds it to both editions
// (migration 0020). Each edition is built about an hour before it sends, so there's no campaign
// to paste into ahead of time (Nov. 6: a pasted section never reached a newsletter).
import { useState } from "react";
import {
  countEntries,
  loadCatalog,
  loadNewsletterSection,
  loadPostedSince,
  loadSeason,
  loadWeeklyPicks,
  saveNewsletterSection,
  setWeeklyPick,
} from "../data";
import { env } from "../env";
import {
  addDays,
  apDate,
  apDay,
  apNumber,
  apTime,
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
import type { Board, PostedEntry, SavedNewsletterSection, Sponsor, WeeklyPick } from "../types";
import { useLoad } from "../useLoad";

// Three rows of two unless an editor picks more.
const DEFAULT_PICKS = 6;

// The newsletter's own faces, so the preview looks like the email rather than the admin page.
const PREVIEW_FONTS =
  "https://fonts.googleapis.com/css2?family=Merriweather:wght@700&family=Oswald:wght@700&family=Source+Sans+3:wght@400;700&display=swap";

// The Friday the section is for: today on a Friday, otherwise the next one.
async function loadBoard() {
  const season = await loadSeason();
  const friday = fridayOnOrAfter(todayInWausau());
  const [catalog, onBoard, weekly, saved] = await Promise.all([
    loadCatalog(season.id),
    countEntries(season.id),
    loadWeeklyPicks(season.id),
    loadNewsletterSection(season.id, friday),
  ]);
  return { board: { season, ...catalog }, onBoard, weekly, saved, friday };
}

export function NewsletterBlock() {
  const page = useLoad(loadBoard);
  if (page.status === "loading") return <p className="status">Loading…</p>;
  if (page.status === "failed") return <p className="status">Couldn't load the season: {page.error.message}</p>;
  return <Section {...page.data} />;
}

function Section({
  board,
  onBoard,
  weekly,
  saved,
  friday,
}: {
  board: Board;
  onBoard: number;
  weekly: WeeklyPick[];
  saved: SavedNewsletterSection | null;
  friday: string;
}) {
  const today = todayInWausau();
  // A week's section runs from the last Friday's newsletter; a saved one reopens on its own list.
  const weekStart = addDays(friday, -7);
  const [since, setSince] = useState(saved?.posted_since ?? weekStart);

  return (
    <section className="newsletter">
      <p className="hint">
        The Brag Board section for Friday's newsletters, laid out like the rest of the email. Pick up to {apNumber(MAX_DEER)} deer
        and save it: the Morning and Afternoon Updates on Friday, {apDay(friday)} take it on their own, with nothing to
        paste. Save by Thursday night. Each edition is built about an hour before it sends (7:02 a.m. and 5:02 p.m.) and
        takes the section as it's saved then. Links are tagged for newsletter analytics.
      </p>
      <label className="newsletter-since">
        Deer posted since
        <input type="date" value={since} max={today} onChange={(e) => e.target.value && setSince(e.target.value)} />
      </label>
      <Picks
        key={since}
        board={board}
        onBoard={onBoard}
        weekly={weekly}
        saved={saved}
        since={since}
        thisWeek={since === weekStart}
        friday={friday}
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
  saved,
  since,
  thisWeek,
  friday,
}: {
  board: Board;
  onBoard: number;
  weekly: WeeklyPick[];
  saved: SavedNewsletterSection | null;
  since: string;
  thisWeek: boolean;
  friday: string;
}) {
  // Keyed by `since`, so this loads once per date.
  const posted = useLoad(() => loadPostedSince(board.season.id, wausauMidnight(since)));
  // A section saved from this list reopens with its deer checked.
  const [chosen, setChosen] = useState<string[] | null>(saved && saved.posted_since === since ? saved.entry_ids : null);
  const [copied, setCopied] = useState(false);
  const [current, setCurrent] = useState(saved);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Deer of the Week for the Friday this newsletter goes out, saved as soon as it's picked. It
  // runs while entries are open, so the picker shows only for a Friday that can take one.
  const weeklyOpen = board.season.phase === "entries" && friday <= lastWeeklyFriday(board.season);
  const [weeklyId, setWeeklyId] = useState(weekly.find((w) => w.week_of === friday)?.entry_id ?? null);
  const [weeklySaving, setWeeklySaving] = useState(false);
  const [weeklyError, setWeeklyError] = useState<string | null>(null);

  if (posted.status === "loading") return <p className="status">Loading deer…</p>;
  if (posted.status === "failed") return <p className="status">Couldn't load entries: {posted.error.message}</p>;
  if (posted.data.length === 0) return <p className="empty">No deer have been posted since {apDay(since)}.</p>;

  const listed = new Set(posted.data.map((e) => e.id));
  const picked = (chosen ?? posted.data.slice(0, DEFAULT_PICKS).map((e) => e.id)).filter((id) => listed.has(id));
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

  const rows = newsletterRows({
    season: board.season,
    presenting: presentingSponsor(board),
    weekly: weeklyEntry && { entry: weeklyEntry, sponsor },
    picks: posted.data.filter((e) => picked.includes(e.id)),
    posted: posted.data.length,
    onBoard,
    since: thisWeek ? null : since,
    edition: friday,
    galleryUrl: env.galleryPageUrl,
    enterUrl: env.enterPageUrl,
  });
  const html = wrapForNoptin(rows);
  const tooBig = html.length > NOPTIN_BLOCK_LIMIT;

  // Every deer the section shows, so the newsletter leaves it out if one is taken down.
  const shown = [...new Set([...picked, ...(weeklyEntry ? [weeklyEntry.id] : [])])];
  const upToDate = current?.rows_html === rows;
  const takenDown = current !== null && current.posted_since === since && current.entry_ids.some((id) => !listed.has(id));
  const save = async (section: string | null) => {
    setSaving(true);
    setSaveError(null);
    try {
      await saveNewsletterSection(friday, section, section ? shown : [], since);
      setCurrent(
        section
          ? { week_of: friday, rows_html: section, entry_ids: shown, posted_since: since, saved_at: new Date().toISOString() }
          : null,
      );
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const status = !current
    ? "Not saved yet. Friday's newsletters go out without the Brag Board until you save it."
    : takenDown
      ? "A deer in the saved section has been taken down, so Friday's newsletters will leave the Brag Board out. Save again."
      : upToDate
        ? `Saved. It goes into Friday's Morning and Afternoon Updates on its own (saved ${apDate(current.saved_at)} at ${apTime(current.saved_at)}).`
        : "Changed since you saved it. Save again to send this version.";

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
        <button
          type="button"
          className="button button-blaze"
          disabled={picked.length === 0 || tooBig || saving || (upToDate && !takenDown)}
          onClick={() => save(rows)}
        >
          {saving ? "Saving…" : upToDate && !takenDown ? "Saved" : `Save for Friday, ${apDay(friday)}`}
        </button>
        <p className={upToDate && !takenDown ? "newsletter-status newsletter-status-saved" : "newsletter-status"} aria-live="polite">
          {status}
        </p>
      </div>
      <p className={tooBig ? "newsletter-size newsletter-size-over" : "newsletter-size"}>
        {tooBig
          ? `${(html.length / 1000).toFixed(1)} KB is over the newsletter's ~13 KB block limit. Uncheck a deer or two.`
          : `${picked.length} of ${posted.data.length} deer · ${(html.length / 1000).toFixed(1)} KB of the newsletter's ~13 KB block limit`}
      </p>
      {saveError && (
        <p className="error" role="alert">
          {saveError}
        </p>
      )}
      {current && (
        <button type="button" className="link-button" disabled={saving} onClick={() => save(null)}>
          Take it out of Friday's newsletters
        </button>
      )}
      <details className="newsletter-copy">
        <summary>Adding it to a campaign by hand instead</summary>
        <p className="hint">
          Copy the section and paste it into a Custom HTML block in the campaign, under Harvey Plum Post &gt; Emails &gt;
          Newsletters. A campaign appears there about an hour before it sends.
        </p>
        <button type="button" className="button" disabled={picked.length === 0 || tooBig} onClick={copy}>
          {copied ? "Copied" : "Copy HTML"}
        </button>
      </details>

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
