// An unsold sponsor slot, shown while there's still a season to sell into.
import { useState } from "react";
import { SALES_EMAIL, salesMailto } from "../sales";

export function UpsellCard({ pitch, action, subject }: { pitch: string; action: string; subject: string }) {
  const [copied, setCopied] = useState(false);
  // A desktop with no mail app does nothing on a mailto: click, so the address is copied too.
  // Inside WordPress the iframe needs allow="clipboard-write" (see README); without it this quietly does nothing.
  const copy = () => {
    navigator.clipboard?.writeText(SALES_EMAIL).then(
      () => setCopied(true),
      () => undefined,
    );
  };

  return (
    <div className="upsell">
      <p className="upsell-eyebrow">Sponsorship available</p>
      <p className="upsell-pitch">{pitch}</p>
      <a className="button button-ink" href={salesMailto(subject)} onClick={copy}>
        {action} →
      </a>
      <p className="upsell-email" aria-live="polite">
        {copied && "✓ Address copied: "}
        {SALES_EMAIL}
      </p>
    </div>
  );
}
