import { SALES_EMAIL, salesMailto } from "../sales";

// Explains a forwarded `?demo` link on its own.
export function DemoRibbon() {
  return (
    <p className="demo-ribbon">
      Preview: open sponsor spots show “Your business here,” and the entry form doesn’t send anything. Readers
      never see this version. To book a spot, email{" "}
      <a href={salesMailto("Hunting Brag Board sponsorship")}>{SALES_EMAIL}</a>.
    </p>
  );
}
