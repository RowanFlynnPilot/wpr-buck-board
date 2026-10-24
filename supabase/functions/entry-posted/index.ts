// POST { entry_id } from a staff browser right after a deer is posted (#/admin): emails the
// entrant, once, that the deer is on the board, with its link, its share image and a Facebook
// share link. Every entrant who shares it brings the board new readers.
//
// Only staff may call it. It checks the caller's sign-in itself (verify_jwt is off in
// config.toml, since the project's new API keys aren't the legacy JWT secret the gateway checks).
// posted_notice() answers only for a posted deer whose entrant hasn't been told; the send is
// recorded after Resend accepts it, and Resend drops a repeat of the same key within a day, so a
// double click can't send twice. Without RESEND_API_KEY it does nothing, and nothing is recorded,
// so no one is marked as told.

import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { createMailer } from "../_shared/email.ts";
import { type PostedNotice, postedEmail } from "../_shared/entry_emails.ts";
import { optionalEnv, requireEnv, requireNamedKey } from "../_shared/env.ts";
import { corsHeaders, json } from "../_shared/http.ts";

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const supabase = createClient(SUPABASE_URL, requireNamedKey("SUPABASE_SECRET_KEYS", "default"), {
  auth: { persistSession: false },
});
const mailer = createMailer({
  key: optionalEnv("RESEND_API_KEY"),
  from: optionalEnv("EMAIL_FROM") ?? "Wausau Pilot & Review <bragboard@wausaupilotandreview.com>",
  replyTo: optionalEnv("EMAIL_REPLY_TO") ?? "editor@wausaupilotandreview.com",
  url: optionalEnv("RESEND_API_URL") ?? undefined,
});
// The WordPress Brag Board page; share pages live at /brag/ on the same host (share/wrangler.toml).
const BOARD = optionalEnv("GALLERY_PAGE_URL") ?? "https://wausaupilotandreview.com/wausau-pilot-hunting-brag-board/";
const SHARE_BASE = new URL("/brag/", BOARD).href;
const ENTRY_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (!mailer) console.warn("Email is off: set RESEND_API_KEY to tell entrants when their deer is posted.");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    const { data: auth } = token ? await supabase.auth.getUser(token) : { data: { user: null } };
    if (!auth.user) return json({ error: "Sign in again." }, 401);
    const { data: staff, error: staffError } = await supabase
      .from("staff")
      .select("user_id")
      .eq("user_id", auth.user.id)
      .maybeSingle();
    if (staffError) throw staffError;
    if (!staff) return json({ error: "Staff only." }, 403);

    const body = await req.json().catch(() => ({}));
    const entryId = typeof body.entry_id === "string" ? body.entry_id.toLowerCase() : "";
    if (!ENTRY_ID.test(entryId)) return json({ error: "entry_id must be an entry's id." }, 400);
    if (!mailer) return json({ sent: false, reason: "Email is off." }, 200);

    const { data: notice, error } = await supabase.rpc("posted_notice", { p_entry_id: entryId });
    if (error) throw error;
    if (!notice) return json({ sent: false, reason: "Not posted, or the entrant was already told." }, 200);
    const posted = notice as PostedNotice;

    const card = posted.share_card;
    const email = postedEmail(posted, entryId, {
      board: BOARD,
      share: SHARE_BASE + entryId,
      image: card
        ? `${SUPABASE_URL}/storage/v1/object/public/share-cards/${card}`
        : `${SUPABASE_URL}/storage/v1/object/public/entry-photos/${posted.photo_id}/thumb.jpg`,
      imageIsCard: Boolean(card),
    });
    const result = await mailer(email);
    if (!result.ok) {
      console.error(`Posted email for entry ${entryId} didn't send:`, result.error);
      return json({ sent: false, reason: "The email didn't send." }, 502);
    }
    const { error: markError } = await supabase.rpc("mark_posted_notice", { p_entry_id: entryId });
    if (markError) console.error(`Posted email for entry ${entryId} sent but not recorded:`, markError);
    return json({ sent: true }, 200);
  } catch (err) {
    console.error(err);
    return json({ error: "The posted email couldn't be sent." }, 500);
  }
});
