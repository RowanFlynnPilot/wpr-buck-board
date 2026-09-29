import { useId, useState } from "react";
import { apDay, describeDeer, WEAPON_LABELS } from "../format";
import { photoUrl } from "../supabase";
import type { EntryFields, Sponsor } from "../types";
import { ShareButton } from "./ShareButton";
import { SponsorCredit } from "./SponsorCredit";

// Stories longer than this are clamped to three lines with a toggle.
const LONG_STORY = 160;

interface Props {
  entry: EntryFields;
  // Set on winner cards.
  award?: string;
  awardSponsor?: Sponsor;
  // Public cards only: a deer waiting for review has no share page.
  share?: boolean;
  // The deer a link opened: the full photo, uncropped, with the whole story.
  featured?: boolean;
  // A photo that isn't in storage yet: the entry form preview's own copy.
  photo?: string;
}

export function EntryCard({ entry, award, awardSponsor, share = false, featured = false, photo }: Props) {
  const [storyOpen, setStoryOpen] = useState(false);
  const storyId = useId();
  const deer = describeDeer(entry.deer_type, entry.points);
  const longStory = !featured && entry.story !== null && entry.story.length > LONG_STORY;

  return (
    <article className={featured ? "entry entry-featured" : "entry"}>
      <a className="entry-photo" href={photo ?? photoUrl(entry.photo_id, "full")} target="_blank" rel="noreferrer">
        <img
          src={photo ?? photoUrl(entry.photo_id, featured ? "full" : "thumb")}
          alt={`${entry.hunter_name}'s ${deer.toLowerCase()}`}
          loading={featured ? "eager" : "lazy"}
        />
        {entry.first_deer && <span className="entry-tag">First deer</span>}
      </a>
      {entry.photo_credit && <p className="entry-credit">Photo: {entry.photo_credit}</p>}
      {award && <p className="entry-award">{award}</p>}
      {awardSponsor && <SponsorCredit sponsor={awardSponsor} placement="winner-card" />}
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
      {share && <ShareButton entry={entry} />}
    </article>
  );
}
