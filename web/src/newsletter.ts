// The Friday newsletter's Brag Board section, as email HTML that matches WPR's newsletter
// templates (the wpr-newsletter repo): rows for the 600px content table, 32px gutters, a teal
// section rule, an Oswald eyebrow, Merriweather names, Source Sans 3 body, inline styles only.
// Staff paste it into a Custom HTML block in the Noptin campaign, so it comes wrapped the way
// that repo's noptin_blocks.py wraps each block, and must stay under Noptin's per-block limit.
import { apDay, apNumber, describeDeer, WEAPON_LABELS } from "./format";
import { phaseLine } from "./phase";
import { sponsorHref } from "./sales";
import { logoUrl, photoUrl } from "./supabase";
import type { EntryFields, Season, Sponsor } from "./types";

// Noptin silently blanks a single raw-HTML block over about 13 KB.
export const NOPTIN_BLOCK_LIMIT = 13_000;
// Eight deer (four rows) stays well under that limit.
export const MAX_DEER = 8;

const SANS = "'Source Sans 3',Helvetica,Arial,sans-serif";
const SERIF = "'Merriweather',Georgia,serif";
const OSWALD = "'Oswald','Arial Narrow',Arial,sans-serif";
const TEAL = "#3A867C";

export interface NewsletterSection {
  season: Season;
  presenting: Sponsor | undefined;
  picks: EntryFields[]; // the deer to show, newest first
  posted: number; // deer posted in the window; picks may be fewer
  onBoard: number; // every deer on the board
  since: string | null; // YYYY-MM-DD the window starts, or null for "this week"
  edition: string; // YYYY-MM-DD the newsletter goes out, for utm_campaign
  galleryUrl: string;
  enterUrl: string;
}

function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Same convention as the newsletter pipeline, so Brag Board clicks show up beside its stories.
function withUtm(url: string, edition: string): string {
  const tagged = new URL(url);
  tagged.searchParams.set("utm_source", "newsletter");
  tagged.searchParams.set("utm_medium", "email");
  tagged.searchParams.set("utm_campaign", `brag-board-${edition}`);
  return tagged.toString();
}

function deerCell(entry: EntryFields, href: string, side: "left" | "right"): string {
  const deer = describeDeer(entry.deer_type, entry.points);
  const padding = side === "left" ? "0 8px 18px 0" : "0 0 18px 8px";
  return `<td width="50%" valign="top" style="width:50%; padding:${padding};">
            <a href="${esc(href)}" style="text-decoration:none;"><img src="${esc(photoUrl(entry.photo_id, "thumb"))}" alt="${esc(`${entry.hunter_name}'s ${deer.toLowerCase()}`)}" width="260" style="display:block; width:100%; max-width:260px; height:auto; border:0; border-radius:6px;"></a>
            <p style="margin:8px 0 0; font-family:${SERIF}; font-size:16px; line-height:1.3; font-weight:700; color:#1a1a1a;">${esc(entry.hunter_name)}</p>
            <p style="margin:3px 0 0; font-family:${SANS}; font-size:13px; line-height:1.45; color:#555555;">${esc(deer)}, ${WEAPON_LABELS[entry.weapon].toLowerCase()}<br>${esc(entry.hometown)} &middot; ${esc(entry.county)} County, ${apDay(entry.harvest_date)}</p>
          </td>`;
}

// Logos in email: PNG, JPEG or GIF only (Gmail drops SVG, Outlook drops WebP). Otherwise, the name.
function presentedByRow(sponsor: Sponsor): string {
  const href = sponsorHref(sponsor, "newsletter");
  const emailSafe = /\.(png|jpe?g|gif)$/i.test(sponsor.logo_path);
  const mark = emailSafe
    ? `<img src="${esc(logoUrl(sponsor.logo_path))}" alt="${esc(sponsor.name)}" height="32" style="height:32px; width:auto; border:0; vertical-align:middle;">`
    : `<strong style="color:#1a1a1a;">${esc(sponsor.name)}</strong>`;
  const linked = href ? `<a href="${esc(href)}" style="text-decoration:none;">${mark}</a>` : mark;
  return `
        <tr>
          <td class="px" style="padding:8px 32px 0; font-family:${SANS}; font-size:13px; color:#555555;">Presented by ${linked}</td>
        </tr>`;
}

// The section's rows, for the newsletter's 600px content table.
export function newsletterRows(section: NewsletterSection): string {
  const { picks, posted, edition } = section;
  const board = withUtm(section.galleryUrl, edition);
  const when = section.since ? `Since ${apDay(section.since)},` : "This week,";
  const intro = [
    `${when} ${apNumber(posted)} new deer went up on the Brag Board.`,
    picks.length < posted ? `Here are ${apNumber(picks.length)} of them.` : "",
    phaseLine(section.season),
  ]
    .filter(Boolean)
    .join(" ");

  const grid: string[] = [];
  for (let i = 0; i < picks.length; i += 2) {
    const right = picks[i + 1] ? deerCell(picks[i + 1], board, "right") : `<td width="50%" style="width:50%;">&nbsp;</td>`;
    grid.push(`<tr>
          ${deerCell(picks[i], board, "left")}
          ${right}
        </tr>`);
  }

  const links =
    section.season.phase === "entries"
      ? `<a href="${esc(board)}" style="color:${TEAL}; font-weight:700; text-decoration:none;">See all ${section.onBoard.toLocaleString("en-US")} deer on the Brag Board&nbsp;&rarr;</a> &nbsp;&middot;&nbsp; <a href="${esc(withUtm(section.enterUrl, edition))}" style="color:${TEAL}; font-weight:700; text-decoration:none;">Enter your deer&nbsp;&rarr;</a>`
      : `<a href="${esc(board)}" style="color:${TEAL}; font-weight:700; text-decoration:none;">See the Brag Board&nbsp;&rarr;</a>`;

  return `
        <!-- ===================== HUNTING BRAG BOARD (from the Brag Board's staff page, ${edition}) ===================== -->
        <tr><td class="px" style="padding:22px 32px 0;"><hr style="border:none; border-top:2px solid ${TEAL}; margin:0;"></td></tr>
        <tr>
          <td class="px oswald" style="padding:10px 32px 0; font-family:${OSWALD}; font-size:15px; font-weight:700; letter-spacing:2px; text-transform:uppercase; color:#1a1a1a;">Hunting Brag Board</td>
        </tr>${section.presenting ? presentedByRow(section.presenting) : ""}
        <tr>
          <td class="px body" style="padding:8px 32px 0; font-family:${SANS}; font-size:15px; line-height:1.5; color:#333333;">${esc(intro)}</td>
        </tr>
        <tr>
          <td class="px" style="padding:14px 32px 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%; border-collapse:collapse;">
        ${grid.join("\n        ")}
            </table>
          </td>
        </tr>
        <tr>
          <td class="px" style="padding:0 32px 6px; text-align:center; font-family:${SANS}; font-size:14px;">${links}</td>
        </tr>`;
}

// One Noptin Custom HTML block, wrapped exactly as noptin_blocks.py wraps the pipeline's blocks.
export function wrapForNoptin(rows: string): string {
  return (
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;"><tr><td align="center">' +
    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" align="center" style="width:600px;max-width:100%;margin:0 auto;background:#ffffff;border-collapse:collapse;"><tbody>' +
    rows +
    "\n</tbody></table></td></tr></table>"
  );
}
