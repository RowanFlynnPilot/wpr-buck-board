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

// Storage layout (written by the submit-entry function): entry-photos/<photo_id>/{full,thumb}.jpg
export function photoUrl(photoId: string, size: "full" | "thumb"): string {
  return supabase.storage.from("entry-photos").getPublicUrl(`${photoId}/${size}.jpg`).data.publicUrl;
}

export function shareCardUrl(name: string): string {
  return supabase.storage.from("share-cards").getPublicUrl(name).data.publicUrl;
}

export function logoUrl(path: string): string {
  return supabase.storage.from("sponsor-logos").getPublicUrl(path).data.publicUrl;
}
