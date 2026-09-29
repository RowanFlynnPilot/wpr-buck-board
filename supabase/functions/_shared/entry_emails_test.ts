import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { confirmationEmail, staffNotice, type StoredEntry } from "./entry_emails.ts";

const ADULT: StoredEntry = {
  hunter_name: "Tom Lovlien",
  hometown: "Weston",
  county: "Marathon",
  harvest_date: "2026-11-22",
  weapon: "rifle",
  deer_type: "buck",
  points: 9,
  first_deer: false,
  age_group: "adult",
  story: null,
  photo_credit: null,
  // Entries close at midnight Dec. 14 Central (the end of Dec. 13); winners on Dec. 21.
  seasons: { entries_close_at: "2026-12-14T06:00:00Z", winners_at: "2026-12-21T06:00:00Z" },
  entry_private: {
    submitter_name: "Tom Lovlien",
    email: "tom@example.com",
    phone: null,
    guardian_relationship: null,
    hunter_full_name: "Tom Lovlien",
  },
};

const YOUTH: StoredEntry = {
  ...ADULT,
  hunter_name: "Makiyah",
  hometown: "Mosinee",
  points: 10,
  first_deer: true,
  age_group: "youth",
  story: "First time out with Dad <3",
  photo_credit: "Jenna Koskey",
  entry_private: {
    submitter_name: "Jenna Koskey",
    email: "parent@example.com",
    phone: "715-555-0100",
    guardian_relationship: "parent",
    hunter_full_name: "Makiyah Koskey",
  },
};

const LINKS = {
  to: ["editor@wausaupilotandreview.com", "weber.chris@wausaupilotandreview.com"],
  thumbnail: "https://project.supabase.co/storage/v1/object/public/entry-photos/p1/thumb.jpg",
  queue: "https://rowanflynnpilot.github.io/wpr-buck-board/#/admin",
  newsletter: true,
};

Deno.test("the confirmation goes to the entrant, in Shereen's words, with the season's dates", () => {
  const email = confirmationEmail(ADULT, "e1");
  assertEquals(email.to, ["tom@example.com"]);
  assertEquals(email.replyTo, undefined, "replies go to the mailer's reply-to: the editor");
  assertEquals(email.subject, "Thanks for entering the Hunting Brag Board");
  assertEquals(email.idempotencyKey, "brag-board-e1-confirmation");
  assertStringIncludes(email.text, "Hi Tom,");
  assertStringIncludes(email.text, "Tom Lovlien of Weston\n9-point buck, rifle\nMarathon County, Nov. 22");
  assertStringIncludes(email.text, "Winners will be announced Dec. 21");
  assertStringIncludes(email.text, "Enter again anytime through Dec. 13.");
  assert(!email.text.includes("as you chose"), "the youth line is for youth entries only");
});

Deno.test("a youth confirmation greets the parent and names the hunter as the parent chose", () => {
  const email = confirmationEmail(YOUTH, "e2");
  assertEquals(email.to, ["parent@example.com"]);
  assertStringIncludes(email.text, "Hi Jenna,");
  assertStringIncludes(email.text, "Makiyah of Mosinee\n10-point buck, rifle\nMarathon County, Nov. 22\nFirst deer\nPhoto by Jenna Koskey");
  assertStringIncludes(email.text, "Makiyah is the name we’ll publish, as you chose.");
});

Deno.test("the staff notice has everything staff need, and replies reach the entrant", () => {
  const email = staffNotice(YOUTH, "e2", LINKS);
  assertEquals(email.to, LINKS.to);
  assertEquals(email.replyTo, "parent@example.com");
  assertEquals(email.subject, "New Brag Board entry: Makiyah Koskey’s 10-point buck");
  assertEquals(email.idempotencyKey, "brag-board-e2-staff");
  assertStringIncludes(email.text, "Makiyah Koskey of Mosinee (17 and under)\nThe board will show “Makiyah.”");
  assertStringIncludes(email.text, "10-point buck, rifle. Marathon County, Nov. 22. First deer.");
  assertStringIncludes(email.text, "Entered by Jenna Koskey, the hunter’s parent: parent@example.com, 715-555-0100. Signed up for the newsletter.");
  assertStringIncludes(email.text, "Review it in the staff queue: https://rowanflynnpilot.github.io/wpr-buck-board/#/admin");
  assertStringIncludes(email.html, `<img src="${LINKS.thumbnail}"`);
});

Deno.test("an adult's notice leaves out what doesn't apply", () => {
  const email = staffNotice(ADULT, "e1", { ...LINKS, newsletter: false });
  assertEquals(email.subject, "New Brag Board entry: Tom Lovlien’s 9-point buck");
  assertStringIncludes(email.text, "Entered by Tom Lovlien: tom@example.com.");
  assert(!email.text.includes("The board will show"));
  assert(!email.text.includes("newsletter"));
  assert(!email.text.includes("“"), "no story, no quote");
});

Deno.test("what entrants typed can't become markup", () => {
  const html = staffNotice(YOUTH, "e2", LINKS).html + confirmationEmail({ ...YOUTH, hometown: `<b>Mosinee</b>` }, "e2").html;
  assert(!html.includes("<3") && html.includes("&lt;3"), "the story is escaped");
  assert(!html.includes("<b>Mosinee</b>") && html.includes("&lt;b&gt;Mosinee&lt;/b&gt;"), "the hometown is escaped");
});

Deno.test("names ending in s take an apostrophe alone, and antlerless deer read as such", () => {
  const email = staffNotice(
    { ...ADULT, deer_type: "antlerless", points: null, entry_private: { ...ADULT.entry_private, hunter_full_name: "James Novak Jones" } },
    "e3",
    LINKS,
  );
  assertEquals(email.subject, "New Brag Board entry: James Novak Jones’ antlerless deer");
  assertStringIncludes(email.text, "Antlerless deer, rifle.");
});
