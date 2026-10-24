// Staff: the Brag Board section for Friday's newsletter (the entry form promises readers
// "new Brag Board entries every Friday"). Pick the deer, check the preview, copy the HTML,
// paste it into a Custom HTML block in the Noptin campaign before it sends.
import { useState } from "react";
import { countEntries, loadCatalog, loadPostedSince, loadSeason } from "../data";
import { env } from "../env";
import { addDays, apDate, apDay, describeDeer, todayInWausau, wausauMidnight } from "../format";
import { MAX_DEER, NOPTIN_BLOCK_LIMIT, newsletterRows, wrapForNoptin } from "../newsletter";
import { presentingSponsor } from "../phase";
import { drawFeedCard } from "../shareCard";
import { photoUrl } from "../supabase";
import type { Board, PostedEntry } from "../types";
import { useLoad } from "../useLoad";

// Three rows of two unless an editor picks more.
const DEFAULT_PICKS = 6;

// The newsletter's own faces, so the preview looks like the email rather than the admin page.
const PREVIEW_FONTS =
  "https://fonts.googleapis.com/css2?family=Merriweather:wght@700&family=Oswald:wght@700&family=Source+Sans+3:wght@400;700&display=swap";

async function loadBoard() {
  const season = await loadSeason();
  const [catalog, onBoard] = await Promise.all([loadCatalog(season.id), countEntries(season.id)]);
  return { board: { season, ...catalog }, onBoard };
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
        since={since}
        thisWeek={since === weekAgo}
        edition={today}
      />
    </section>
  );
}

function Picks({
  board,
  onBoard,
  since,
  thisWeek,
  edition,
}: {
  board: Board;
  onBoard: number;
  since: string;
  thisWeek: boolean;
  edition: string;
}) {
  // Keyed by `since`, so this loads once per date.
  const posted = useLoad(() => loadPostedSince(board.season.id, wausauMidnight(since)));
  const [chosen, setChosen] = useState<string[] | null>(null);
  const [copied, setCopied] = useState(false);

  if (posted.status === "loading") return <p className="status">Loading deer…</p>;
  if (posted.status === "failed") return <p className="status">Couldn't load entries: {posted.error.message}</p>;
  if (posted.data.length === 0) return <p className="empty">No deer have been posted since {apDay(since)}.</p>;

  const picked = chosen ?? posted.data.slice(0, DEFAULT_PICKS).map((e) => e.id);
  const toggle = (id: string) => {
    setCopied(false);
    setChosen(picked.includes(id) ? picked.filter((p) => p !== id) : [...picked, id]);
  };

  const html = wrapForNoptin(
    newsletterRows({
      season: board.season,
      presenting: presentingSponsor(board),
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
