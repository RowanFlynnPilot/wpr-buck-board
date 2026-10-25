import { lazy, Suspense, useEffect, useState, type ComponentType, type LazyExoticComponent } from "react";
import { DemoRibbon } from "./components/DemoRibbon";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Footer } from "./components/Footer";
import { Masthead } from "./components/Masthead";
import { embedded, useAutoHeight } from "./host";
import { DEMO } from "./sales";

// Each view is its own download, fetched when its route opens: a reader who only sees the
// front-page strip never loads the staff page, the entry form's photo encoder or the board's map.
const Embed = lazy(() => import("./views/Embed").then((m) => ({ default: m.Embed })));
const Gallery = lazy(() => import("./views/Gallery").then((m) => ({ default: m.Gallery })));
const Enter = lazy(() => import("./views/Enter").then((m) => ({ default: m.Enter })));
const Admin = lazy(() => import("./views/Admin").then((m) => ({ default: m.Admin })));

// Hash routes, so GitHub Pages needs no rewrites. WordPress embeds each view by URL.
// The reader pages carry WPR's flag and footer like the rest of the contest series when
// opened on their own (a shared link, a `?demo` preview). Inside a WordPress page, which has
// WPR's own header and footer, the flag is left out and the footer keeps only what's the
// contest's own. The front-page strip already sits inside WPR's front page, and #/admin is
// staff-only.
const ROUTES: Record<string, { View: LazyExoticComponent<ComponentType>; flag: boolean; loading: string }> = {
  "#/embed": { View: Embed, flag: false, loading: "Loading the Brag Board…" },
  "#/gallery": { View: Gallery, flag: true, loading: "Loading the Brag Board…" },
  "#/enter": { View: Enter, flag: true, loading: "Loading the entry form…" },
  "#/admin": { View: Admin, flag: false, loading: "Loading…" },
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
  const { View, flag, loading } = route;
  const inWordPress = embedded && !DEMO;
  return (
    <>
      {DEMO && <DemoRibbon />}
      {flag && !inWordPress && <Masthead />}
      <div className="blaze-band" aria-hidden="true" />
      <ErrorBoundary key={path}>
        <Suspense fallback={<p className="status">{loading}</p>}>
          <View />
        </Suspense>
      </ErrorBoundary>
      {flag && <Footer compact={inWordPress} />}
    </>
  );
}
