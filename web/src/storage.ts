import { env } from "./env";

// Public file addresses, built as the Supabase client builds them but without loading it, so the
// reader pages can show photos and logos without the client's download.
const PUBLIC = `${env.supabaseUrl}/storage/v1/object/public`;

function publicUrl(bucket: string, path: string): string {
  return encodeURI(`${PUBLIC}/${bucket}/${path.replace(/^\/+/, "")}`);
}

// Storage layout (written by the submit-entry function): entry-photos/<photo_id>/{full,thumb}.jpg
export function photoUrl(photoId: string, size: "full" | "thumb"): string {
  return publicUrl("entry-photos", `${photoId}/${size}.jpg`);
}

export function shareCardUrl(name: string): string {
  return publicUrl("share-cards", name);
}

export function logoUrl(path: string): string {
  return publicUrl("sponsor-logos", path);
}
