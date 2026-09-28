import { useEffect, useState, type ComponentType } from "react";
import { useAutoHeight } from "./host";
import { Admin } from "./views/Admin";
import { Embed } from "./views/Embed";
import { Enter } from "./views/Enter";
import { Gallery } from "./views/Gallery";

// Hash routes, so GitHub Pages needs no rewrites. WordPress embeds each view by URL.
const ROUTES: Record<string, ComponentType> = {
  "#/embed": Embed,
  "#/gallery": Gallery,
  "#/enter": Enter,
  "#/admin": Admin,
};

export function App() {
  const [hash, setHash] = useState(window.location.hash);
  useAutoHeight();

  useEffect(() => {
    const update = () => setHash(window.location.hash);
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);

  const View = ROUTES[hash];
  if (!View) {
    return <p className="status">Unknown page "{hash || "/"}". Views: {Object.keys(ROUTES).join(", ")}.</p>;
  }
  return (
    <>
      <div className="blaze-band" aria-hidden="true" />
      <View />
    </>
  );
}
