// Everything the page does for selling and reporting sponsorships.
import type { Board, Sponsor, SponsorTier } from "./types";

export const SALES_EMAIL = "weber.chris@wausaupilotandreview.com";

export function salesMailto(subject: string): string {
  return `mailto:${SALES_EMAIL}?subject=${encodeURIComponent(subject)}`;
}

// Where a sponsor's logo sits; it rides along as utm_content so each placement is reportable.
export type Placement =
  | "front-page"
  | "board-title"
  | "entry-form"
  | "award-filter"
  | "awards-list"
  | "prize-drawing"
  | "winner-card"
  | "newsletter";

// Tagged so the visit shows up in the sponsor's own analytics as coming from us.
export function sponsorHref(sponsor: Sponsor, placement: Placement): string | null {
  if (!sponsor.website_url) return null;
  let url: URL;
  try {
    url = new URL(sponsor.website_url);
  } catch {
    // A typo in one sponsor row must not take the front page down with it: show the logo unlinked.
    console.warn(`Sponsor ${sponsor.qr_slug} has an unusable website_url`, sponsor.website_url);
    return null;
  }
  url.searchParams.set("utm_source", "wausaupilotandreview");
  url.searchParams.set("utm_medium", "widget");
  url.searchParams.set("utm_campaign", "brag-board");
  url.searchParams.set("utm_content", placement);
  return url.toString();
}

// Sales previews: `?demo` on the page's URL (before the #) fills every unsold slot with a
// "Your business here" placeholder so a prospect sees their spot on the real page.
// Readers never see it; sold slots are never overridden.
export const DEMO = /[?&]demo(?:[=&#]|$)/.test(window.location.search + window.location.hash);

export function withDemoSponsors(catalog: Pick<Board, "awards" | "sponsors">): Pick<Board, "awards" | "sponsors"> {
  if (!DEMO) return catalog;
  const sponsors = [...catalog.sponsors];
  const add = (id: string, tier: SponsorTier): Sponsor => {
    const placeholder: Sponsor = {
      id,
      name: "Your business here",
      tier,
      logo_path: "",
      website_url: null,
      prize: "[Your prize here]",
      qr_slug: id,
      demo: true,
    };
    sponsors.push(placeholder);
    return placeholder;
  };

  const presenting = sponsors.find((s) => s.tier === "presenting") ?? add("demo-presenting", "presenting");
  const awards = catalog.awards.map((award) => {
    if (award.sponsor_id) return award;
    const sponsor = award.kind === "readers_choice" ? presenting : add(`demo-${award.kind}`, "award");
    return { ...award, sponsor_id: sponsor.id };
  });
  add("demo-prize-partner", "prize_partner");
  return { awards, sponsors };
}
