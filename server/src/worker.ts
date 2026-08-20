/**
 * Cloudflare Workers entry point.
 *
 * Workers passes config in as the `env` argument rather than process.env,
 * which is the only difference from node.ts. Deploy with:
 *
 *   cd server && npx wrangler deploy
 */
import { createApp } from './index.js';
import type { Env } from './env.js';

const app = createApp();

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Response | Promise<Response> {
    return app.fetch(request, env, ctx);
  },
};
