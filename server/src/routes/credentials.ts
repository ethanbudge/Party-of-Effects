import { Hono } from 'hono';
import type { Env } from '../env.js';
import { requireAuth } from '../auth.js';
import { encryptSecret } from '../crypto.js';
import { getCredentials, upsertCredentials } from '../db.js';

export const credentialRoutes = new Hono<{ Bindings: Env }>();

credentialRoutes.use('*', requireAuth);

/**
 * What has this user connected? Deliberately returns booleans only — there is
 * no endpoint anywhere that hands a stored secret back to a browser.
 */
credentialRoutes.get('/status', async (c) => {
  const row = await getCredentials(c.env, c.get('user').id);
  return c.json({
    lifx: Boolean(row?.lifx_token_ct),
    spotify: Boolean(row?.spotify_refresh_ct),
  });
});

/**
 * Store a LIFX personal access token.
 * We validate it against LIFX before saving so nobody discovers a typo
 * mid-session with the lights already dark.
 */
credentialRoutes.post('/lifx', async (c) => {
  const { token } = await c.req.json<{ token?: string }>();

  if (!token || typeof token !== 'string' || token.length < 20) {
    return c.json({ error: 'That does not look like a LIFX personal access token.' }, 400);
  }

  const probe = await fetch('https://api.lifx.com/v1/lights/all', {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (probe.status === 401) {
    return c.json({ error: 'LIFX rejected that token.' }, 400);
  }
  if (!probe.ok) {
    return c.json({ error: `LIFX returned ${probe.status} while validating the token.` }, 502);
  }

  const lights = (await probe.json()) as Array<{ id: string; label: string }>;

  await upsertCredentials(c.env, c.get('user').id, {
    lifx_token_ct: await encryptSecret(token, c.env.CREDENTIAL_ENC_KEY),
  });

  return c.json({
    ok: true,
    lights: lights.map((l) => ({ id: l.id, label: l.label })),
  });
});

credentialRoutes.delete('/lifx', async (c) => {
  await upsertCredentials(c.env, c.get('user').id, { lifx_token_ct: null });
  return c.json({ ok: true });
});

credentialRoutes.delete('/spotify', async (c) => {
  await upsertCredentials(c.env, c.get('user').id, {
    spotify_refresh_ct: null,
    spotify_access_ct: null,
    spotify_expires_at: null,
    spotify_scope: null,
  });
  return c.json({ ok: true });
});
