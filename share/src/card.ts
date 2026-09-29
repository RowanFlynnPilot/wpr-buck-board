// What a link preview says about one deer, and the page that carries it. The wording follows
// the board (web/src/format.ts): AP months, "8-point buck", and the name as it appears there
// (first names only for hunters 17 and under; staff fix those before posting).

export type Weapon = "bow" | "crossbow" | "rifle" | "shotgun" | "muzzleloader" | "handgun";

// One row of the public gallery_entries view: approved deer only.
export interface Entry {
  season_id: string;
  hunter_name: string;
  hometown: string;
  county: string;
  harvest_date: string;
  weapon: Weapon;
  deer_type: "buck" | "antlerless";
  points: number | null;
  first_deer: boolean;
  photo_id: string;
}

export interface Card {
  entry: Entry;
  presenting: string | null;
  photo: { url: string; width: number; height: number } | { url: string };
}

const AP_MONTHS = ["Jan.", "Feb.", "March", "April", "May", "June", "July", "Aug.", "Sept.", "Oct.", "Nov.", "Dec."];

function apDay(date: string): string {
  const [, month, day] = date.split("-").map(Number);
  return `${AP_MONTHS[month - 1]} ${day}`;
}

function deer(entry: Entry): string {
  if (entry.deer_type === "antlerless") return "antlerless deer";
  return entry.points === null ? "buck" : `${entry.points}-point buck`;
}

// AP: a singular name ending in s takes only an apostrophe (James’ buck).
function possessive(name: string): string {
  return /s$/i.test(name) ? `${name}’` : `${name}’s`;
}

export function cardText({ entry, presenting }: Pick<Card, "entry" | "presenting">) {
  const name = entry.hunter_name;
  const title = `${possessive(name)} ${entry.first_deer ? "first deer" : deer(entry)} on the Hunting Brag Board`;
  const description =
    `${name} of ${entry.hometown} took this ${deer(entry)} with a ${entry.weapon} in ${entry.county} County ` +
    `on ${apDay(entry.harvest_date)}. See every deer on the Hunting Brag Board` +
    (presenting ? `, presented by ${presenting}.` : ".");
  // Matches the photo's alt text on the board.
  const alt = `${possessive(name)} ${deer(entry)}`;
  return { title, description, alt };
}

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

function escape(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

// Crawlers read the head. The body is only for a person the crawler check missed: the script
// sends them on, and the link is there if scripts are off. No meta refresh: Facebook's crawler
// follows one, and would read the gallery page's tags instead of these.
export function renderSharePage({ card, shareUrl, entryPage }: { card: Card; shareUrl: string; entryPage: string }) {
  const { title, description, alt } = cardText(card);
  const size = "width" in card.photo
    ? `\n<meta property="og:image:width" content="${card.photo.width}">\n<meta property="og:image:height" content="${card.photo.height}">`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<meta name="description" content="${escape(description)}">
<meta name="robots" content="noindex">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Wausau Pilot &amp; Review">
<meta property="og:url" content="${escape(shareUrl)}">
<meta property="og:title" content="${escape(title)}">
<meta property="og:description" content="${escape(description)}">
<meta property="og:image" content="${escape(card.photo.url)}">
<meta property="og:image:type" content="image/jpeg">${size}
<meta property="og:image:alt" content="${escape(alt)}">
<meta name="twitter:card" content="summary_large_image">
<style>body{margin:0;padding:2rem 1rem;background:#f6f2e9;color:#1e2622;font:1rem/1.5 system-ui,sans-serif}main{max-width:40rem;margin:0 auto}a{color:#2c6a62}</style>
</head>
<body>
<main>
<h1>${escape(title)}</h1>
<p>${escape(description)}</p>
<p><a href="${escape(entryPage)}">See it on the Hunting Brag Board</a></p>
</main>
<script>location.replace(${JSON.stringify(entryPage).replace(/</g, "\\u003c")});</script>
</body>
</html>
`;
}
