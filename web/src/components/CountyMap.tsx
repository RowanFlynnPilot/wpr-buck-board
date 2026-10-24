// Where this season's deer came from: one circle per county, its area in proportion to the deer
// posted from there, over Wisconsin's counties in an equal-area projection, so no county looks
// bigger than it is. Counts are drawn as symbols, not as shading: a shaded county reads as a
// rate, and these are deer. The map waits until deer have come from three counties, so it never
// shows one lonely dot. The list under it carries the same numbers for screen readers, and for
// anyone who'd rather read than look. Only the county is public, never the spot.
import { useId } from "react";
import { COUNTIES, COUNTY_MAP_SIZE } from "../counties";
import { apNumber } from "../format";
import type { GalleryEntry } from "../types";

const MIN_COUNTIES = 3;
const R_MAX = 26;
const R_MIN = 7;

export function CountyMap({ entries }: { entries: GalleryEntry[] }) {
  const id = useId();
  const counts = new Map<string, number>();
  for (const entry of entries) counts.set(entry.county, (counts.get(entry.county) ?? 0) + 1);
  if (counts.size < MIN_COUNTIES) return null;

  const max = Math.max(...counts.values());
  // Area in proportion to the count, with a floor so a single deer is still a visible dot.
  const radius = (n: number) => Math.max(R_MIN, R_MAX * Math.sqrt(n / max));
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const legend = [...new Set([1, Math.max(2, Math.round(max / 2)), max])].filter((n) => n <= max).sort((a, b) => a - b);
  const summary = `${apNumber(entries.length)} deer from ${apNumber(counts.size)} counties`;
  const leaders = ranked
    .slice(0, 3)
    .map(([name, n]) => `${name} ${apNumber(n)}`)
    .join(", ");
  const { width, height } = COUNTY_MAP_SIZE;

  return (
    <section className="county-map" aria-labelledby={`${id}-heading`} data-reveal>
      <h2 id={`${id}-heading`}>Where this season’s deer came from</h2>
      <p className="county-map-line">
        <strong>{summary}</strong> so far. {ranked[0][0]} County leads with {apNumber(ranked[0][1])}.
      </p>
      <div className="county-map-figure">
        {/* 40 extra units on the right: room for the legend beside the state's northeastern tip. */}
        <svg viewBox={`0 0 ${width + 40} ${height}`} role="img" aria-label={`Map of Wisconsin: ${summary}. Most: ${leaders}.`}>
          {COUNTIES.map((county) => (
            <path key={county.name} d={county.d}>
              <title>
                {county.name} County: {counts.get(county.name) ?? "no"} deer
              </title>
            </path>
          ))}
          {ranked.map(([name, n]) => {
            const county = COUNTIES.find((c) => c.name === name);
            if (!county) return null;
            const r = radius(n);
            return (
              <g key={name} className="county-dot">
                <circle cx={county.cx} cy={county.cy} r={r}>
                  <title>
                    {name} County: {n} deer
                  </title>
                </circle>
                {r >= 11 && (
                  <text x={county.cx} y={county.cy}>
                    {n}
                  </text>
                )}
              </g>
            );
          })}
          {/* The legend lives in the map's own coordinates, over Lake Michigan, so its circles
              are drawn at the same scale as the ones on the counties. */}
          <g className="county-legend" aria-hidden="true">
            {legend.map((n, i) => {
              const r = radius(n);
              const cx = 500 + i * 56;
              return (
                <g key={n}>
                  <circle cx={cx} cy={112 - r} r={r} />
                  <text x={cx} y={132}>
                    {n === 1 ? "1 deer" : n}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>
      <details className="county-map-list">
        <summary>The counties as a list</summary>
        <ol>
          {ranked.map(([name, n]) => (
            <li key={name}>
              {name} County: {n}
            </li>
          ))}
        </ol>
      </details>
      <p className="county-map-source">County outlines: U.S. Census Bureau. We publish the county a deer came from, never the spot.</p>
    </section>
  );
}
