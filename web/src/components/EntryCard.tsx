import { useId, useState } from "react";
import { apDay, describeDeer, WEAPON_LABELS } from "../format";
import { photoUrl } from "../supabase";
import type { EntryFields } from "../types";

// Stories longer than this are clamped to three lines with a toggle.
const LONG_STORY = 160;

export function EntryCard({ entry, award }: { entry: EntryFields; award?: string }) {
  const [storyOpen, setStoryOpen] = useState(false);
  const storyId = useId();
  const deer = describeDeer(entry.deer_type, entry.points);
  const longStory = entry.story !== null && entry.story.length > LONG_STORY;

  return (
    <article className="entry">
      <a className="entry-photo" href={photoUrl(entry.photo_id, "full")} target="_blank" rel="noreferrer">
        <img src={photoUrl(entry.photo_id, "thumb")} alt={`${entry.hunter_name}'s ${deer.toLowerCase()}`} loading="lazy" />
        {entry.first_deer && <span className="entry-tag">First deer</span>}
      </a>
      {award && <p className="entry-award">{award}</p>}
      <h3 className="entry-name">{entry.hunter_name}</h3>
      <p className="entry-home">{entry.hometown}</p>
      <p className="entry-record">
        {deer}, {WEAPON_LABELS[entry.weapon].toLowerCase()}
        <br />
        {entry.county} County, {apDay(entry.harvest_date)}
      </p>
      {entry.story && (
        <p id={storyId} className={longStory && !storyOpen ? "entry-story entry-story-closed" : "entry-story"}>
          {entry.story}
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
    </article>
  );
}
