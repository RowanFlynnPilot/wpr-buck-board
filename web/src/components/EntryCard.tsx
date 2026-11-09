import { useState } from "react";
import type { CardFacts } from "../data";
import { apDay, describeDeer, possessive, tidyStory, WEAPON_LABELS } from "../format";
import { photoUrl } from "../storage";
import type { EntryFields, Sponsor } from "../types";
import { CropPhoto } from "./CropPhoto";
import { DeerDialog } from "./DeerDialog";
import { EntryTags } from "./EntryTags";
import { useDeerViewer } from "./DeerViewer";
import { Rosette } from "./Rosette";
import { ShareButton } from "./ShareButton";
import { SponsorCredit } from "./SponsorCredit";

// Stories longer than this are clamped to three lines, with Read the story opening the deer.
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
  // The deer in a pop-up: the whole photo and story (DeerDialog), stepping through its list's
  // deer when the card is in one (DeerViewer), or on its own.
  const viewer = useDeerViewer();
  const [open, setOpen] = useState(false);
  const openDeer = () => {
    if (!viewer?.(entry.id, { award, awardSponsor, weekOf })) setOpen(true);
  };
  const deer = describeDeer(entry.deer_type, entry.points);
  const story = entry.story && tidyStory(entry.story);
  const longStory = !featured && story !== null && story.length > LONG_STORY;

  return (
    <article
      className={featured ? "entry entry-featured" : "entry"}
      data-reveal
      // In a list on the board, a tap anywhere on the print opens it (a two-across print on a
      // phone is mostly photo and name), but not a tap on its buttons or a drag to select words.
      onClick={
        viewer && !featured
          ? (e) => {
              if ((e.target as Element).closest("a, button, input, label") || window.getSelection()?.toString()) return;
              openDeer();
            }
          : undefined
      }
    >
      {ribbon && <Rosette grand={ribbon === "grand"} className="entry-ribbon" />}
      {featured ? (
        <a className="entry-photo" href={photo ?? photoUrl(entry.photo_id, "full")} target="_blank" rel="noreferrer">
          <CropPhoto
            src={photo ?? photoUrl(entry.photo_id, "full")}
            alt={`${entry.hunter_name}'s ${deer.toLowerCase()}`}
            loading="eager"
          />
          <EntryTags firstDeer={entry.first_deer} weekOf={weekOf} />
        </a>
      ) : (
        <button
          type="button"
          className="entry-photo photo-button"
          aria-haspopup="dialog"
          aria-label={`Open ${possessive(entry.hunter_name)} ${deer.toLowerCase()}`}
          onClick={openDeer}
        >
          <CropPhoto src={photo ?? photoUrl(entry.photo_id, "thumb")} alt="" loading="lazy" />
          <EntryTags firstDeer={entry.first_deer} weekOf={weekOf} />
        </button>
      )}
      {entry.photo_credit && <p className="entry-credit">Photo: {entry.photo_credit}</p>}
      {award && <p className="entry-award">{award}</p>}
      {awardSponsor && <SponsorCredit sponsor={awardSponsor} placement="winner-card" />}
      <h3 className="entry-name">{entry.hunter_name}</h3>
      <p className="entry-home">{entry.hometown}</p>
      <p className="entry-record">
        <span>
          {deer}, {WEAPON_LABELS[entry.weapon].toLowerCase()}
        </span>
        <span className="entry-record-where">
          {entry.county} County, {apDay(entry.harvest_date)}
        </span>
      </p>
      {story && (
        <p className={longStory ? "entry-story entry-story-closed" : "entry-story"}>
          {story}
        </p>
      )}
      {longStory && (
        <button type="button" className="link-button" aria-haspopup="dialog" onClick={openDeer}>
          Read the story
        </button>
      )}
      {share && <ShareButton entry={entry} story={storyFacts && { ...storyFacts, entry }} />}
      {open && (
        <DeerDialog
          entry={entry}
          award={award}
          awardSponsor={awardSponsor}
          share={share}
          storyFacts={storyFacts}
          weekOf={weekOf}
          photo={photo}
          onClose={() => setOpen(false)}
        />
      )}
    </article>
  );
}
