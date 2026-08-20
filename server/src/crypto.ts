/**
 * AES-256-GCM encryption for stored third-party secrets.
 *
 * Uses Web Crypto (`globalThis.crypto.subtle`), which exists identically in
 * Node 18+ and Cloudflare Workers — no `node:crypto` import, so this file is
 * portable to the edge unchanged.
 *
 * Wire format: base64( iv[12 bytes] || ciphertext+tag )
 */

const IV_BYTES = 12;

function b64encode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function b64decode(s: string) {
  const bin = atob(s);
  // Allocate the ArrayBuffer explicitly: TS 5.7 distinguishes
  // Uint8Array<ArrayBuffer> from Uint8Array<ArrayBufferLike>, and only the
  // former satisfies the BufferSource that Web Crypto expects.
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

let cachedKey: CryptoKey | null = null;
let cachedKeyMaterial = '';

async function getKey(rawBase64: string): Promise<CryptoKey> {
  if (cachedKey && cachedKeyMaterial === rawBase64) return cachedKey;

  const raw = b64decode(rawBase64);
  if (raw.length !== 32) {
    throw new Error(
      `CREDENTIAL_ENC_KEY must decode to exactly 32 bytes (got ${raw.length}). ` +
        `Generate one with:  openssl rand -base64 32`,
    );
  }

  cachedKey = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
  cachedKeyMaterial = rawBase64;
  return cachedKey;
}

export async function encryptSecret(plaintext: string, keyBase64: string): Promise<string> {
  const key = await getKey(keyBase64);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext),
  );

  const packed = new Uint8Array(IV_BYTES + ct.byteLength);
  packed.set(iv, 0);
  packed.set(new Uint8Array(ct), IV_BYTES);
  return b64encode(packed);
}

export async function decryptSecret(packedBase64: string, keyBase64: string): Promise<string> {
  const key = await getKey(keyBase64);
  const packed = b64decode(packedBase64);
  const iv = packed.slice(0, IV_BYTES);
  const ct = packed.slice(IV_BYTES);

  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new TextDecoder().decode(plain);
}

// ---------------------------------------------------------------------------
// Signed OAuth state
// ---------------------------------------------------------------------------
// Spotify redirects the *browser* back to /api/spotify/callback, and that
// request carries no Authorization header. So the `state` parameter has to
// carry the user id itself — and be tamper-proof, or anyone could bind their
// Spotify account to someone else's row. We HMAC it with the same master key.

interface StatePayload {
  uid: string;
  exp: number;
}

async function hmac(data: string, keyBase64: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    b64decode(keyBase64),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return b64encode(new Uint8Array(sig));
}

export async function signState(userId: string, keyBase64: string): Promise<string> {
  const payload: StatePayload = { uid: userId, exp: Date.now() + 10 * 60 * 1000 };
  const body = b64encode(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await hmac(body, keyBase64);
  return `${body}.${sig}`;
}

export async function verifyState(state: string, keyBase64: string): Promise<string | null> {
  const [body, sig] = state.split('.');
  if (!body || !sig) return null;

  const expected = await hmac(body, keyBase64);
  // Constant-time-ish comparison
  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  if (diff !== 0) return null;

  try {
    const payload: StatePayload = JSON.parse(new TextDecoder().decode(b64decode(body)));
    if (Date.now() > payload.exp) return null;
    return payload.uid;
  } catch {
    return null;
  }
}
