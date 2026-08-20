import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { MiddlewareHandler } from 'hono';
import type { Env } from './env.js';

/**
 * Verifies the Supabase access token on every request.
 *
 * Verification happens locally (no network round-trip to Supabase per call),
 * which matters here: light frames fire on a sub-second timeline and we can't
 * afford an extra hop in front of each one.
 *
 * Supabase projects sign JWTs one of two ways depending on age:
 *   - legacy: HS256 with a shared secret  -> set SUPABASE_JWT_SECRET
 *   - modern: asymmetric keys via JWKS    -> leave SUPABASE_JWT_SECRET unset
 * Both are handled below.
 */

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks(supabaseUrl: string) {
  let jwks = jwksCache.get(supabaseUrl);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`));
    jwksCache.set(supabaseUrl, jwks);
  }
  return jwks;
}

export interface AuthedUser {
  id: string;
  email?: string;
}

export async function verifyAccessToken(token: string, env: Env): Promise<AuthedUser | null> {
  try {
    let payload: Record<string, unknown>;

    if (env.SUPABASE_JWT_SECRET) {
      const secret = new TextEncoder().encode(env.SUPABASE_JWT_SECRET);
      ({ payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] }));
    } else {
      ({ payload } = await jwtVerify(token, getJwks(env.SUPABASE_URL)));
    }

    const sub = payload.sub;
    if (typeof sub !== 'string' || !sub) return null;

    return { id: sub, email: typeof payload.email === 'string' ? payload.email : undefined };
  } catch {
    return null;
  }
}

declare module 'hono' {
  interface ContextVariableMap {
    user: AuthedUser;
  }
}

/**
 * Gate for every route that touches somebody's secrets.
 *
 * This middleware is the whole reason "friends can't touch your lights while
 * you're logged out" holds: a LIFX call is only ever made for the user whose
 * own JWT arrived on the request. There is no code path where one user's
 * action decrypts another user's token.
 */
export const requireAuth: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  const header = c.req.header('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';

  if (!token) return c.json({ error: 'Missing bearer token' }, 401);

  const user = await verifyAccessToken(token, c.env);
  if (!user) return c.json({ error: 'Invalid or expired session' }, 401);

  c.set('user', user);
  await next();
};
