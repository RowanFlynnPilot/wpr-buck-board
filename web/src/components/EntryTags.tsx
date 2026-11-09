import { apDay } from "../format";

// The tags on a deer's photo: on its card, in the front and in its pop-up.
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
