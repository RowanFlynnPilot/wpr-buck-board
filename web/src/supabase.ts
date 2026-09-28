import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

export const supabase = createClient(env.supabaseUrl, env.supabasePublishableKey);

// Storage layout (written by the submit-entry function): entry-photos/<photo_id>/{full,thumb}.jpg
export function photoUrl(photoId: string, size: "full" | "thumb"): string {
  return supabase.storage.from("entry-photos").getPublicUrl(`${photoId}/${size}.jpg`).data.publicUrl;
}

export function logoUrl(path: string): string {
  return supabase.storage.from("sponsor-logos").getPublicUrl(path).data.publicUrl;
}
