// Flip through the board's deer in the pop-up (Nov. 9): a list of deer (the board's own, in the
// order it shows them, or the winners, or the Readers' Choice finalists) shares one pop-up, which
// steps through them with its arrows, the arrow keys or a swipe. A card in the list opens it there;
// a card outside any list (the staff queue, the entry form's preview) opens a pop-up of its own.
import { createContext, useContext, useState, type ReactNode } from "react";
import type { CardFacts } from "../data";
import { photoUrl } from "../storage";
import type { EntryFields, Sponsor } from "../types";
import { DeerDialog } from "./DeerDialog";

export interface DeerItem {
  entry: EntryFields;
  award?: string;
  awardSponsor?: Sponsor;
  weekOf?: string;
  fresh?: boolean;
}

// Opens a deer from the list, with what its own card adds (a band's award line, say); false when
// the deer isn't in the list, so the card opens its own pop-up instead.
type OpenDeer = (entryId: string, own: Omit<DeerItem, "entry">) => boolean;

const Viewer = createContext<OpenDeer | null>(null);

export function useDeerViewer(): OpenDeer | null {
  return useContext(Viewer);
}

export function DeerViewer({
  items,
  share = false,
  storyFacts,
  children,
}: {
  items: DeerItem[];
  share?: boolean;
  storyFacts?: Omit<CardFacts, "entry">;
  children: ReactNode;
}) {
  const [view, setView] = useState<{ index: number; origin: number; own: Omit<DeerItem, "entry"> } | null>(null);
  const open: OpenDeer = (entryId, own) => {
    const index = items.findIndex((item) => item.entry.id === entryId);
    if (index < 0) return false;
    setView({ index, origin: index, own });
    return true;
  };
  const item = view && items[view.index];
  // The deer either side, fetched ahead so a flip shows its photo at once.
  const around = view && items.length > 1 ? [-1, 1].map((by) => items[(view.index + by + items.length) % items.length]) : [];

  return (
    <Viewer.Provider value={open}>
      {children}
      {view && item && (
        <DeerDialog
          {...item}
          {...(view.index === view.origin ? view.own : {})}
          share={share}
          storyFacts={storyFacts}
          browse={
            items.length > 1
              ? {
                  position: view.index + 1,
                  count: items.length,
                  step: (by) => setView({ ...view, index: (view.index + by + items.length) % items.length }),
                }
              : undefined
          }
          preload={around.map((near) => photoUrl(near.entry.photo_id, "full"))}
          onClose={() => setView(null)}
        />
      )}
    </Viewer.Provider>
  );
}
