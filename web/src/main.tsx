import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { initAnalytics } from "./analytics";
import { App } from "./App";
import { DEMO } from "./sales";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element.");

// Sales previews would count placeholder slots as real traffic.
if (!DEMO) initAnalytics();

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
