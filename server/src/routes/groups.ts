import { Hono } from 'hono';
import type { Env } from '../env.js';
import { requireAuth } from '../auth.js';
import { hashGroupPassword, verifyGroupPassword } from '../crypto.js';
import { serviceClient } from '../db.js';

export const groupRoutes = new Hono<{ Bindings: Env }>();

groupRoutes.use('*', requireAuth);

/**
 * Groups: create, join, leave, delete.
 *
 * All of it runs server-side with the service-role key, for one reason: the
 * password. A browser cannot be trusted to check it, and it must never be
 * given the hash to check against — so joining is an API call that takes a
 * name and a password and returns nothing but success or failure.
 *
 * Creation is server-side too, because a group is only coherent if its row,
 * its secret, and its owner membership all appear together. A browser
 * inserting directly could leave a group with no password or no owner.
 */

const nameKey = (name: string) => name.trim().toLowerCase();

/** Enough to be worth typing, short enough for a friend group to agree on. */
const MIN_PASSWORD = 8;

// Brute-force ceiling. Joining needs only a name and a password, and group
// names are guessable, so failures are counted and the door closes for a while.
const MAX_FAILURES = 8;
const WINDOW_MINUTES = 15;

async function recentFailures(env: Env, userId: string): Promise<number> {
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();
  const { count } = await serviceClient(env)
    .from('group_join_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('succeeded', false)
    .gte('attempted_at', since);

  return count ?? 0;
}

async function recordAttempt(
  env: Env,
  userId: string,
  key: string,
  succeeded: boolean,
): Promise<void> {
  await serviceClient(env)
    .from('group_join_attempts')
    .insert({ user_id: userId, name_key: key, succeeded });
}

// ---------------------------------------------------------------------------
// List my groups
// ---------------------------------------------------------------------------

groupRoutes.get('/', async (c) => {
  const userId = c.get('user').id;

  const { data, error } = await serviceClient(c.env)
    .from('group_members')
    .select('role, joined_at, groups(id, name, created_by, created_at)')
    .eq('user_id', userId);

  if (error) return c.json({ error: error.message }, 500);

  const groups = (data ?? [])
    .filter((row) => row.groups)
    .map((row) => {
      const g = row.groups as unknown as {
        id: string;
        name: string;
        created_by: string | null;
        created_at: string;
      };
      return {
        id: g.id,
        name: g.name,
        role: row.role as 'owner' | 'member',
        isOwner: row.role === 'owner',
        created_at: g.created_at,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return c.json({ groups });
});

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

groupRoutes.post('/', async (c) => {
  const userId = c.get('user').id;
  const { name, password } = await c.req.json<{ name?: string; password?: string }>();

  const trimmed = (name ?? '').trim();
  if (trimmed.length < 2 || trimmed.length > 60) {
    return c.json({ error: 'Group name must be between 2 and 60 characters.' }, 400);
  }
  if (!password || password.length < MIN_PASSWORD) {
    return c.json({ error: `Password must be at least ${MIN_PASSWORD} characters.` }, 400);
  }

  const db = serviceClient(c.env);
  const key = nameKey(trimmed);

  const { data: existing } = await db
    .from('groups')
    .select('id')
    .eq('name_key', key)
    .maybeSingle();

  if (existing) {
    return c.json({ error: 'A group with that name already exists. Pick another.' }, 409);
  }

  const { data: group, error: groupErr } = await db
    .from('groups')
    .insert({ name: trimmed, name_key: key, created_by: userId })
    .select('id, name')
    .single();

  if (groupErr || !group) {
    return c.json({ error: groupErr?.message ?? 'Could not create the group.' }, 500);
  }

  // From here on, any failure leaves an unusable group — so undo it rather
  // than leaving a passwordless or ownerless row behind.
  const rollback = async (message: string, status: 500 | 502 = 500) => {
    await db.from('groups').delete().eq('id', group.id);
    return c.json({ error: message }, status);
  };

  const { error: secretErr } = await db
    .from('group_secrets')
    .insert({ group_id: group.id, password_hash: await hashGroupPassword(password) });

  if (secretErr) return rollback('Could not store the group password.');

  const { error: memberErr } = await db
    .from('group_members')
    .insert({ group_id: group.id, user_id: userId, role: 'owner' });

  if (memberErr) return rollback('Could not add you to the group.');

  return c.json({ group: { id: group.id, name: group.name, role: 'owner', isOwner: true } });
});

// ---------------------------------------------------------------------------
// Join
// ---------------------------------------------------------------------------

groupRoutes.post('/join', async (c) => {
  const userId = c.get('user').id;
  const { name, password } = await c.req.json<{ name?: string; password?: string }>();

  if (!name?.trim() || !password) {
    return c.json({ error: 'Both a group name and a password are required.' }, 400);
  }

  if ((await recentFailures(c.env, userId)) >= MAX_FAILURES) {
    return c.json(
      { error: `Too many failed attempts. Wait ${WINDOW_MINUTES} minutes and try again.` },
      429,
    );
  }

  const db = serviceClient(c.env);
  const key = nameKey(name);

  const { data: group } = await db
    .from('groups')
    .select('id, name')
    .eq('name_key', key)
    .maybeSingle();

  // One message for "no such group" and for "wrong password". Distinguishing
  // them would turn this endpoint into a way to discover which group names
  // exist.
  const reject = async () => {
    await recordAttempt(c.env, userId, key, false);
    return c.json({ error: 'That group name and password do not match.' }, 401);
  };

  if (!group) {
    // Still spend the time a real verification would, so a missing group is
    // not detectable by how fast the answer comes back.
    await hashGroupPassword(password);
    return reject();
  }

  const { data: secret } = await db
    .from('group_secrets')
    .select('password_hash')
    .eq('group_id', group.id)
    .maybeSingle();

  if (!secret) return reject();
  if (!(await verifyGroupPassword(password, secret.password_hash))) return reject();

  const { error } = await db
    .from('group_members')
    .upsert({ group_id: group.id, user_id: userId, role: 'member' }, { onConflict: 'group_id,user_id' });

  if (error) return c.json({ error: 'Could not add you to the group.' }, 500);

  await recordAttempt(c.env, userId, key, true);

  const { data: membership } = await db
    .from('group_members')
    .select('role')
    .eq('group_id', group.id)
    .eq('user_id', userId)
    .maybeSingle();

  const role = (membership?.role as 'owner' | 'member') ?? 'member';
  return c.json({ group: { id: group.id, name: group.name, role, isOwner: role === 'owner' } });
});

// ---------------------------------------------------------------------------
// Change the password (owner only)
// ---------------------------------------------------------------------------

groupRoutes.put('/:id/password', async (c) => {
  const userId = c.get('user').id;
  const groupId = c.req.param('id');
  const { password } = await c.req.json<{ password?: string }>();

  if (!password || password.length < MIN_PASSWORD) {
    return c.json({ error: `Password must be at least ${MIN_PASSWORD} characters.` }, 400);
  }

  const db = serviceClient(c.env);
  const { data: membership } = await db
    .from('group_members')
    .select('role')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .maybeSingle();

  if (membership?.role !== 'owner') {
    return c.json({ error: 'Only the group owner can change the password.' }, 403);
  }

  const { error } = await db
    .from('group_secrets')
    .update({ password_hash: await hashGroupPassword(password), updated_at: new Date().toISOString() })
    .eq('group_id', groupId);

  if (error) return c.json({ error: 'Could not update the password.' }, 500);
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Leave
// ---------------------------------------------------------------------------

groupRoutes.post('/:id/leave', async (c) => {
  const userId = c.get('user').id;
  const groupId = c.req.param('id');
  const db = serviceClient(c.env);

  const { data: membership } = await db
    .from('group_members')
    .select('role')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!membership) return c.json({ error: 'You are not in that group.' }, 404);

  // The owner leaving would strand the group with nobody able to delete it.
  if (membership.role === 'owner') {
    return c.json(
      { error: 'You own this group. Delete it instead, or it would be left with no owner.' },
      409,
    );
  }

  const { error } = await db
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', userId);

  if (error) return c.json({ error: 'Could not remove you from the group.' }, 500);
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Delete (owner only)
// ---------------------------------------------------------------------------

groupRoutes.delete('/:id', async (c) => {
  const userId = c.get('user').id;
  const groupId = c.req.param('id');
  const db = serviceClient(c.env);

  const { data: membership } = await db
    .from('group_members')
    .select('role')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .maybeSingle();

  if (membership?.role !== 'owner') {
    return c.json({ error: 'Only the person who created the group can delete it.' }, 403);
  }

  // Scenes, effects, folders, memberships and the secret all cascade from the
  // group row. Uploaded sounds live under a <group-id>/ prefix in storage and
  // are removed here, since storage has no foreign keys to cascade through.
  const { data: files } = await db.storage.from('effect-sounds').list(groupId, { limit: 1000 });
  if (files?.length) {
    await db.storage.from('effect-sounds').remove(files.map((f) => `${groupId}/${f.name}`));
  }

  const { error } = await db.from('groups').delete().eq('id', groupId);
  if (error) return c.json({ error: 'Could not delete the group.' }, 500);

  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Members of a group
// ---------------------------------------------------------------------------

groupRoutes.get('/:id/members', async (c) => {
  const userId = c.get('user').id;
  const groupId = c.req.param('id');
  const db = serviceClient(c.env);

  const { data: mine } = await db
    .from('group_members')
    .select('role')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!mine) return c.json({ error: 'You are not in that group.' }, 403);

  const { data } = await db
    .from('group_members')
    .select('user_id, role, profiles:user_id(display_name)')
    .eq('group_id', groupId);

  const members = (data ?? []).map((m) => ({
    userId: m.user_id as string,
    role: m.role as 'owner' | 'member',
    displayName:
      (m.profiles as unknown as { display_name?: string } | null)?.display_name ?? 'Adventurer',
  }));

  return c.json({ members });
});
