import { BadRequest } from "./errors.ts";

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

// Confirms the entry form's Turnstile token with Cloudflare. Tokens are single-use and
// expire after five minutes; the form fetches a fresh one after any failed attempt.
export async function verifyTurnstile(secret: string, token: string): Promise<void> {
  const response = await fetch(SITEVERIFY, { method: "POST", body: new URLSearchParams({ secret, response: token }) });
  if (!response.ok) throw new Error(`Turnstile siteverify returned HTTP ${response.status}`);

  const result = (await response.json()) as { success: boolean; "error-codes": string[] };
  if (!result.success) {
    console.warn("Turnstile rejected a submission", result["error-codes"]);
    throw new BadRequest(
      "We couldn't confirm you're a person. Wait for the check above the button to finish, then try again.",
    );
  }
}
