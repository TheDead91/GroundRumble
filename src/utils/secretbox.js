// Shared passphrase-crypto core: the single owner of the PBKDF2-HMAC-SHA256 →
// AES-256-GCM machinery used by src/utils/vault.js (record storage) and
// src/utils/backup.js (bundle export/import). Pure: no imports, no
// DOM/storage/fetch — every context binding (GCM AAD) and envelope shape is
// supplied by the calling facade.

// PBKDF2-HMAC-SHA256 iteration count, per current OWASP guidance (≥ 2,000,000
// for PBKDF2-HMAC-SHA256). The exact count is stored in each encrypted envelope
// so it can be raised without breaking existing records or backups.
export const PBKDF2_ITERATIONS = 2100000;

// Bounds applied to the per-envelope iteration count read back from storage.
// The value is attacker-influenced (it lives inside the encrypted envelope), so
// it must be clamped: a floor keeps a downgraded record from making offline
// brute-force cheap, and a ceiling stops a crafted envelope from spinning the
// KDF for a very long time (DoS on unlock/decrypt).
export const MIN_ITERATIONS = 600000;
export const MAX_ITERATIONS = 10000000;

// Minimum passphrase length, enforced at the crypto boundary (not just the UI).
export const MIN_PASSPHRASE_LENGTH = 12;

const enc = new TextEncoder();
const dec = new TextDecoder();

export const toB64 = (buf) => {
  const b = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s);
};

export const fromB64 = (s) => {
  const bin = atob(s);
  const b = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  return b;
};

export const deriveKey = async (passphrase, salt, iterations, extractable = false) => {
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    extractable,
    ['encrypt', 'decrypt']
  );
};

export const clampIterations = (n) => Math.max(MIN_ITERATIONS, Math.min(Number(n) || PBKDF2_ITERATIONS, MAX_ITERATIONS));

// Resolve the exact iteration count an envelope was encrypted with. In-range
// counts are used verbatim (a tampered or future count then fails GCM with a
// misleading "wrong passphrase" only if it is ALSO a valid KDF count); counts
// outside the supported window are rejected explicitly so a downgrade attempt,
// a crafted DoS envelope, or a genuine future format is distinguishable from a
// wrong passphrase — and rejected BEFORE any KDF work is done. `kind` supplies
// the caller's user-facing context text for the rejection message.
export const envelopeIterations = (record, kind) => {
  const n = record.iterations;
  if (!Number.isInteger(n) || n <= 0) return PBKDF2_ITERATIONS;
  if (n < MIN_ITERATIONS || n > MAX_ITERATIONS) {
    throw new Error(`This ${kind} uses an iteration count outside the supported range — it may be tampered with or written by a newer version of GroundRumble.`);
  }
  return n;
};

// Encrypt a JSON payload with a passphrase under the caller's context binding
// (GCM AAD), returning an opaque envelope object. A fresh salt and IV are
// generated per envelope; the iteration count is embedded so it can be raised
// without breaking existing records.
export const encryptJSON = async (payload, passphrase, aad) => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, PBKDF2_ITERATIONS, true);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad }, key, enc.encode(JSON.stringify(payload)));
  return { v: 2, kind: 'encrypted', iterations: PBKDF2_ITERATIONS, salt: toB64(salt), iv: toB64(iv), data: toB64(ct) };
};

// Decrypt an envelope produced by encryptJSON (or a legacy in-place one). The
// per-envelope iteration count is resolved before any KDF work so an
// out-of-range count surfaces as its own explicit error, labelled with the
// caller's `kind` context.
export const decryptJSON = async (record, passphrase, aad, kind) => {
  const key = await deriveKey(passphrase, fromB64(record.salt), envelopeIterations(record, kind), true);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(record.iv), additionalData: aad }, key, fromB64(record.data));
  return JSON.parse(dec.decode(pt));
};
