// The two emails a new entry sends, per Shereen's 2026 plan: a confirmation to the entrant
// (replies go to the editor) and a notice to staff (replies go to the entrant). Built from the
// entry as the database stored it, so names and dates read exactly as the board will show them.
// Wording follows the board (web/src/format.ts): AP months, "8-point buck", AP possessives.

import type { Email } from "./email.ts";

export interface StoredEntry {
  hunter_name: string;
  hometown: string;
  county: string;
  harvest_date: string;
  weapon: "bow" | "crossbow" | "rifle" | "shotgun" | "muzzleloader" | "handgun";
  deer_type: "buck" | "antlerless";
  points: number | null;
  first_deer: boolean;
  age_group: "youth" | "adult" | "veteran";
  story: string | null;
  photo_credit: string | null;
  // The season's sponsors, for the thank-you every entrant gets once a deer is posted.
  seasons: { entries_close_at: string; winners_at: string; sponsors?: { name: string; prize: string; tier: string }[] };
  entry_private: {
    submitter_name: string;
    email: string;
    phone: string | null;
    guardian_relationship: string | null;
    hunter_full_name: string | null;
  };
}

const AP_MONTHS = ["Jan.", "Feb.", "March", "April", "May", "June", "July", "Aug.", "Sept.", "Oct.", "Nov.", "Dec."];
const AGE_LABELS = { youth: "17 and under", adult: "18 to 64", veteran: "65 and older" };

// A calendar date (YYYY-MM-DD), e.g. "Nov. 22".
function apDay(date: string): string {
  const [, month, day] = date.split("-").map(Number);
  return `${AP_MONTHS[month - 1]} ${day}`;
}

// A timestamp as a Wausau calendar day.
function apDate(timestamp: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", month: "numeric", day: "numeric" })
    .formatToParts(new Date(timestamp));
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return `${AP_MONTHS[part("month") - 1]} ${part("day")}`;
}

// Entries close at midnight; people think of the last full day.
function apLastDay(exclusiveEnd: string): string {
  return apDate(new Date(Date.parse(exclusiveEnd) - 1).toISOString());
}

