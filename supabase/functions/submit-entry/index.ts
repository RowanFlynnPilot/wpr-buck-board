// POST multipart/form-data from the entry form. The browser has already resized the photo,
// baked in its orientation, and made a thumbnail. This function checks the Turnstile token
// before touching the photos, strips location metadata
// from both, stores them under a random photo id, then records the entry through
// submit_entry(), which owns every business rule (season phase, harvest window, youth consent).
//
// Storage layout: entry-photos/<photo_id>/full.jpg and entry-photos/<photo_id>/thumb.jpg.

import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { requireEnv, requireNamedKey } from "../_shared/env.ts";
import { BadRequest } from "../_shared/errors.ts";
import { corsHeaders, json } from "../_shared/http.ts";
import { stripLocationMetadata } from "../_shared/jpeg.ts";
import { verifyTurnstile } from "../_shared/turnstile.ts";

const BUCKET = "entry-photos";
const MAX_BYTES = { full: 3 * 1024 * 1024, thumb: 512 * 1024 };
// Photo ids are never reused, so browsers and the CDN can keep them for a year.
const CACHE_SECONDS = "31536000";

const TURNSTILE_SECRET = requireEnv("TURNSTILE_SECRET_KEY");

const supabase = createClient(requireEnv("SUPABASE_URL"), requireNamedKey("SUPABASE_SECRET_KEYS", "default"), {
  auth: { persistSession: false },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const form = await req.formData();
    const fields = readFields(form);
    await verifyTurnstile(TURNSTILE_SECRET, text(form, "turnstile_token"));
    const photos = {
      full: await readPhoto(form, "photo", MAX_BYTES.full),
      thumb: await readPhoto(form, "thumb", MAX_BYTES.thumb),
    };
    const photoId = crypto.randomUUID();
    const paths = [`${photoId}/full.jpg`, `${photoId}/thumb.jpg`];

    try {
      // One at a time: if the first fails, nothing is still in flight when we clean up.
      await store(paths[0], photos.full);
      await store(paths[1], photos.thumb);
      const { data: entryId, error } = await supabase.rpc("submit_entry", { ...fields, p_photo_id: photoId });
      if (error) throw error.code === "P0001" ? new BadRequest(error.message) : error;
      return json({ id: entryId }, 201);
    } catch (err) {
      const removal = await supabase.storage.from(BUCKET).remove(paths);
      if (removal.error) console.error("Could not remove orphaned photos", paths, removal.error);
      throw err;
    }
  } catch (err) {
    if (err instanceof BadRequest) return json({ error: err.message }, 400);
    console.error(err);
    return json({ error: "Your entry couldn't be saved. Check it and try again in a few minutes." }, 500);
  }
});

async function store(path: string, bytes: Uint8Array): Promise<void> {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: "image/jpeg", cacheControl: CACHE_SECONDS });
  if (error) throw error;
}

function readFields(form: FormData) {
  return {
    p_hunter_name: text(form, "hunter_name"),
    p_hometown: text(form, "hometown"),
    p_county: text(form, "county"),
    p_harvest_date: text(form, "harvest_date"),
    p_weapon: text(form, "weapon"),
    p_deer_type: text(form, "deer_type"),
    p_points: points(form),
    p_first_deer: flag(form, "first_deer"),
    p_age_group: text(form, "age_group"),
    p_guardian_consent: flag(form, "guardian_consent"),
    p_story: text(form, "story"),
    p_submitter_name: text(form, "submitter_name"),
    p_email: text(form, "email"),
    p_newsletter_opt_in: flag(form, "newsletter_opt_in"),
    // Added with the 2026 form plan (migration 0009). Optional here so an older form still
    // works; submit_entry() requires the youth ones for a youth entry.
    p_phone: optionalText(form, "phone"),
    p_guardian_relationship: optionalText(form, "guardian_relationship"),
    p_first_name_only: optionalText(form, "first_name_only") === "true",
    p_photo_credit: optionalText(form, "photo_credit"),
  };
}

async function readPhoto(form: FormData, name: string, maxBytes: number): Promise<Uint8Array> {
  const photo = form.get(name);
  if (!(photo instanceof File)) throw new BadRequest("A photo is required.");
  if (photo.size > maxBytes) throw new BadRequest(`Photo is larger than ${Math.round(maxBytes / 1024)} KB.`);
  return stripLocationMetadata(new Uint8Array(await photo.arrayBuffer()));
}

function text(form: FormData, name: string): string {
  const value = form.get(name);
  if (typeof value !== "string") throw new BadRequest(`Missing field: ${name}.`);
  return value;
}

function optionalText(form: FormData, name: string): string | null {
  const value = form.get(name);
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function flag(form: FormData, name: string): boolean {
  const value = text(form, name);
  if (value !== "true" && value !== "false") throw new BadRequest(`${name} must be true or false.`);
  return value === "true";
}

// Empty means "not a buck" or "didn't count"; anything else must be a whole number.
function points(form: FormData): number | null {
  const value = text(form, "points");
  if (value === "") return null;
  if (!/^\d{1,2}$/.test(value)) throw new BadRequest("Points must be a whole number.");
  return Number(value);
}
