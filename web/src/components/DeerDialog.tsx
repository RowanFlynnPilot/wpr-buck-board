// A deer opened from the board: its whole photo and story in a pop-up over the board, the way the
// adoption widget opens a pet, so a long story reads at a comfortable width rather than in a
// card's narrow column (Nov. 9). Opened from a card's or the front's photo, or Read the story.
// A native modal <dialog>: Esc and a click outside close it, focus stays inside and goes back to
// what opened it. In a frame embed.js stretches to the board's height, the host page scrolls
// rather than ours, so the pop-up asks where the reader's screen is and opens there (hostView).
// It's rendered into <body>, so the dark front's cream text doesn't follow it onto the white print.
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { track } from "../analytics";
import type { CardFacts } from "../data";
import { apDay, describeDeer, tidyStory, WEAPON_LABELS } from "../format";
import { hostView } from "../host";
import { contentBox } from "../photoTrim";
import { photoUrl } from "../storage";
import type { EntryFields, Sponsor } from "../types";
import { CropPhoto } from "./CropPhoto";
import { EntryTags } from "./EntryCard";
import { ShareButton } from "./ShareButton";
import { SponsorCredit } from "./SponsorCredit";

interface Props {
  entry: EntryFields;
  award?: string;
  awardSponsor?: Sponsor;
  // The Share and Story image buttons, and the facts the Story image names.
  share?: boolean;
  storyFacts?: Omit<CardFacts, "entry">;
  weekOf?: string;
  // A photo that isn't in storage yet: the entry form preview's own copy.
  photo?: string;
  onClose: () => void;
}

export function DeerDialog({ entry, award, awardSponsor, share = false, storyFacts, weekOf, photo, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const nameId = useId();
  const src = photo ?? photoUrl(entry.photo_id, "full");
  const deer = describeDeer(entry.deer_type, entry.points);
  const story = entry.story && tidyStory(entry.story);
  // The picture's own shape, inside any screenshot bands, so the whole of it shows and no band does.
  const [ratio, setRatio] = useState<number | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    track("Deer Opened");
    let gone = false;
    hostView().then((view) => {
      if (gone || !view) return;
      dialog.style.setProperty("--view-h", `${view.height}px`);
      dialog.style.marginTop = `${Math.max(0, -view.top) + 16}px`;
      dialog.style.marginBottom = "auto";
    });
    return () => {
      gone = true;
      if (dialog.open) dialog.close();
    };
  }, []);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const box = contentBox(img, img.naturalWidth, img.naturalHeight);
      setRatio(box.w / box.h);
    };
    img.src = src;
    return () => {
      img.onload = null;
    };
  }, [src]);

  return createPortal(
    <dialog
      ref={ref}
      className="deer-dialog"
      aria-labelledby={nameId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) e.currentTarget.close();
      }}
    >
      <div className="deer-dialog-print">
        <button type="button" className="deer-dialog-close" aria-label="Close" autoFocus onClick={() => ref.current?.close()}>
          ×
        </button>
        <figure className="deer-dialog-photo" style={ratio ? { ["--ratio" as string]: String(ratio) } : undefined}>
          <div className="deer-dialog-frame">
            <CropPhoto src={src} alt={`${entry.hunter_name}'s ${deer.toLowerCase()}`} />
            <EntryTags firstDeer={entry.first_deer} weekOf={weekOf} />
          </div>
          {entry.photo_credit && <figcaption className="entry-credit">Photo: {entry.photo_credit}</figcaption>}
        </figure>
        <div className="deer-dialog-words">
          {award && <p className="entry-award">{award}</p>}
          {awardSponsor && <SponsorCredit sponsor={awardSponsor} placement="winner-card" />}
          <h2 id={nameId} className="deer-dialog-name">
            {entry.hunter_name}
          </h2>
          <p className="deer-dialog-record">
            {entry.hometown} · {deer}, {WEAPON_LABELS[entry.weapon].toLowerCase()} · {entry.county} County,{" "}
            {apDay(entry.harvest_date)}
          </p>
          {story && <p className="deer-dialog-story">{story}</p>}
          <div className="deer-dialog-foot">
            {share && <ShareButton entry={entry} story={storyFacts && { ...storyFacts, entry }} />}
            <a className="deer-dialog-full" href={src} target="_blank" rel="noreferrer">
              Full-size photo
            </a>
          </div>
        </div>
      </div>
    </dialog>,
    document.body,
  );
}
