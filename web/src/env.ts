// Every value is required; vite.config.ts refuses to build or serve without them.
export const env = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  supabasePublishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  galleryPageUrl: import.meta.env.VITE_GALLERY_PAGE_URL,
  enterPageUrl: import.meta.env.VITE_ENTER_PAGE_URL,
  rulesUrl: import.meta.env.VITE_RULES_URL,
  turnstileSiteKey: import.meta.env.VITE_TURNSTILE_SITE_KEY,
};
