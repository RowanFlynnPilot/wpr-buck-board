import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

// Staff sign-ins live in sessionStorage, not localStorage: rowanflynnpilot.github.io is one origin
// shared by every WPR tool on GitHub Pages, and a token left in localStorage there would outlive
// the tab where any of them could read it. The token unlocks entrants' emails and phones. (The
// real fix is the board on its own domain.) Signing in again after closing the tab is the cost.
export const supabase = createClient(env.supabaseUrl, env.supabasePublishableKey, {
  auth: { storage: window.sessionStorage },
});

// A sign-in saved before this change is still in localStorage under this project's key.
try {
  window.localStorage.removeItem(`sb-${new URL(env.supabaseUrl).hostname.split(".")[0]}-auth-token`);
} catch {
  // Storage can be blocked; there is then nothing to clear.
}

// Public file addresses (photos, share cards, logos) are in storage.ts, which doesn't need the client.
