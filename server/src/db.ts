import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Env } from './env.js';

/**
 * Service-role Supabase client.
 *
 * This key bypasses RLS, so it is the *only* thing in the system that can read
 * `user_credentials`. It must never reach the browser — it lives in server env
 * vars (a Cloudflare secret in production) and nothing in web/ imports it.
 */
export function serviceClient(env: Env): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface CredentialRow {
  user_id: string;
  lifx_token_ct: string | null;
  spotify_refresh_ct: string | null;
  spotify_scope: string | null;
  spotify_expires_at: string | null;
  spotify_access_ct: string | null;
}

export async function getCredentials(env: Env, userId: string): Promise<CredentialRow | null> {
  const { data, error } = await serviceClient(env)
    .from('user_credentials')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error(`credential lookup failed: ${error.message}`);
  return (data as CredentialRow) ?? null;
}

export async function upsertCredentials(
  env: Env,
  userId: string,
  patch: Partial<Omit<CredentialRow, 'user_id'>>,
): Promise<void> {
  const { error } = await serviceClient(env)
    .from('user_credentials')
    .upsert(
      { user_id: userId, ...patch, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );

  if (error) throw new Error(`credential write failed: ${error.message}`);
}
