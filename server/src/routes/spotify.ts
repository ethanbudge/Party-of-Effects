import { Hono } from 'hono';
import { SPOTIFY_SCOPES, type Env } from '../env.js';
import { requireAuth } from '../auth.js';
import { decryptSecret, encryptSecret, signState, verifyState } from '../crypto.js';
import { getCredentials, upsertCredentials } from '../db.js';

export const spotifyRoutes = new Hono<{ Bindings: Env }>();

function basicAuth(env: Env): string {
  return `Basic ${btoa(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`)}`;
}

/**
 * Returns a currently-valid Spotify access token for one user, refreshing it
 * if the cached one is close to expiry.
 *
 * Single source of truth for token freshness — both the browser-facing
 * /token endpoint and the server-side /play helper go through here.
 */
async function getAccessToken(env: Env, userId: string): Promise<string> {
  const row = await getCredentials(env, userId);
  if (!row?.spotify_refresh_ct) throw new Error('NOT_CONNECTED');

  const expiresAt = row.spotify_expires_at ? Date.parse(row.spotify_expires_at) : 0;
  if (row.spotify_access_ct && expiresAt - Date.now() > 120_000) {
    return decryptSecret(row.spotify_access_ct, env.CREDENTIAL_ENC_KEY);
  }

  const refreshToken = await decryptSecret(row.spotify_refresh_ct, env.CREDENTIAL_ENC_KEY);

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: basicAuth(env),
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
  });

  if (!res.ok) throw new Error('REFRESH_FAILED');

  const tok = (await res.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
  };

  const newExpiry = Date.now() + tok.expires_in * 1000;

  // Spotify sometimes rotates the refresh token; persist it when it does.
  await upsertCredentials(env, userId, {
    spotify_access_ct: await encryptSecret(tok.access_token, env.CREDENTIAL_ENC_KEY),
    spotify_expires_at: new Date(newExpiry).toISOString(),
    ...(tok.refresh_token
      ? { spotify_refresh_ct: await encryptSecret(tok.refresh_token, env.CREDENTIAL_ENC_KEY) }
      : {}),
  });

  return tok.access_token;
}

/**
 * Step 1 — hand the browser a consent URL.
 *
 * The `state` is HMAC-signed and carries the user id, because step 2 arrives
 * as a plain browser redirect with no Authorization header. Signing it is what
 * stops someone binding their Spotify account onto another user's row.
 */
spotifyRoutes.get('/authorize', requireAuth, async (c) => {
  const state = await signState(c.get('user').id, c.env.CREDENTIAL_ENC_KEY);

  const url = new URL('https://accounts.spotify.com/authorize');
  url.searchParams.set('client_id', c.env.SPOTIFY_CLIENT_ID);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', c.env.SPOTIFY_REDIRECT_URI);
  url.searchParams.set('scope', SPOTIFY_SCOPES);
  url.searchParams.set('state', state);

  return c.json({ url: url.toString() });
});

/**
 * Step 2 — Spotify bounces the browser here with an authorization code.
 * We exchange it server-side (the client secret never leaves this process),
 * store the refresh token encrypted, and send the user back to the app.
 */
spotifyRoutes.get('/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  const oauthError = c.req.query('error');

  const back = (status: string) =>
    c.redirect(`${c.env.WEB_APP_URL}/?spotify=${encodeURIComponent(status)}`);

  if (oauthError) return back(oauthError);
  if (!code || !state) return back('missing_code');

  const userId = await verifyState(state, c.env.CREDENTIAL_ENC_KEY);
  if (!userId) return back('bad_state');

  const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: basicAuth(c.env),
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: c.env.SPOTIFY_REDIRECT_URI,
    }),
  });

  if (!tokenRes.ok) return back('exchange_failed');

  const tok = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
  };

  if (!tok.refresh_token) return back('no_refresh_token');

  await upsertCredentials(c.env, userId, {
    spotify_refresh_ct: await encryptSecret(tok.refresh_token, c.env.CREDENTIAL_ENC_KEY),
    spotify_access_ct: await encryptSecret(tok.access_token, c.env.CREDENTIAL_ENC_KEY),
    spotify_expires_at: new Date(Date.now() + tok.expires_in * 1000).toISOString(),
    spotify_scope: tok.scope,
  });

  return back('connected');
});

/**
 * Step 3 — mint a short-lived access token for this browser.
 *
 * The Web Playback SDK is a client-side library; it genuinely needs an access
 * token in the page. What it does NOT get is the refresh token — that stays
 * encrypted server-side. So the worst case for a compromised tab is a token
 * that dies within the hour, for that one user's own account.
 */
spotifyRoutes.get('/token', requireAuth, async (c) => {
  try {
    const accessToken = await getAccessToken(c.env, c.get('user').id);
    return c.json({ accessToken });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === 'NOT_CONNECTED') return c.json({ error: 'Spotify not connected.' }, 409);
    return c.json({ error: 'Spotify refused to refresh. Reconnect Spotify.' }, 502);
  }
});

/**
 * Start playback on this user's own account.
 * Targeting a device plus a context URI in one call is fiddly enough that it
 * is worth having exactly one implementation of it.
 */
spotifyRoutes.put('/play', requireAuth, async (c) => {
  const { contextUri, deviceId, positionMs } = await c.req.json<{
    contextUri?: string;
    deviceId?: string;
    positionMs?: number;
  }>();

  let accessToken: string;
  try {
    accessToken = await getAccessToken(c.env, c.get('user').id);
  } catch {
    return c.json({ error: 'Spotify not connected.' }, 409);
  }

  const url = new URL('https://api.spotify.com/v1/me/player/play');
  if (deviceId) url.searchParams.set('device_id', deviceId);

  const res = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...(contextUri ? { context_uri: contextUri } : {}),
      ...(typeof positionMs === 'number' ? { position_ms: positionMs } : {}),
    }),
  });

  if (res.status === 404) {
    return c.json({ error: 'No active Spotify device found in this tab yet.' }, 409);
  }
  if (res.status === 403) {
    return c.json({ error: 'Spotify Premium is required for playback control.' }, 403);
  }
  if (!res.ok && res.status !== 204) {
    return c.json({ error: `Spotify returned ${res.status}` }, 502);
  }

  return c.json({ ok: true });
});

spotifyRoutes.put('/pause', requireAuth, async (c) => {
  let accessToken: string;
  try {
    accessToken = await getAccessToken(c.env, c.get('user').id);
  } catch {
    return c.json({ error: 'Spotify not connected.' }, 409);
  }

  const res = await fetch('https://api.spotify.com/v1/me/player/pause', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  // 403 here usually just means "already paused" — not worth surfacing.
  if (!res.ok && res.status !== 204 && res.status !== 403) {
    return c.json({ error: `Spotify returned ${res.status}` }, 502);
  }

  return c.json({ ok: true });
});
