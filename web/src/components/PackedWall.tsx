// The board's prints packed like a real counter wall (Nov. 9): prints take their own heights (a
// landscape is short, a portrait tall, a long story longer), and in rows that left a gap under every
// short one. On a wide screen each print instead goes up under whichever column is shortest, so the
// wall closes up and the newest still lead across the top, left to right.
//
// The prints stay in the page in the board's order, so tab order, a screen reader and the pop-up's
// flip-through are unchanged; only their place on the grid moves. The grid's rows are 4px tracks,
// and each print spans as many as its height and the gap under it need. Measured heights come from
// layout (offsetHeight, which a print's tilt and entrance don't change); a photo that loads, a
// font, a narrower window or another filter re-packs it. Phones keep their two-across rows, and
// without script the wall is the plain grid.
import { useLayoutEffect, useRef, type ReactNode } from "react";

// Where the wall packs: phones (under 600px) keep two prints across in rows.
const WIDE = "(min-width: 600px)";
// One row track. A print spans whole tracks, so the gap under it varies by less than this.
const TRACK = 4;

export function PackedWall({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  // After every render (a filter, Show more, the board loading), then whenever a print or the wall
  // changes size.
  useLayoutEffect(() => {
    const wall = ref.current;
    if (!wall || typeof ResizeObserver === "undefined") return;
    const wide = window.matchMedia(WIDE);

    const pack = () => {
      const prints = [...wall.children] as HTMLElement[];
      // The wall's own columns, read with the last packing's places cleared: a print placed in a
      // fourth column holds that column open after the window narrows to three.
      for (const print of prints) print.style.gridArea = "";
      const columns = wide.matches ? getComputedStyle(wall).gridTemplateColumns.split(" ").length : 1;
      if (columns < 2 || prints.length < 2) {
        delete wall.dataset.packed;
        return;
      }
      // Packed first, so each print sits at its own height with the wall's gap under it; then every
      // height read before any print moves, so the browser lays the wall out once.
      wall.dataset.packed = "";
      const gap = parseFloat(getComputedStyle(prints[0]).marginBottom) || 0;
      const spans = prints.map((print) => Math.max(1, Math.ceil((print.offsetHeight + gap) / TRACK)));
      const bottoms: number[] = new Array(columns).fill(0);
      prints.forEach((print, i) => {
        // The shortest column, the leftmost of any tie: the first row fills left to right.
        const column = bottoms.indexOf(Math.min(...bottoms));
        print.style.gridArea = `${bottoms[column] + 1} / ${column + 1} / span ${spans[i]} / span 1`;
        bottoms[column] += spans[i];
      });
    };

    pack();
    // Re-packing moves prints, which can change the wall's own height; waiting a frame keeps that
    // out of the observer's own pass (a loop the browser reports as an error).
    let frame = 0;
    const later = () => {
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0;
          pack();
        });
    };
    const watch = new ResizeObserver(later);
    watch.observe(wall);
    for (const print of wall.children) watch.observe(print);
    return () => {
      watch.disconnect();
      cancelAnimationFrame(frame);
    };
  });

  return (
    <div ref={ref} className="entry-grid">
      {children}
    </div>
  );
}
