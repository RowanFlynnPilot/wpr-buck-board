import { track } from "../analytics";
import { env } from "../env";
import { salesMailto } from "../sales";

const SUPPORT_URL =
  "https://wausaupilotandreview.com/support-our-publication/?utm_source=brag-board&utm_medium=widget&utm_campaign=footer";

// Links open in a new tab so a half-filled entry form is never lost.
export function Footer() {
  return (
    <footer className="wpr-footer">
      <div className="wpr-footer-inner">
        <img src={`${import.meta.env.BASE_URL}wpr-typewriter-badge.png`} alt="" width="44" height="44" loading="lazy" />
        <div className="wpr-footer-text">
          <p>
            Photos are sent in by readers and reviewed by a Wausau Pilot &amp; Review editor before they appear. Location
            data is stripped from every photo before it's stored.
          </p>
          <p>Wausau Pilot &amp; Review · 715-301-5539 · a nonprofit newsroom serving Marathon County.</p>
          <p className="wpr-footer-links">
            <a href={env.rulesUrl} target="_blank" rel="noopener">
              Contest rules
            </a>
            <a
              href={salesMailto("Hunting Brag Board sponsorship")}
              onClick={() => track("Sponsor Inquiry", { slot: "footer" })}
            >
              Advertise on the Brag Board
            </a>
            <a
              href={SUPPORT_URL}
              target="_blank"
              rel="noopener"
              onClick={() => track("Donate Click", { from: "footer" })}
            >
              Support local news (tax-deductible)
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
