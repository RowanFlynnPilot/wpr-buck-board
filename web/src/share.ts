// Links to one deer. A share link is the share Worker's page on WPR's own domain
// (share/src/index.ts), so a Facebook preview shows the deer; it redirects people to the gallery
// page at #entry=<id>&from=share. The front-page strip links there directly. On the gallery page
// the embed snippet (README) hands that to this app as ?entry=<id>&from=…, which opens the deer.
import { env } from "./env";
import { describeDeer } from "./format";
import type { EntryFields } from "./types";

// The Worker's route sits on the gallery page's host (share/wrangler.toml).
const SHARE_BASE = new URL("/brag/", env.galleryPageUrl).href;
const ENTRY_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function shareUrl(entryId: string): string {
  return SHARE_BASE + entryId;
}

export function facebookShareUrl(entryId: string): string {
  return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl(entryId))}`;
}

export function entryPageUrl(entryId: string, from: "front-page"): string {
  return `${env.galleryPageUrl}#entry=${entryId}&from=${from}`;
}

// Matches the share page's headline (share/src/card.ts).
export function shareTitle(entry: EntryFields): string {
  const name = /s$/i.test(entry.hunter_name) ? `${entry.hunter_name}’` : `${entry.hunter_name}’s`;
  const deer = entry.first_deer ? "first deer" : describeDeer(entry.deer_type, entry.points).toLowerCase();
  return `${name} ${deer} on the Hunting Brag Board`;
}

// The deer a link opened, read once at load. It rides in the query string, not the hash, so
// Plausible counts the view as #/gallery rather than one page per deer.
const params = new URLSearchParams(window.location.search);
const linkedId = params.get("entry");
const from = params.get("from");
export const LINKED_ENTRY =
  linkedId && ENTRY_ID.test(linkedId)
    ? { id: linkedId.toLowerCase(), from: from === "share" || from === "front-page" ? from : "link" }
    : null;
