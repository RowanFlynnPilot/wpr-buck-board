// A deer opened from the board: its whole photo and story in a pop-up over the board, the way the
// adoption widget opens a pet, so a long story reads at a comfortable width rather than in a
// card's narrow column (Nov. 9). Opened from a card's or the front's photo, or Read the story.
// Opened from a list (DeerViewer), its arrows, the arrow keys or a swipe step through the list.
// A native modal <dialog>: Esc and a click outside close it, focus stays inside and goes back to
// what opened it. In a frame embed.js stretches to the board's height, the host page scrolls
// rather than ours, so the pop-up asks where the reader's screen is and opens there (hostView).
// It's rendered into <body>, so the dark front's cream text doesn't follow it onto the white print.
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode, type TouchEvent } from "react";
import { createPortal } from "react-dom";
import { track } from "../analytics";
import type { CardFacts } from "../data";
import { apDay, describeDeer, tidyStory, WEAPON_LABELS } from "../format";
import { hostView } from "../host";
import { contentBox } from "../photoTrim";
import { photoUrl } from "../storage";
import type { EntryFields, Sponsor } from "../types";
import { CropPhoto } from "./CropPhoto";
import { EntryTags } from "./EntryTags";
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
  // Entered in the last few days: the New tag.
  fresh?: boolean;
  // A photo that isn't in storage yet: the entry form preview's own copy.
  photo?: string;
  // Where this deer sits in the list it was opened from, and a step to the next or previous.
  browse?: { position: number; count: number; step: (by: 1 | -1) => void };
  // Photos to fetch ahead: the deer either side.
  preload?: string[];
  onClose: () => void;
}

// A swipe this far across, and mostly across rather than down, turns to the next deer.
const SWIPE = 60;

export function DeerDialog({ entry, award, awardSponsor, share = false, storyFacts, weekOf, fresh, photo, browse, preload, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const nameId = useId();
  const src = photo ?? photoUrl(entry.photo_id, "full");
  const deer = describeDeer(entry.deer_type, entry.points);
  const story = entry.story && tidyStory(entry.story);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    // Focus starts on Close, not the first button (Previous, when there's a list to step through).
    close.current?.focus();
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

  // A new deer starts at its photo.
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = 0;
  }, [entry.id]);

  useEffect(() => {
    for (const next of preload ?? []) new Image().src = next;
  }, [preload?.join()]);

  const step = (by: 1 | -1) => {
    if (!browse) return;
    track("Deer Flipped");
    browse.step(by);
  };
  const keys = (e: KeyboardEvent<HTMLDialogElement>) => {
    if (!browse || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
    if ((e.target as Element).closest("input, textarea, select")) return;
    e.preventDefault();
    step(e.key === "ArrowRight" ? 1 : -1);
  };
  const touchStart = (e: TouchEvent) => {
    touch.current = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
  };
  const touchEnd = (e: TouchEvent) => {
    const start = touch.current;
    touch.current = null;
    if (!start || !browse) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) >= SWIPE && Math.abs(dx) > 1.5 * Math.abs(dy)) step(dx < 0 ? 1 : -1);
  };

  return createPortal(
    <dialog
      ref={ref}
      className="deer-dialog"
      aria-labelledby={nameId}
      onClose={onClose}
      onKeyDown={keys}
      onClick={(e) => {
        // A card behind it in React's tree mustn't take this click as its own.
        e.stopPropagation();
        if (e.target === e.currentTarget) e.currentTarget.close();
      }}
    >
      <div className="deer-dialog-bar">
        {browse && (
          <span className="deer-dialog-steps">
            <button type="button" aria-label="Previous deer" onClick={() => step(-1)}>
              <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                <path d="M10 3 5 8l5 5" />
              </svg>
            </button>
            <span aria-hidden="true">
              {browse.position} of {browse.count}
            </span>
            <button type="button" aria-label="Next deer" onClick={() => step(1)}>
              <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                <path d="m6 3 5 5-5 5" />
              </svg>
            </button>
          </span>
        )}
        <button ref={close} type="button" className="deer-dialog-close" aria-label="Close" onClick={() => ref.current?.close()}>
          ×
        </button>
      </div>
      {browse && (
        <p className="sr-only" aria-live="polite">
          {entry.hunter_name}, {browse.position} of {browse.count}
        </p>
      )}
      <div key={entry.id} className="deer-dialog-print" onTouchStart={touchStart} onTouchEnd={touchEnd}>
        <DeerPhoto src={src} alt={`${entry.hunter_name}'s ${deer.toLowerCase()}`} firstDeer={entry.first_deer} weekOf={weekOf} fresh={fresh}>
          {entry.photo_credit && <figcaption className="entry-credit">Photo: {entry.photo_credit}</figcaption>}
        </DeerPhoto>
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

// The whole photo in its own shape: the picture inside any screenshot bands, measured once it
// loads, so all of it shows and no band does.
function DeerPhoto({
  src,
  alt,
  firstDeer,
  weekOf,
  fresh,
  children,
}: {
  src: string;
  alt: string;
  firstDeer: boolean;
  weekOf?: string;
  fresh?: boolean;
  children?: ReactNode;
}) {
  const [ratio, setRatio] = useState<number | null>(null);
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
  return (
    <figure className="deer-dialog-photo" style={ratio ? { ["--ratio" as string]: String(ratio) } : undefined}>
      <div className="deer-dialog-frame">
        <CropPhoto src={src} alt={alt} />
        <EntryTags firstDeer={firstDeer} weekOf={weekOf} fresh={fresh} />
      </div>
      {children}
    </figure>
  );
}
