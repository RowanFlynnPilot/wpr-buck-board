import { SALES_EMAIL, salesMailto } from "../sales";

// Explains a forwarded `?demo` link on its own.
export function DemoRibbon() {
  return (
    <p className="demo-ribbon">
      Sponsor preview: open spots show “Your business here.” Readers never see this version. To book a spot, email{" "}
      <a href={salesMailto("Hunting Brag Board sponsorship")}>{SALES_EMAIL}</a>.
    </p>
  );
}
