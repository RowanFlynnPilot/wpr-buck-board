// The gun opener's weekend (openingWeekend() in phase.ts): how many of its deer are on the board
// so far, who presents it, and on the board the first opener buck to go up. The Opening Weekend
// sponsor appears only here, for the four days it's on.
import type { CardFacts } from "../data";
import { apNumber } from "../format";
import { openingWeekendSponsor } from "../phase";
import type { Board, GalleryEntry } from "../types";
import { EntryCard } from "./EntryCard";
import { SponsorCredit } from "./SponsorCredit";

export function OpeningWeekend({
  board,
  count,
  first,
  storyFacts,
}: {
  board: Board;
  count: number;
  // Board only: the earliest-posted buck taken on opening day.
  first?: GalleryEntry;
  storyFacts?: Omit<CardFacts, "entry">;
}) {
  const sponsor = openingWeekendSponsor(board);
  return (
    <section className="opener" aria-label="Opening weekend">
      <p className="opener-eyebrow">Opening weekend</p>
      <p className="opener-line">
        {count > 0 ? (
          <>
            So far, <strong>{apNumber(count)}</strong> deer from opening weekend {count === 1 ? "is" : "are"} on the board.
          </>
        ) : (
          "Tag one this weekend? Send us the photo. Opening-weekend deer go up on the board as they come in."
        )}
      </p>
      {sponsor && <SponsorCredit sponsor={sponsor} placement="opening-weekend" lead="Opening weekend presented by" />}
      {first && (
        <div className="opener-first">
          <EntryCard entry={first} award="First opener buck on the board" share storyFacts={storyFacts} />
        </div>
      )}
    </section>
  );
}
