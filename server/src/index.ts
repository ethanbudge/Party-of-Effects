import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './env.js';
import { credentialRoutes } from './routes/credentials.js';
import { lifxRoutes } from './routes/lifx.js';
import { spotifyRoutes } from './routes/spotify.js';

/**
 * The API.
 *
 * Deliberately stateless: no sessions, no in-memory room state, no WebSocket
 * server. Auth is a JWT on each request and the live "everyone do this now"
 * channel is Supabase Realtime, which the browsers connect to directly.
 * That is what makes this deployable to Cloudflare Workers unchanged.
 */
export function createApp() {
  const app = new Hono<{ Bindings: Env }>();

  app.use(
    '/api/*',
    cors({
      origin: (origin, c) => {
        const allowed = c.env.WEB_APP_URL;
        // Allow the configured app origin; also allow same-origin/no-origin
        // requests (the Spotify callback redirect has no Origin header).
        return !origin || origin === allowed ? origin || allowed : allowed;
      },
      allowHeaders: ['Authorization', 'Content-Type'],
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      maxAge: 86400,
    }),
  );

  app.get('/api/health', (c) => c.json({ ok: true, ts: Date.now() }));

  app.route('/api/credentials', credentialRoutes);
  app.route('/api/lifx', lifxRoutes);
  app.route('/api/spotify', spotifyRoutes);

  app.onError((err, c) => {
    console.error('[api error]', err);
    return c.json({ error: 'Internal error' }, 500);
  });

  app.notFound((c) => c.json({ error: 'Not found' }, 404));

  return app;
}

export default createApp();
