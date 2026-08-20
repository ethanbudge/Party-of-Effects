/**
 * Local development entry point.
 *
 * Reads config from process.env / .env and serves the same Hono app that
 * worker.ts serves on Cloudflare. Nothing in the route code knows which of
 * these two files started it.
 */
import 'dotenv/config';
import { serve } from '@hono/node-server';
import { createApp } from './index.js';
import type { Env } from './env.js';

const REQUIRED: (keyof Env)[] = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'CREDENTIAL_ENC_KEY',
  'SPOTIFY_CLIENT_ID',
  'SPOTIFY_CLIENT_SECRET',
  'SPOTIFY_REDIRECT_URI',
  'WEB_APP_URL',
];

const missing = REQUIRED.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(
    `\n  Missing required environment variables:\n` +
      missing.map((m) => `    - ${m}`).join('\n') +
      `\n\n  Copy server/.env.example to server/.env and fill it in.\n`,
  );
  process.exit(1);
}

const env = Object.fromEntries(
  Object.entries(process.env).filter(([, v]) => v !== undefined),
) as unknown as Env;

const app = createApp();
const port = Number(process.env.PORT ?? 8787);

serve({ fetch: (req) => app.fetch(req, env), port }, (info) => {
  console.log(`  Party of Effects API listening on http://localhost:${info.port}`);
  console.log(`  Allowing app origin: ${env.WEB_APP_URL}`);
});