function deer(entry: Pick<StoredEntry, "deer_type" | "points">): string {
  if (entry.deer_type === "antlerless") return "antlerless deer";
  return entry.points === null ? "buck" : `${entry.points}-point buck`;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// AP: a singular name ending in s takes only an apostrophe.
function possessive(name: string): string {
  return /s$/i.test(name) ? `${name}’` : `${name}’s`;
}

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
function escape(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

// Lines of the entry as the board describes it.
function record(entry: StoredEntry): string[] {
  return [
    `${entry.hunter_name} of ${entry.hometown}`,
    `${capitalize(deer(entry))}, ${entry.weapon}`,
    `${entry.county} County, ${apDay(entry.harvest_date)}`,
    ...(entry.first_deer ? ["First deer"] : []),
    ...(entry.photo_credit ? [`Photo by ${entry.photo_credit}`] : []),
  ];
}

// A sponsor's own link, tagged like the board's so the visit shows up in its analytics as ours.
function sponsorLink(url: string | null, placement: string): string | null {
  if (!url) return null;
  try {
    const tagged = new URL(url);
    tagged.searchParams.set("utm_source", "wausaupilotandreview");
    tagged.searchParams.set("utm_medium", "email");
    tagged.searchParams.set("utm_campaign", "brag-board");
    tagged.searchParams.set("utm_content", placement);
    return tagged.toString();
  } catch {
    return null;
  }
}

// One simple, readable layout for every email: paragraphs, with an optional photo up top (linked
// when it has somewhere to go).
function page(paragraphs: string[], photo?: { src: string; alt: string; width?: number; href?: string }): string {
  const img = photo
    ? `<img src="${escape(photo.src)}" alt="${escape(photo.alt)}" width="${photo.width ?? 320}" style="display:block;max-width:100%;height:auto;border-radius:4px;border:0">`
    : "";
  const image = photo
    ? `<p style="margin:0 0 16px">${photo.href ? `<a href="${escape(photo.href)}">${img}</a>` : img}</p>`
    : "";
  return `<!doctype html><html><body style="margin:0;padding:24px 16px;background:#ffffff">` +
    `<div style="max-width:560px;margin:0 auto;border-top:4px solid #f26a1b;padding-top:16px;` +
    `font:16px/1.5 Arial,Helvetica,sans-serif;color:#1e2622">${image}` +
    paragraphs.map((p) => `<p style="margin:0 0 16px">${p}</p>`).join("") +
    `</div></body></html>`;
}

export function confirmationEmail(entry: StoredEntry, id: string): Email {
  const contact = entry.entry_private;
  const firstName = contact.submitter_name.trim().split(/\s+/)[0];
  const youth = entry.age_group === "youth";
  const lines = record(entry);
  const closing = [
    `Our staff reviews every entry before it goes on the board. Watch for your deer in our Friday Brag Board ` +
    `feature. Winners will be announced ${apDate(entry.seasons.winners_at)} and contacted by email. Got another ` +
    `deer this season? Enter again anytime through ${apLastDay(entry.seasons.entries_close_at)}.`,
    "Questions, or need to change something? Just reply to this email.",
  ];
  const youthNote = youth ? [`${entry.hunter_name} is the name we’ll publish, as you chose.`] : [];
  // The thank-you itself comes with the posted email, so a deer that isn't posted doesn't earn it.
  const thankYou = entry.seasons.sponsors?.find((s) => s.tier === "thank_you");
  const thankYouNote = thankYou
    ? [`When your deer goes on the board, we’ll email you its link, and a thank-you from ${thankYou.name}: ${thankYou.prize}.`]
    : [];

  return {
    to: [contact.email],
    subject: "Thanks for entering the Hunting Brag Board",
    idempotencyKey: `brag-board-${id}-confirmation`,
    text: [
      `Hi ${firstName},`,
      "Thanks for entering the Hunting Brag Board! Here’s what we received:",
      lines.join("\n"),
      ...youthNote,
      ...thankYouNote,
      ...closing,
      "Wausau Pilot & Review\nwausaupilotandreview.com",
    ].join("\n\n"),
    html: page([
      `Hi ${escape(firstName)},`,
      "Thanks for entering the Hunting Brag Board! Here’s what we received:",
      lines.map(escape).join("<br>"),
      ...youthNote.map(escape),
      ...thankYouNote.map(escape),
      ...closing.map(escape),
      `Wausau Pilot &amp; Review<br><a href="https://wausaupilotandreview.com" style="color:#2c6a62">wausaupilotandreview.com</a>`,
    ]),
  };
}

export function staffNotice(
  entry: StoredEntry,
  id: string,
  links: { to: string[]; thumbnail: string; queue: string; newsletter: boolean },
): Email {
  const contact = entry.entry_private;
  const fullName = contact.hunter_full_name ?? entry.hunter_name;
  const youth = entry.age_group === "youth";
  const who = [
    `${fullName} of ${entry.hometown} (${AGE_LABELS[entry.age_group]})`,
    ...(fullName !== entry.hunter_name ? [`The board will show “${entry.hunter_name}.”`] : []),
    `${capitalize(deer(entry))}, ${entry.weapon}. ${entry.county} County, ${apDay(entry.harvest_date)}.` +
    (entry.first_deer ? " First deer." : ""),
    ...(entry.photo_credit ? [`Photo by ${entry.photo_credit}`] : []),
  ];
  const relationship = youth && contact.guardian_relationship ? `, the hunter’s ${contact.guardian_relationship}` : "";
  const reach = [contact.email, contact.phone].filter(Boolean).join(", ");
  const entrant = `Entered by ${contact.submitter_name}${relationship}: ${reach}.` +
    (links.newsletter ? " Signed up for the newsletter." : "");
  const story = entry.story ? [`“${entry.story}”`] : [];

  return {
    to: links.to,
    replyTo: contact.email,
    subject: `New Brag Board entry: ${possessive(fullName)} ${deer(entry)}`,
    idempotencyKey: `brag-board-${id}-staff`,
    text: [
      "A new deer is waiting for review.",
      who.join("\n"),
      ...story,
      entrant,
      `Review it in the staff queue: ${links.queue}`,
      "Reply to this email to reach the entrant.",
    ].join("\n\n"),
    html: page(
      [
        "A new deer is waiting for review.",
        who.map(escape).join("<br>"),
        ...story.map((s) => escape(s).replace(/\n/g, "<br>")),
        escape(entrant),
        `<a href="${escape(links.queue)}" style="color:#2c6a62;font-weight:bold">Review it in the staff queue</a>`,
        `<span style="color:#6e6353;font-size:14px">Reply to this email to reach the entrant.</span>`,
      ],
      { src: links.thumbnail, alt: `${possessive(fullName)} ${deer(entry)}` },
    ),
  };
}

// What posted_notice() returns (migration 0013): the deer as the board shows it, who entered it,
// and the season's dates.
export interface PostedNotice {
  hunter_name: string;
  hometown: string;
  county: string;
  harvest_date: string;
  weapon: StoredEntry["weapon"];
  deer_type: StoredEntry["deer_type"];
  points: number | null;
  first_deer: boolean;
  age_group: StoredEntry["age_group"];
  photo_id: string;
  share_card: string | null;
  submitter_name: string;
  email: string;
  entries_close_at: string;
  voting_open_at: string;
  voting_close_at: string;
  winners_at: string;
  // The thank-you sponsor's offer (migration 0016); redemption details null until staff add them.
  thank_you: {
    sponsor: string;
    offer: string;
    website_url: string | null;
    how_to_redeem: string | null;
    code: string | null;
  } | null;
}

const DNR_CERTIFICATE = "https://dnr.wisconsin.gov/topic/hunt/firstcert.html";
const DNR_DONATION = "https://dnr.wisconsin.gov/topic/hunt/donation.html";

// "Dec. 14–18", or "Nov. 30 to Dec. 4" across a month.
function apRange(start: string, exclusiveEnd: string): string {
  const [first, last] = [apDate(start), apLastDay(exclusiveEnd)];
  const [firstMonth, lastMonth] = [first.split(" ")[0], last.split(" ")[0]];
  return firstMonth === lastMonth ? `${first}–${last.split(" ")[1]}` : `${first} to ${last}`;
}

// Sent once when staff post a deer (the entry-posted function): the deer is on the board, here's
// its link, share it. Every entrant who shares it brings the board new readers and new entrants.
export function postedEmail(
  notice: PostedNotice,
  id: string,
  links: { board: string; share: string; image: string; imageIsCard: boolean },
): Email {
  const firstName = notice.submitter_name.trim().split(/\s+/)[0];
  const what = notice.first_deer ? "first deer" : deer(notice);
  const headline = `${possessive(notice.hunter_name)} ${what} is on the Hunting Brag Board`;
  const onBoard = `${links.board}#entry=${id}&from=email`;
  const enter = `${links.board}#enter`;
  const facebook = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(links.share)}`;
  const season =
    `Everyone with a deer on the board is in the prize drawing. Readers vote for Readers’ Choice ` +
    `${apRange(notice.voting_open_at, notice.voting_close_at)}, and winners are announced ${apDate(notice.winners_at)}.`;
  const another = `Got another deer? Enter it anytime through ${apLastDay(notice.entries_close_at)}.`;
  const story = "On a phone, tap Share under the deer on the board for an image sized for Facebook and Instagram Stories.";
  // Two things the DNR offers every hunter: a free certificate for a first deer, and a free way to
  // give venison to a food pantry.
  const certificate = notice.first_deer
    ? `A first deer deserves a certificate: the Wisconsin DNR makes a free one from your photo at ${DNR_CERTIFICATE}`
    : null;
  const donation =
    `More venison than freezer space? Donating a deer to a food pantry is free through the DNR’s Deer Donation ` +
    `Program. Participating processors are listed at ${DNR_DONATION} (deer from counties that require CWD testing ` +
    `need a test first).`;
  const link = (href: string, text: string, bold = false) =>
    `<a href="${escape(href)}" style="color:#2c6a62${bold ? ";font-weight:bold" : ""}">${escape(text)}</a>`;
  // Every entrant whose deer is posted gets the thank-you sponsor's offer, here and only here.
  const thanks = notice.thank_you;
  const redeem = thanks && (thanks.how_to_redeem ?? `Show this email at ${thanks.sponsor} to redeem it.`);
  const thanksText = thanks
    ? [`A thank-you from ${thanks.sponsor}: ${thanks.offer}. ${redeem}${thanks.code ? ` Your code: ${thanks.code}` : ""}`]
    : [];
  const thanksSponsor = thanks && sponsorLink(thanks.website_url, "posted-email");
  const thanksHtml = thanks
    ? [
      `<strong>A thank-you from ${thanksSponsor ? link(thanksSponsor, thanks.sponsor, true) : escape(thanks.sponsor)}:</strong> ` +
      `${escape(thanks.offer)}. ${escape(redeem ?? "")}` +
      (thanks.code ? ` Your code: <strong style="font-size:18px;letter-spacing:1px">${escape(thanks.code)}</strong>` : ""),
    ]
    : [];

  return {
    to: [notice.email],
    subject: headline,
    idempotencyKey: `brag-board-${id}-posted`,
    text: [
      `Hi ${firstName},`,
      `Good news: ${headline}.`,
      `See it on the board: ${onBoard}`,
      `Share it on Facebook: ${facebook}\nOr send this link: ${links.share}`,
      ...thanksText,
      story,
      season,
      ...(certificate ? [certificate] : []),
      `${another} ${enter}`,
      donation,
      "Questions? Just reply to this email.",
      "Wausau Pilot & Review\nwausaupilotandreview.com",
    ].join("\n\n"),
    html: page(
      [
        `Hi ${escape(firstName)},`,
        `Good news: ${escape(headline)}.`,
        link(onBoard, "See it on the board", true),
        `Share it with friends and family: ${link(facebook, "share on Facebook")}, or send this link: ${link(links.share, links.share)}`,
        ...thanksHtml,
        escape(story),
        escape(season),
        ...(notice.first_deer
          ? [`A first deer deserves a certificate: the Wisconsin DNR makes a free one from your photo. ${link(DNR_CERTIFICATE, "Get the certificate")}`]
          : []),
        `${escape(another)} ${link(enter, "Enter your deer")}`,
        `More venison than freezer space? Donating a deer to a food pantry is free through the DNR’s ${link(DNR_DONATION, "Deer Donation Program")}, ` +
        "at participating processors (deer from counties that require CWD testing need a test first).",
        "Questions? Just reply to this email.",
        `Wausau Pilot &amp; Review<br>${link("https://wausaupilotandreview.com", "wausaupilotandreview.com")}`,
      ],
      { src: links.image, alt: headline, width: links.imageIsCard ? 560 : 320, href: onBoard },
    ),
  };
}
