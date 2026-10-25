import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { initAnalytics } from "./analytics";
import { App } from "./App";
import { DEMO } from "./sales";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element.");

// After a deploy, a page left open asks for the old build's view files, which are gone. Reload
// once for the new build instead of failing; the stamp stops a loop if a file is truly missing,
// and without storage there's no reload at all (the error boundary offers one instead).
const RELOADED = "brag-board-reloaded-at";
window.addEventListener("vite:preloadError", (event) => {
  try {
    if (Date.now() - Number(sessionStorage.getItem(RELOADED) ?? 0) < 60_000) return;
    sessionStorage.setItem(RELOADED, String(Date.now()));
  } catch {
    return;
  }
  event.preventDefault();
  window.location.reload();
});

// Sales previews would count placeholder slots as real traffic.
if (!DEMO) initAnalytics();

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
