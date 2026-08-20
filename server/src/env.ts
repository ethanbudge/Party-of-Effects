/**
 * Environment contract.
 *
 * On Node these come from `process.env` (see node.ts).
 * On Cloudflare Workers they arrive as the `env` binding (see worker.ts).
 * Writing the app against this one interface is what lets the exact same
 * route code run in both places.
 */
export interface Env {
  /** https://xxxxxxxx.supabase.co */
  SUPABASE_URL: string;
  /** service_role key — server only, NEVER shipped to the browser */
  SUPABASE_SERVICE_ROLE_KEY: string;
  /**
   * Legacy HS256 JWT secret (Supabase → Settings → API → JWT Secret).
   * Optional: if absent we verify against the project's JWKS endpoint instead.
   */
  SUPABASE_JWT_SECRET?: string;

  /** 32 random bytes, base64. Encrypts every stored LIFX/Spotify secret. */
  CREDENTIAL_ENC_KEY: string;

  SPOTIFY_CLIENT_ID: string;
  SPOTIFY_CLIENT_SECRET: string;
  /** Must match a Redirect URI registered in the Spotify dashboard exactly. */
  SPOTIFY_REDIRECT_URI: string;

  /** Where to bounce the browser back to after Spotify OAuth completes. */
  WEB_APP_URL: string;
}

export const SPOTIFY_SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
].join(' ');
