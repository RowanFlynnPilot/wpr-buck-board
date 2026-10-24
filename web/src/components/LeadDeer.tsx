// The newest deer on the board, set like a picture page's lead: the photo large, the hunter's
// name at display size, the whole story. It's the first thing on the board, so the board opens
// on a deer rather than on type. Shown in the "All deer" view when no link has opened a deer and
// no award filter is on; the grid below then starts with the second-newest.
import type { CardFacts } from "../data";
import { apDay, describeDeer, WEAPON_LABELS } from "../format";
import { photoUrl } from "../supabase";
import type { GalleryEntry } from "../types";
import { ShareButton } from "./ShareButton";

export function LeadDeer({ entry, storyFacts }: { entry: GalleryEntry; storyFacts: Omit<CardFacts, "entry"> }) {
  const deer = describeDeer(entry.deer_type, entry.points);
  return (
    <section className="lead" aria-labelledby="lead-heading" data-reveal>
      <a className="lead-photo" href={photoUrl(entry.photo_id, "full")} target="_blank" rel="noreferrer">
        {/* The one picture that should paint first; the grid's thumbnails wait behind it. */}
        <img
          src={photoUrl(entry.photo_id, "full")}
          alt={`${entry.hunter_name}'s ${deer.toLowerCase()}`}
          fetchPriority="high"
          decoding="async"
        />
        {entry.first_deer && <span className="entry-tag">First deer</span>}
      </a>
      <div className="lead-text">
        <h2 id="lead-heading" className="lead-heading">
          Newest on the board
        </h2>
        <p className="lead-name">{entry.hunter_name}</p>
        <p className="lead-record">
          {entry.hometown} · {deer}, {WEAPON_LABELS[entry.weapon].toLowerCase()} · {entry.county} County,{" "}
          {apDay(entry.harvest_date)}
        </p>
        {entry.story && <p className="lead-story">{entry.story}</p>}
        {entry.photo_credit && <p className="entry-credit">Photo: {entry.photo_credit}</p>}
        <ShareButton entry={entry} story={{ ...storyFacts, entry }} />
      </div>
    </section>
  );
}
