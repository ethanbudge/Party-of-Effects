import { Hono } from 'hono';
import type { Env } from '../env.js';
import { requireAuth } from '../auth.js';
import { decryptSecret } from '../crypto.js';
import { getCredentials } from '../db.js';

export const lifxRoutes = new Hono<{ Bindings: Env }>();

lifxRoutes.use('*', requireAuth);

interface StateBody {
  hex?: string;
  brightness?: number;
  /** Transition time in milliseconds. */
  durationMs?: number;
  power?: 'on' | 'off';
  /** LIFX selector; defaults to every light on the account. */
  selector?: string;
  /**
   * LIFX "fast mode": fire-and-forget, skips the round trip that confirms the
   * bulb applied the state. Returns 202 immediately. This is what keeps a
   * multi-frame effect on schedule, so it defaults to true.
   */
  fast?: boolean;
}

/**
 * Proxy a single light state change to LIFX using the caller's own token.
 *
 * This is the hot path — a 7-frame effect hits it 7 times over ~2 seconds —
 * so it does exactly one thing and does not re-read anything it doesn't need.
 */
lifxRoutes.put('/state', async (c) => {
  const body = await c.req.json<StateBody>();
  const row = await getCredentials(c.env, c.get('user').id);

  if (!row?.lifx_token_ct) {
    return c.json({ error: 'No LIFX token on file. Connect LIFX in Settings.' }, 409);
  }

  const token = await decryptSecret(row.lifx_token_ct, c.env.CREDENTIAL_ENC_KEY);
  const selector = body.selector ?? 'all';

  const payload: Record<string, unknown> = { fast: body.fast ?? true };
  if (body.hex) payload.color = body.hex;
  if (typeof body.brightness === 'number') {
    payload.brightness = Math.max(0, Math.min(1, body.brightness));
  }
  if (typeof body.durationMs === 'number') payload.duration = body.durationMs / 1000;
  if (body.power) payload.power = body.power;

  const started = Date.now();
  const res = await fetch(
    `https://api.lifx.com/v1/lights/${encodeURIComponent(selector)}/state`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
  );
  const elapsed = Date.now() - started;

  if (res.status === 429) {
    return c.json({ error: 'LIFX rate limit hit — slow down.', elapsed }, 429);
  }
  if (!res.ok && res.status !== 202) {
    return c.json({ error: `LIFX returned ${res.status}`, elapsed }, 502);
  }

  // `elapsed` feeds the client's latency compensation (see web/src/lib/sequencer.ts).
  return c.json({ ok: true, elapsed });
});

/** List the caller's lights, for the settings screen. */
lifxRoutes.get('/lights', async (c) => {
  const row = await getCredentials(c.env, c.get('user').id);
  if (!row?.lifx_token_ct) return c.json({ lights: [] });

  const token = await decryptSecret(row.lifx_token_ct, c.env.CREDENTIAL_ENC_KEY);
  const res = await fetch('https://api.lifx.com/v1/lights/all', {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) return c.json({ lights: [], error: `LIFX returned ${res.status}` }, 502);

  const lights = (await res.json()) as Array<{
    id: string;
    label: string;
    connected: boolean;
    power: string;
  }>;

  return c.json({
    lights: lights.map((l) => ({
      id: l.id,
      label: l.label,
      connected: l.connected,
      power: l.power,
    })),
  });
});

/**
 * Latency probe. The client calls this a few times at startup to learn how
 * long a round trip to LIFX actually takes from this browser, then fires each
 * light frame that many milliseconds early so the flash lands on the beat.
 */
lifxRoutes.get('/ping', (c) => c.json({ t: Date.now() }));
