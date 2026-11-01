import { useId, useState } from "react";
import type { CardFacts } from "../data";
import { apDay, describeDeer, tidyStory, WEAPON_LABELS } from "../format";
import { photoUrl } from "../storage";
import type { EntryFields, Sponsor } from "../types";
import { CropPhoto } from "./CropPhoto";
import { Rosette } from "./Rosette";
import { ShareButton } from "./ShareButton";
import { SponsorCredit } from "./SponsorCredit";

// Stories longer than this are clamped to three lines with a toggle.
const LONG_STORY = 160;

interface Props {
  entry: EntryFields;
  // Set on winner cards.
  award?: string;
  awardSponsor?: Sponsor;
  // An award winner's print wears its rosette, the grand prize's in blaze.
  ribbon?: "award" | "grand";
  // Public cards only: a deer waiting for review has no share page.
  share?: boolean;
  // With `share`: the season and presenting sponsor its Story image names.
  storyFacts?: Omit<CardFacts, "entry">;
  // The deer a link opened: the full photo, uncropped, with the whole story.
  featured?: boolean;
  // A photo that isn't in storage yet: the entry form preview's own copy.
  photo?: string;
  // A Deer of the Week's card: the Friday it was picked.
  weekOf?: string;
}

export function EntryCard({ entry, award, awardSponsor, ribbon, share = false, storyFacts, featured = false, photo, weekOf }: Props) {
  const [storyOpen, setStoryOpen] = useState(false);
  const storyId = useId();
  const deer = describeDeer(entry.deer_type, entry.points);
  const story = entry.story && tidyStory(entry.story);
  const longStory = !featured && story !== null && story.length > LONG_STORY;

  return (
    <article className={featured ? "entry entry-featured" : "entry"} data-reveal>
      {ribbon && <Rosette grand={ribbon === "grand"} className="entry-ribbon" />}
      <a className="entry-photo" href={photo ?? photoUrl(entry.photo_id, "full")} target="_blank" rel="noreferrer">
        <CropPhoto
          src={photo ?? photoUrl(entry.photo_id, featured ? "full" : "thumb")}
          alt={`${entry.hunter_name}'s ${deer.toLowerCase()}`}
          loading={featured ? "eager" : "lazy"}
        />
        <EntryTags firstDeer={entry.first_deer} weekOf={weekOf} />
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
      {story && (
        <p id={storyId} className={longStory && !storyOpen ? "entry-story entry-story-closed" : "entry-story"}>
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
      {share && <ShareButton entry={entry} story={storyFacts && { ...storyFacts, entry }} />}
    </article>
  );
}

// The tags on a deer's photo, on its card and in the front.
export function EntryTags({ firstDeer, weekOf }: { firstDeer: boolean; weekOf?: string }) {
  if (!firstDeer && !weekOf) return null;
  return (
    <span className="entry-tags">
      {weekOf && (
        <span className="entry-tag entry-tag-week" title={`Deer of the Week, ${apDay(weekOf)}`}>
          Deer of the Week
        </span>
      )}
      {firstDeer && <span className="entry-tag">First deer</span>}
    </span>
  );
}
