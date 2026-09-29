import { useEffect, useState, type ComponentType } from "react";
import { DemoRibbon } from "./components/DemoRibbon";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Footer } from "./components/Footer";
import { Masthead } from "./components/Masthead";
import { useAutoHeight } from "./host";
import { DEMO } from "./sales";
import { Admin } from "./views/Admin";
import { Embed } from "./views/Embed";
import { Enter } from "./views/Enter";
import { Gallery } from "./views/Gallery";

// Hash routes, so GitHub Pages needs no rewrites. WordPress embeds each view by URL.
// The reader pages carry WPR's flag and footer like the rest of the contest series; the
// front-page strip already sits inside WPR's front page, and #/admin is staff-only.
const ROUTES: Record<string, { View: ComponentType; flag: boolean }> = {
  "#/embed": { View: Embed, flag: false },
  "#/gallery": { View: Gallery, flag: true },
  "#/enter": { View: Enter, flag: true },
  "#/admin": { View: Admin, flag: false },
};

export function App() {
  const [hash, setHash] = useState(window.location.hash);
  useAutoHeight();

  useEffect(() => {
    const update = () => setHash(window.location.hash);
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);

  // Tolerate `#/gallery?demo` as well as `?demo#/gallery`.
  const path = hash.split("?")[0];
  const route = ROUTES[path];
  if (!route) {
    return <p className="status">Unknown page "{path || "/"}". Views: {Object.keys(ROUTES).join(", ")}.</p>;
  }
  const { View, flag } = route;
  return (
    <>
      {DEMO && <DemoRibbon />}
      {flag && <Masthead />}
      <div className="blaze-band" aria-hidden="true" />
      <ErrorBoundary key={path}>
        <View />
      </ErrorBoundary>
      {flag && <Footer />}
    </>
  );
}
