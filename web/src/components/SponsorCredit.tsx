import { sponsorHref, type Placement } from "../sales";
import { logoUrl } from "../supabase";
import type { Sponsor } from "../types";

// `lead` is null where the heading beside it already names the sponsor.
export function SponsorCredit({
  sponsor,
  placement,
  lead = "Presented by",
}: {
  sponsor: Sponsor;
  placement: Placement;
  lead?: string | null;
}) {
  const logo = sponsor.demo ? (
    <span className="sponsor-logo-demo">{sponsor.name}</span>
  ) : (
    <img src={logoUrl(sponsor.logo_path)} alt={sponsor.name} className="sponsor-logo" />
  );
  const href = sponsorHref(sponsor, placement);
  return (
    <p className="sponsor-credit">
      {lead && <span>{lead}</span>}
      {href ? (
        // Paid links are marked `sponsored` for search engines.
        <a href={href} target="_blank" rel="noopener noreferrer sponsored">
          {logo}
        </a>
      ) : (
        logo
      )}
    </p>
  );
}
