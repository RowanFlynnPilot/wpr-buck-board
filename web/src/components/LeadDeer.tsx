// The newest deer on the board, set like a picture page's lead: the photo large, the hunter's
// name at display size, the story (eight lines until the reader opens it). Two parts, the picture and the words, so the board can
// set them in the front beside its title while it fills up (Gallery's `.front`), or together above
// the filters during the vote and after (`.lead`). The grid below starts with the second-newest.
import { useId, useState } from "react";
import type { CardFacts } from "../data";
import { apDay, describeDeer, LONG_NAME, tidyStory, WEAPON_LABELS } from "../format";
import { photoUrl } from "../storage";
import type { GalleryEntry } from "../types";
import { CropPhoto } from "./CropPhoto";
import { EntryTags } from "./EntryCard";
import { ShareButton } from "./ShareButton";

// Stories longer than this (about eight lines beside the photo) are clamped with a toggle.
const LONG_LEAD_STORY = 400;

export function LeadDeer({
  entry,
  storyFacts,
  weekOf,
}: {
  entry: GalleryEntry;
  storyFacts: Omit<CardFacts, "entry">;
  weekOf?: string;
}) {
  const deer = describeDeer(entry.deer_type, entry.points);
  const [storyOpen, setStoryOpen] = useState(false);
  const storyId = useId();
  const story = entry.story && tidyStory(entry.story);
  const longStory = typeof story === "string" && story.length > LONG_LEAD_STORY;
  return (
    <>
      <a className="lead-photo" href={photoUrl(entry.photo_id, "full")} target="_blank" rel="noreferrer">
        {/* The one picture that should paint first; the grid's thumbnails wait behind it. */}
        <CropPhoto
          src={photoUrl(entry.photo_id, "full")}
          alt={`${entry.hunter_name}'s ${deer.toLowerCase()}`}
          fetchPriority="high"
          decoding="async"
        />
        <EntryTags firstDeer={entry.first_deer} weekOf={weekOf} />
      </a>
      <section className="lead-text" aria-labelledby="lead-heading">
        <h2 id="lead-heading" className="lead-heading">
          Newest on the board
        </h2>
        <p className={entry.hunter_name.length > LONG_NAME ? "lead-name lead-name-long" : "lead-name"}>{entry.hunter_name}</p>
        <p className="lead-record">
          {entry.hometown} · {deer}, {WEAPON_LABELS[entry.weapon].toLowerCase()} · {entry.county} County,{" "}
          {apDay(entry.harvest_date)}
        </p>
        {story && (
          <p id={storyId} className={longStory && !storyOpen ? "lead-story lead-story-closed" : "lead-story"}>
            {story}
          </p>
        )}
        {longStory && (
          <button
            type="button"
            className="link-button"
            aria-expanded={storyOpen}
            aria-controls={storyId}
            onClick={() => setStoryOpen(!storyOpen)}
          >
            {storyOpen ? "Show less" : "Read the story"}
          </button>
        )}
        {entry.photo_credit && <p className="entry-credit">Photo: {entry.photo_credit}</p>}
        <ShareButton entry={entry} story={{ ...storyFacts, entry }} />
      </section>
    </>
  );
}
