#!/usr/bin/env node
/**
 * Pull the dndlights sound pack into this app.
 *
 *   node scripts/import-sounds.mjs
 *
 * Downloads each .wav from the dndlights `sounds` GitHub release, uploads it to
 * the Supabase `effect-sounds` bucket, and points the matching effect row at
 * it. Effects are matched by name: the `Fireball` effect gets `fireball.wav`.
 *
 * Reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from server/.env — the
 * service-role key is needed because it writes to storage and to effects on
 * behalf of no particular user.
 *
 * Safe to re-run: effects that already have a sound are skipped unless you
 * pass --force. About 95 MB total, so give it a few minutes.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const BUCKET = 'effect-sounds';
const RELEASE = 'https://github.com/ethanbudge/dndlights/releases/download/sounds';

const FORCE = process.argv.includes('--force');
const DRY = process.argv.includes('--dry-run');

// ---------------------------------------------------------------------------

function loadEnv() {
  const path = resolve(ROOT, 'server/.env');
  if (!existsSync(path)) {
    fail(`server/.env not found.\n  Run: bash scripts/setup-env.sh`);
  }

  const env = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return env;
}

function fail(msg) {
  console.error(`\n  ✗ ${msg}\n`);
  process.exit(1);
}

/** Effect name -> expected wav filename. "Ray of Frost" -> "ray_of_frost.wav" */
function wavFor(name) {
  return `${name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}.wav`;
}

// ---------------------------------------------------------------------------

const env = loadEnv();
if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  fail('server/.env is missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
}

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: effects, error } = await supabase
  .from('effects')
  .select('id, name, sound_path')
  .order('name');

if (error) fail(`Could not read effects: ${error.message}`);
if (!effects.length) {
  fail('No effects in the database. Run supabase/seed.sql first.');
}

const todo = effects.filter((e) => FORCE || !e.sound_path);

console.log(`\n  ${effects.length} effects, ${todo.length} needing a sound.`);
if (DRY) {
  for (const e of todo) console.log(`    ${e.name.padEnd(24)} <- ${wavFor(e.name)}`);
  console.log('\n  --dry-run: nothing uploaded.\n');
  process.exit(0);
}
if (!todo.length) {
  console.log('  Nothing to do. Use --force to re-upload everything.\n');
  process.exit(0);
}

let done = 0;
let failed = 0;

for (const effect of todo) {
  const wav = wavFor(effect.name);
  const label = effect.name.padEnd(24);

  try {
    const res = await fetch(`${RELEASE}/${wav}`);
    if (!res.ok) {
      console.log(`  ✗ ${label} ${wav} not in the release (${res.status})`);
      failed++;
      continue;
    }

    const bytes = new Uint8Array(await res.arrayBuffer());
    const path = `dndlights/${wav}`;

    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: 'audio/wav', upsert: true });

    if (upErr) throw new Error(upErr.message);

    const { error: dbErr } = await supabase
      .from('effects')
      .update({ sound_path: path })
      .eq('id', effect.id);

    if (dbErr) throw new Error(dbErr.message);

    done++;
    const mb = (bytes.length / 1024 / 1024).toFixed(1);
    console.log(`  ✓ ${label} ${wav.padEnd(24)} ${mb} MB   (${done}/${todo.length})`);
  } catch (err) {
    console.log(`  ✗ ${label} ${err.message}`);
    failed++;
  }
}

console.log(`\n  Done — ${done} uploaded${failed ? `, ${failed} failed` : ''}.`);
console.log('  Reload the app; sounds are preloaded when it starts.\n');

process.exit(failed ? 1 : 0);
