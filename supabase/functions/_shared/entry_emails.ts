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
  seasons: { entries_close_at: string; winners_at: string };
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

function deer(entry: StoredEntry): string {
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

// One simple, readable layout for both emails: paragraphs, with an optional photo up top.
function page(paragraphs: string[], photo?: { src: string; alt: string }): string {
  const image = photo
    ? `<p style="margin:0 0 16px"><img src="${escape(photo.src)}" alt="${escape(photo.alt)}" width="320" style="display:block;max-width:100%;height:auto;border-radius:4px"></p>`
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

  return {
    to: [contact.email],
    subject: "Thanks for entering the Hunting Brag Board",
    idempotencyKey: `brag-board-${id}-confirmation`,
    text: [
      `Hi ${firstName},`,
      "Thanks for entering the Hunting Brag Board! Here’s what we received:",
      lines.join("\n"),
      ...youthNote,
      ...closing,
      "Wausau Pilot & Review\nwausaupilotandreview.com",
    ].join("\n\n"),
    html: page([
      `Hi ${escape(firstName)},`,
      "Thanks for entering the Hunting Brag Board! Here’s what we received:",
      lines.map(escape).join("<br>"),
      ...youthNote.map(escape),
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
