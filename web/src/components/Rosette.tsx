// An award ribbon, the county-fair kind: a pleated rosette with two tails. Blaze for the grand prize
// (Readers' Choice), teal for the other awards. Decoration: the award's name is always in the text.

// The pleats: a star of many short points around the centre.
function pleats(points: number, outer: number, inner: number): string {
  return Array.from({ length: points * 2 }, (_, i) => {
    const angle = (i * Math.PI) / points - Math.PI / 2;
    const r = i % 2 === 0 ? outer : inner;
    return `${(32 + r * Math.cos(angle)).toFixed(2)},${(32 + r * Math.sin(angle)).toFixed(2)}`;
  }).join(" ");
}

const PLEATS = pleats(28, 30, 26);

export function Rosette({ grand = false, className }: { grand?: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 64 84"
      className={["rosette", grand ? "rosette-grand" : "", className ?? ""].filter(Boolean).join(" ")}
      aria-hidden="true"
      focusable="false"
    >
      <polygon className="rosette-tail" points="26,38 13,80 20,75 25,83 35,42" />
      <polygon className="rosette-tail" points="38,38 51,80 44,75 39,83 29,42" />
      <polygon className="rosette-pleats" points={PLEATS} />
      <circle className="rosette-ring" cx="32" cy="32" r="20" />
      <circle className="rosette-centre" cx="32" cy="32" r="16" />
      <circle className="rosette-stitch" cx="32" cy="32" r="12.5" />
    </svg>
  );
}
