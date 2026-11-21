// The deer camp tally (Nov. 20): the season so far as a camp's tally sheet, pinned on the wall
// beside the county map, a row of hash marks for each count, in fives, with the number beside it.
// Bucks and antlerless deer, bow against gun (the two award categories), first deers, youth
// hunters and hunters 65 and older (both awards too), and counties. All from what the board
// already shows; no ranking by antler size, since the rules say it decides no award. The marks
// are drawn for the eye, the list is the numbers for a screen reader. Past MAX_MARKS the marks stop
// and the number carries the rest.
import { useId } from "react";
import type { GalleryEntry } from "../types";

const MIN_DEER = 3;
// Five slashed fives: a row stays one line on a wide screen, and the number says the rest.
const MAX_MARKS = 25;
const GUNS = new Set(["rifle", "shotgun", "muzzleloader", "handgun"]);

interface Row {
  label: string;
  count: number;
}

export function DeerTally({ entries }: { entries: GalleryEntry[] }) {
  const id = useId();
  if (entries.length < MIN_DEER) return null;
  const count = (test: (e: GalleryEntry) => boolean) => entries.filter(test).length;
  const rows: Row[] = [
    { label: "Bucks", count: count((e) => e.deer_type === "buck") },
    { label: "Antlerless", count: count((e) => e.deer_type === "antlerless") },
    { label: "Bow & crossbow", count: count((e) => e.weapon === "bow" || e.weapon === "crossbow") },
    { label: "Gun & muzzleloader", count: count((e) => GUNS.has(e.weapon)) },
    { label: "First deer", count: count((e) => e.first_deer) },
    { label: "Youth hunters", count: count((e) => e.age_group === "youth") },
    { label: "Hunters 65+", count: count((e) => e.age_group === "veteran") },
    { label: "Counties", count: new Set(entries.map((e) => e.county)).size },
  ];
  let mark = 0;
  return (
    <section className="tally" aria-labelledby={`${id}-heading`} data-reveal>
      <h2 id={`${id}-heading`}>Deer camp tally</h2>
      <p className="tally-note">Every deer on the board so far.</p>
      <dl>
        {rows.map((row) => {
          const start = mark;
          mark += Math.min(row.count, MAX_MARKS);
          return (
            <div key={row.label} className="tally-row">
              <dt>{row.label}</dt>
              <dd>
                <Marks count={row.count} seed={row.label.length * 7} start={start} />
                <span className="tally-count">{row.count.toLocaleString("en-US")}</span>
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

// Hash marks in fives, a little off true like pencil on a clipboard; the same every time (seeded
// by the row), so a reload doesn't redraw them. `start` staggers their drawing in down the sheet.
function Marks({ count, seed, start }: { count: number; seed: number; start: number }) {
  const shown = Math.min(count, MAX_MARKS);
  const groups = Math.ceil(shown / 5);
  // A fixed pseudo-random wobble in -0.5..0.5 for mark n of this row.
  const wobble = (n: number) => {
    const f = Math.sin((seed + n) * 12.9898) * 43758.5453;
    return f - Math.floor(f) - 0.5;
  };
  return (
    <span className="tally-marks" aria-hidden="true">
      {Array.from({ length: groups }, (_, g) => {
        const inGroup = Math.min(5, shown - g * 5);
        return (
          <svg key={g} viewBox="0 0 34 28" className="tally-group">
            {Array.from({ length: Math.min(4, inGroup) }, (_, i) => {
              const n = g * 5 + i;
              const x = 5 + i * 7 + wobble(n) * 1.6;
              return (
                <line
                  key={i}
                  x1={x + wobble(n + 50) * 1.4}
                  y1={3 + wobble(n + 100) * 1.5}
                  x2={x - wobble(n + 150) * 1.4}
                  y2={25 + wobble(n + 200) * 1.5}
                  style={{ ["--i" as string]: start + n }}
                />
              );
            })}
            {inGroup === 5 && (
              <line
                className="tally-slash"
                x1={1 + wobble(g + 300)}
                y1={22 + wobble(g + 350) * 2}
                x2={31 + wobble(g + 400)}
                y2={6 + wobble(g + 450) * 2}
                style={{ ["--i" as string]: start + g * 5 + 4 }}
              />
            )}
          </svg>
        );
      })}
      {count > MAX_MARKS && <span className="tally-more">…</span>}
    </span>
  );
}
