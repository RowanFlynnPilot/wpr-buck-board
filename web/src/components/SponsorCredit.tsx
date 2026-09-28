import { logoUrl } from "../supabase";
import type { Sponsor } from "../types";

export function SponsorCredit({ sponsor, lead = "Presented by" }: { sponsor: Sponsor; lead?: string }) {
  const logo = <img src={logoUrl(sponsor.logo_path)} alt={sponsor.name} className="sponsor-logo" />;
  return (
    <p className="sponsor-credit">
      <span>{lead}</span>
      {sponsor.website_url ? (
        <a href={sponsor.website_url} target="_blank" rel="noreferrer">
          {logo}
        </a>
      ) : (
        logo
      )}
    </p>
  );
}
