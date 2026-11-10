import { apDay, apNumber } from "../format";
import { NEW_DAYS } from "../phase";

// The tags on a deer's photo: on its card, in the front and in its pop-up. `fresh`: entered in the
// last few days (isNew in phase.ts).
export function EntryTags({ firstDeer, weekOf, fresh = false }: { firstDeer: boolean; weekOf?: string; fresh?: boolean }) {
  if (!firstDeer && !weekOf && !fresh) return null;
  return (
    <span className="entry-tags">
      {fresh && (
        <span className="entry-tag entry-tag-new" title={`Entered in the last ${apNumber(NEW_DAYS)} days`}>
          New
        </span>
      )}
      {weekOf && (
        <span className="entry-tag entry-tag-week" title={`Deer of the Week, ${apDay(weekOf)}`}>
          Deer of the Week
        </span>
      )}
      {firstDeer && <span className="entry-tag">First deer</span>}
    </span>
  );
}
