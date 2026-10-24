// The board before its first deer: the front's picture is the thing itself, so the page still
// opens on a deer rather than on type. Shown before entries open and until the first deer posts;
// LeadDeer takes its place from then on. The photograph is a whitetail buck by David Restivo for
// the National Park Service (public domain, via Wikimedia Commons), named in its caption so no one
// takes it for an entry. The title's Enter button sits just above these words, so they carry no
// link of their own.
import { apDate } from "../format";
import type { Season } from "../types";

const PHOTO = `${import.meta.env.BASE_URL}whitetail-buck-nps.jpg`;

export function EmptyLead({ season }: { season: Season }) {
  const open = season.phase === "entries";
  return (
    <>
      <figure className="lead-photo lead-photo-nps">
        <img
          src={PHOTO}
          width={1600}
          height={1066}
          alt="A whitetail buck bedded in autumn bracken, antlers up beside a tree trunk"
          fetchPriority="high"
          decoding="async"
        />
      </figure>
      <section className="lead-text lead-empty" aria-labelledby="lead-heading">
        <h2 id="lead-heading" className="lead-heading">
          {open ? "Nothing on the board yet" : `Entries open ${apDate(season.entries_open_at)}`}
        </h2>
        <p className="lead-name">{open ? "Be the first on the board." : "The season's first deer goes up here."}</p>
        <p className="lead-story">
          Every deer sent in goes up here once an editor has seen it, newest first: the hunter, the hometown, the
          county and the story.
        </p>
        <p className="entry-credit">A whitetail buck in autumn bracken. Photo: David Restivo, National Park Service</p>
      </section>
    </>
  );
}
