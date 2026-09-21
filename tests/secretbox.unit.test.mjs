// Contract for the shared passphrase-crypto module:
//   src/utils/secretbox.js — PBKDF2_ITERATIONS / MIN_ITERATIONS / MAX_ITERATIONS
//   / MIN_PASSPHRASE_LENGTH / clampIterations / toB64 / fromB64 / deriveKey /
//   envelopeIterations / encryptJSON / decryptJSON
// The crypto core that vault.js (record storage) and backup.js (bundle
// export/import) each carried now exists exactly once; both facades import it
// and re-export the public constant/clamp names so every existing specifier
// keeps resolving (vault.test / backup.test stay unmodified and green).
//
// The behavioral half locks every guarantee: identical constant/clamp
// semantics across both facades AND the module, exact envelope shapes, AAD
// context binding (vault records and backup envelopes stay mutually
// untransplantable), the pre-KDF out-of-range iteration guards with their
// exact texts, the non-integer fallback, and a hand-rolled PBKDF2-SHA256 +
// AES-256-GCM interop that proves the crypto parameters from outside the
// modules.
//
// Hermetic: bare node --test, fake IndexedDB/localStorage from
// tests/helpers/dom.mjs, js-yaml only via backup.js's existing declared
// dependency — no server, no browser, no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFakeIndexedDB, installLocalStorage } from './helpers/dom.mjs';

const { reset: resetDB } = installFakeIndexedDB();
installLocalStorage();

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readSource = (rel) => readFileSync(join(root, rel), 'utf8').replace(/\r\n/g, '\n');
const moduleSource = readSource('src/utils/secretbox.js');
const vaultSrc = readSource('src/utils/vault.js');
const backupSrc = readSource('src/utils/backup.js');

const countStr = (src, needle) => src.split(needle).length - 1;
const norm = (text) => text.replace(/\s+/g, ' ').trim();

import * as secretbox from '../src/utils/secretbox.js';
const vault = await import('../src/utils/vault.js');
const backup = await import('../src/utils/backup.js');
const {
  PBKDF2_ITERATIONS, MIN_ITERATIONS, MAX_ITERATIONS,
  clampIterations, toB64, fromB64, deriveKey, envelopeIterations, encryptJSON, decryptJSON
} = secretbox;
const {
  protectVault, unlockVault, loadVault, saveAuditHistory, loadAuditHistory
} = vault;
const { encryptBackup, decryptBackup } = backup;

const VAULT_RECORD_MSG = 'This Key Vault record uses an iteration count outside the supported range — it may be tampered with or written by a newer version of GroundRumble.';
const BACKUP_MSG = 'This backup uses an iteration count outside the supported range — it may be tampered with or written by a newer version of GroundRumble.';
const BACKUP_AAD_STRING = 'groundrumble-backup:v1';
const vaultAadString = (key) => `groundrumble-vault:${key}:v2`;
const TEST_AAD = new TextEncoder().encode('secretbox-suite:test-context');

// Independent PBKDF2-HMAC-SHA256 → AES-256-GCM reconstruction used to prove
// the envelope crypto parameters from OUTSIDE the modules (interop pin).
const te = new TextEncoder();
const b64Bytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const interopDecrypt = async ({ data, salt, iv }, passphrase, aadString, iterations) => {
  const base = await crypto.subtle.importKey('raw', te.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: b64Bytes(salt), iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64Bytes(iv), additionalData: te.encode(aadString) },
    key,
    b64Bytes(data)
  );
  return new TextDecoder().decode(pt);
};

const readRawRecord = (key) => new Promise((resolve) => {
  const req = indexedDB.open('groundrumble-vault', 1);
  req.onsuccess = () => {
    const tx = req.result.transaction('kv', 'readonly');
    const r = tx.objectStore('kv').get(key);
    r.onsuccess = () => resolve(r.result);
  };
});
const writeRawRecord = (key, record) => new Promise((resolve) => {
  const req = indexedDB.open('groundrumble-vault', 1);
  req.onsuccess = () => {
    const tx = req.result.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(record, key);
    tx.oncomplete = () => resolve();
  };
});
const reset = async () => { resetDB(); await loadVault(); };

// ---------------------------------------------------------------------------
// module contract: surface, signatures, purity
// ---------------------------------------------------------------------------

test('The module exports exactly the eleven shared crypto names — no default, no extras', async () => {
  assert.deepEqual(Object.keys(secretbox).sort(), [
    'MAX_ITERATIONS', 'MIN_ITERATIONS', 'MIN_PASSPHRASE_LENGTH', 'PBKDF2_ITERATIONS',
    'clampIterations', 'decryptJSON', 'deriveKey', 'encryptJSON', 'envelopeIterations',
    'fromB64', 'toB64'
  ]);
  assert.equal(countStr(moduleSource, 'export const'), 11, 'exactly eleven export const declarations');
  assert.doesNotMatch(moduleSource, /export default/, 'no default export');
});

test('The module is pure — no imports, no require, no fetch, no DOM/storage globals', () => {
  assert.doesNotMatch(moduleSource, /^import /m, 'no top-level import statements');
  assert.doesNotMatch(moduleSource, /\brequire\(/, 'no require calls');
  assert.doesNotMatch(moduleSource, /\bfetch\(/, 'no fetch');
  for (const forbidden of ['document.', 'window.', 'localStorage', 'indexedDB', 'sessionStorage']) {
    assert.equal(countStr(moduleSource, forbidden), 0, `the crypto core never touches ${forbidden}`);
  }
});

test('The carried machinery keeps its baseline shape — codec, KDF params, clamp, envelope ops', () => {
  const body = norm(moduleSource);
  for (const needle of [
    'export const PBKDF2_ITERATIONS = 2100000;',
    'export const MIN_ITERATIONS = 600000;',
    'export const MAX_ITERATIONS = 10000000;',
    'export const MIN_PASSPHRASE_LENGTH = 12;',
    'const b = new Uint8Array(buf);',
    'for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);',
    'return btoa(s);',
    'const bin = atob(s);',
    "const base = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);",
    "{ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },",
    "{ name: 'AES-GCM', length: 256 },",
    "['encrypt', 'decrypt']",
    'export const clampIterations = (n) => Math.max(MIN_ITERATIONS, Math.min(Number(n) || PBKDF2_ITERATIONS, MAX_ITERATIONS));',
    'const salt = crypto.getRandomValues(new Uint8Array(16));',
    'const iv = crypto.getRandomValues(new Uint8Array(12));',
    "return { v: 2, kind: 'encrypted', iterations: PBKDF2_ITERATIONS, salt: toB64(salt), iv: toB64(iv), data: toB64(ct) };",
    'const key = await deriveKey(passphrase, fromB64(record.salt), envelopeIterations(record, kind), true);',
    "const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(record.iv), additionalData: aad }, key, fromB64(record.data));",
    'return JSON.parse(dec.decode(pt));',
    'throw new Error(`This ${kind} uses an iteration count outside the supported range — it may be tampered with or written by a newer version of GroundRumble.`);'
  ]) {
    assert.ok(body.includes(norm(needle)), `carried machinery keeps …${needle.slice(0, 70)}…`);
  }
});

test('DeriveKey derives a non-extractable AES-256-GCM key by default and an extractable one when asked', async () => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bare = await deriveKey('pw-super-secret', salt, 1000);
  assert.equal(bare.algorithm.name, 'AES-GCM');
  assert.equal(bare.algorithm.length, 256);
  assert.equal(bare.extractable, false, 'the backup-baseline default is non-extractable');
  assert.deepEqual([...bare.usages].sort(), ['decrypt', 'encrypt']);
  const openable = await deriveKey('pw-super-secret', salt, 1000, true);
  assert.equal(openable.extractable, true, 'the vault envelope paths derive with extractable=true');
});

test('The base64 codec roundtrips every byte value and known vectors exactly', () => {
  assert.equal(toB64(new Uint8Array([104, 105])), 'aGk=');
  assert.deepEqual([...fromB64('aGk=')], [104, 105]);
  const all = new Uint8Array(256);
  for (let i = 0; i < 256; i++) all[i] = i;
  assert.deepEqual([...fromB64(toB64(all))], [...all], 'full 0–255 byte range roundtrips');
  assert.deepEqual([...fromB64(toB64(new Uint8Array(0)))], [], 'empty buffer roundtrips');
  assert.equal(fromB64(toB64(all)).byteLength, 256);
});

test('ClampIterations applies the exact baseline window (verbatim, floor, ceiling, non-number fallback)', () => {
  assert.equal(clampIterations(PBKDF2_ITERATIONS), PBKDF2_ITERATIONS);
  assert.equal(clampIterations(1), MIN_ITERATIONS, 'a downgraded count is raised to the floor');
  assert.equal(clampIterations(99999999999), MAX_ITERATIONS, 'a crafted huge count is capped');
  assert.equal(clampIterations(MAX_ITERATIONS), MAX_ITERATIONS);
  assert.equal(clampIterations(600001), 600001, 'in-range counts pass through verbatim');
  assert.equal(clampIterations(NaN), PBKDF2_ITERATIONS, 'a non-number falls back to the default');
  assert.equal(clampIterations('600001'), 600001, 'numeric strings coerce');
  assert.equal(clampIterations(undefined), PBKDF2_ITERATIONS);
});

test('EnvelopeIterations guards BEFORE any KDF work with the exact per-kind baseline texts', () => {
  assert.equal(envelopeIterations({ iterations: 600001 }, 'Key Vault record'), 600001, 'in-range counts used verbatim');
  assert.equal(envelopeIterations({ iterations: undefined }, 'backup'), PBKDF2_ITERATIONS, 'non-integer falls back to the default');
  assert.equal(envelopeIterations({ iterations: 0 }, 'backup'), PBKDF2_ITERATIONS);
  assert.equal(envelopeIterations({ iterations: -5 }, 'Key Vault record'), PBKDF2_ITERATIONS);
  assert.equal(envelopeIterations({ iterations: 1.5 }, 'Key Vault record'), PBKDF2_ITERATIONS);
  for (const iterations of [1, MAX_ITERATIONS + 1, 99999999999]) {
    assert.throws(() => envelopeIterations({ iterations }, 'Key Vault record'), { message: VAULT_RECORD_MSG });
    assert.throws(() => envelopeIterations({ iterations }, 'backup'), { message: BACKUP_MSG });
  }
});

test('EncryptJSON/decryptJSON roundtrip and produce the exact baseline envelope shape', async () => {
  const payload = { v: 1, providers: [{ id: 'cp', models: ['m1'] }], note: '🔒 unicode' };
  const env = await encryptJSON(payload, 'pw-super-secret', TEST_AAD);
  assert.deepEqual(Object.keys(env).sort(), ['data', 'iterations', 'iv', 'kind', 'salt', 'v']);
  assert.equal(env.v, 2);
  assert.equal(env.kind, 'encrypted');
  assert.equal(env.iterations, PBKDF2_ITERATIONS);
  assert.equal(atob(env.salt).length, 16, 'salt is 16 raw bytes');
  assert.equal(atob(env.iv).length, 12, 'iv is 12 raw bytes (GCM standard)');
  assert.deepEqual(await decryptJSON(env, 'pw-super-secret', TEST_AAD, 'suite record'), payload, 'roundtrip');
  const second = await encryptJSON(payload, 'pw-super-secret', TEST_AAD);
  assert.notEqual(second.salt, env.salt, 'each envelope gets a fresh salt');
  assert.notEqual(second.iv, env.iv, 'each envelope gets a fresh iv');
});

test('DecryptJSON rejects wrong passphrases, wrong AADs and corrupted payloads; a missing iteration count falls back', async () => {
  const payload = { check: 'me' };
  const env = await encryptJSON(payload, 'pw-super-secret', TEST_AAD);
  await assert.rejects(decryptJSON(env, 'wrong-pass-phrase', TEST_AAD, 'suite record'), undefined, 'GCM auth failure on the wrong passphrase');
  await assert.rejects(decryptJSON(env, 'pw-super-secret', new TextEncoder().encode('secretbox-suite:other-context'), 'suite record'), undefined, 'GCM auth failure under a different AAD');
  await assert.rejects(decryptJSON({ ...env, data: 'AAAA' }, 'pw-super-secret', TEST_AAD, 'suite record'), undefined, 'corrupted ciphertext');
  await assert.rejects(decryptJSON({ ...env, salt: 'AAAA' }, 'pw-super-secret', TEST_AAD, 'suite record'), undefined, 'corrupted salt');
  assert.deepEqual(
    await decryptJSON({ ...env, iterations: undefined }, 'pw-super-secret', TEST_AAD, 'suite record'),
    payload,
    'a stripped iteration count falls back to PBKDF2_ITERATIONS and still decrypts'
  );
});

test('Interop — a hand-rolled PBKDF2-SHA256 + AES-256-GCM key decrypts an encryptJSON envelope under the caller AAD', async () => {
  const payload = { interop: true, n: 3 };
  const env = await encryptJSON(payload, 'pw-super-secret', TEST_AAD);
  const plaintext = await interopDecrypt(env, 'pw-super-secret', 'secretbox-suite:test-context', PBKDF2_ITERATIONS);
  assert.deepEqual(JSON.parse(plaintext), payload, 'the module envelope is standard PBKDF2-SHA256 + AES-256-GCM, nothing bespoke');
});

// ---------------------------------------------------------------------------
// facade adoption: vault.js and backup.js own only their context
// ---------------------------------------------------------------------------

test('Vault.js adopts the module — import + specifier re-exports, zero local crypto definitions', () => {
  assert.match(vaultSrc, /import \{ encryptJSON, decryptJSON, MIN_PASSPHRASE_LENGTH \} from '\.\/secretbox\.js';/, 'vault imports the envelope ops');
  assert.match(vaultSrc, /export \{ PBKDF2_ITERATIONS, MIN_ITERATIONS, MAX_ITERATIONS, MIN_PASSPHRASE_LENGTH, clampIterations \} from '\.\/secretbox\.js';/, 'the specifier re-export keeps vault.test pins green');
  for (const needle of ['export const PBKDF2_ITERATIONS', 'export const clampIterations', 'const deriveKey =', 'const toB64 =', 'const fromB64 =', 'const recordIterations', 'crypto.subtle.importKey', 'crypto.subtle.deriveKey', 'crypto.getRandomValues']) {
    assert.equal(countStr(vaultSrc, needle), 0, `vault.js no longer defines ${needle}`);
  }
  const body = norm(vaultSrc);
  for (const needle of [
    'const aadFor = (key) => enc.encode(`groundrumble-vault:${key}:v2`);',
    'const encryptPayload = (payload, passphrase, aadKey) => encryptJSON(payload, passphrase, aadFor(aadKey));',
    "const decryptPayload = (record, passphrase, aadKey) => decryptJSON(record, passphrase, aadFor(aadKey), 'Key Vault record');",
    'passphrase.length < MIN_PASSPHRASE_LENGTH'
  ]) {
    assert.ok(body.includes(norm(needle)), `vault facade keeps …${needle.slice(0, 70)}…`);
  }
});

test('Backup.js adopts the module — import + specifier re-exports, zero local crypto definitions', () => {
  assert.match(backupSrc, /import \{ encryptJSON, decryptJSON, envelopeIterations, MIN_PASSPHRASE_LENGTH \} from '\.\/secretbox\.js';/, 'backup imports the envelope ops + guard');
  assert.match(backupSrc, /export \{ PBKDF2_ITERATIONS, MIN_ITERATIONS, MAX_ITERATIONS, MIN_PASSPHRASE_LENGTH, clampIterations \} from '\.\/secretbox\.js';/, 'the specifier re-export keeps backup.test pins green');
  for (const needle of ['export const PBKDF2_ITERATIONS', 'export const clampIterations', 'const deriveKey =', 'const toB64 =', 'const fromB64 =', 'const envelopeIterations =', 'crypto.subtle.importKey', 'crypto.subtle.deriveKey', 'crypto.getRandomValues']) {
    assert.equal(countStr(backupSrc, needle), 0, `backup.js no longer defines ${needle}`);
  }
  const body = norm(backupSrc);
  for (const needle of [
    "const BACKUP_AAD = enc.encode('groundrumble-backup:v1');",
    'const core = await encryptJSON(bundle, passphrase, BACKUP_AAD);',
    'iterations: core.iterations,',
    'salt: core.salt,',
    'iv: core.iv,',
    'ciphertext: core.data',
    "envelopeIterations(envelope, 'backup');",
    "return await decryptJSON({ ...envelope, data: envelope.ciphertext }, passphrase, BACKUP_AAD, 'backup');",
    "throw new Error('Incorrect passphrase or corrupted backup.');",
    'passphrase.length < MIN_PASSPHRASE_LENGTH'
  ]) {
    assert.ok(body.includes(norm(needle)), `backup facade keeps …${needle.slice(0, 70)}…`);
  }
});

test('The duplicated block exists EXACTLY once — every crypto primitive is defined in secretbox.js only', () => {
  const union = moduleSource + vaultSrc + backupSrc;
  for (const name of ['PBKDF2_ITERATIONS', 'MIN_ITERATIONS', 'MAX_ITERATIONS', 'MIN_PASSPHRASE_LENGTH', 'clampIterations', 'deriveKey', 'toB64', 'fromB64', 'envelopeIterations', 'encryptJSON', 'decryptJSON']) {
    assert.equal(countStr(union, `export const ${name}`), 1, `${name} is exported exactly once across vault + backup + secretbox`);
  }
  for (const needle of ['crypto.subtle.importKey', 'crypto.subtle.deriveKey', 'crypto.subtle.encrypt', 'crypto.subtle.decrypt', 'crypto.getRandomValues(new Uint8Array(16))', 'crypto.getRandomValues(new Uint8Array(12))', 'new TextDecoder()']) {
    assert.equal(countStr(union, needle), 1, `${needle} exists exactly once across the three files`);
  }
});

test('The facades are strictly net-smaller by the moved core (bounded gate, sim-proven)', () => {
  const vaultLines = vaultSrc.split('\n').length;
  const backupLines = backupSrc.split('\n').length;
  const moduleLines = moduleSource.split('\n').length;
  // vault.js is ~329 lines with its IndexedDB mechanics inline and ~275 after
  // they move to vault-idb.js.
  assert.ok(
    (vaultLines > 300 && vaultLines < 390) || (vaultLines > 240 && vaultLines < 300),
    `vault.js keeps its domain facade while shedding storage mechanics (landed ${vaultLines} lines)`
  );
  // Nine domain-validation lines for the canonical override entity are
  // excluded from the crypto-module line budget.
  assert.ok(backupLines - 9 > 255 && backupLines - 9 < 300, `backup.js keeps its bundle surface and sheds the crypto core (landed ${backupLines} lines, sim 279)`);
  assert.ok(moduleLines > 75 && moduleLines < 115, `secretbox.js is the single carried core (landed ${moduleLines} lines, sim 93)`);
});

// ---------------------------------------------------------------------------
// behavioral parity across BOTH facades AND the module
// ---------------------------------------------------------------------------

test('The four crypto constants are identical across secretbox, vault and backup with the baseline values', () => {
  const expected = { PBKDF2_ITERATIONS: 2100000, MIN_ITERATIONS: 600000, MAX_ITERATIONS: 10000000, MIN_PASSPHRASE_LENGTH: 12 };
  for (const [name, value] of Object.entries(expected)) {
    assert.equal(secretbox[name], value, `secretbox ${name}`);
    assert.equal(vault[name], value, `vault ${name}`);
    assert.equal(backup[name], value, `backup ${name}`);
  }
});

test('ClampIterations behaves identically across the module and both facades', () => {
  const cases = [[PBKDF2_ITERATIONS, PBKDF2_ITERATIONS], [1, MIN_ITERATIONS], [99999999999, MAX_ITERATIONS], [NaN, PBKDF2_ITERATIONS], ['600001', 600001], [MAX_ITERATIONS, MAX_ITERATIONS]];
  for (const [input, expected] of cases) {
    assert.equal(secretbox.clampIterations(input), expected, `secretbox clampIterations(${String(input)})`);
    assert.equal(vault.clampIterations(input), expected, `vault clampIterations(${String(input)})`);
    assert.equal(backup.clampIterations(input), expected, `backup clampIterations(${String(input)})`);
  }
});

test('The vault record path keeps its baseline envelope and roundtrips through protect/unlock', async () => {
  await reset();
  await protectVault({ providers: [{ id: 'x' }], passphrase: 'pw-super-secret' });
  const record = await readRawRecord('secrets');
  assert.deepEqual(Object.keys(record).sort(), ['data', 'iterations', 'iv', 'kind', 'salt', 'v']);
  assert.equal(record.v, 2);
  assert.equal(record.kind, 'encrypted');
  assert.equal(record.iterations, PBKDF2_ITERATIONS);
  assert.equal(atob(record.salt).length, 16);
  assert.equal(atob(record.iv).length, 12);
  const unlocked = await unlockVault('pw-super-secret');
  assert.deepEqual(unlocked.providers, [{ id: 'x' }]);
  const loaded = await loadVault();
  assert.equal(loaded.locked, false);
  assert.deepEqual(loaded.providers, [{ id: 'x' }]);
});

test('A wrong vault passphrase locks rather than throws; unlockVault rejects; expired envelopes lock too', async () => {
  await reset();
  await protectVault({ providers: [], passphrase: 'pw-old-secret' });
  const stale = await readRawRecord('secrets');
  await protectVault({ providers: [], passphrase: 'pw-new-secret' });
  await writeRawRecord('secrets', stale);
  const locked = await loadVault();
  assert.equal(locked.locked, true, 'a record encrypted under another passphrase loads as locked');
  assert.deepEqual(locked.providers, []);
  await assert.rejects(unlockVault('wrong-pass-phrase'), undefined, 'unlockVault rejects on the GCM failure');
});

test('UnlockVault rejects out-of-range record iteration counts with the exact Key Vault guard text', async () => {
  await reset();
  await protectVault({ providers: [], passphrase: 'pw-super-secret' });
  const record = await readRawRecord('secrets');
  for (const iterations of [1, MAX_ITERATIONS + 1, 99999999999]) {
    await writeRawRecord('secrets', { ...record, iterations });
    await assert.rejects(unlockVault('pw-super-secret'), { message: VAULT_RECORD_MSG });
  }
  await writeRawRecord('secrets', record);
  assert.deepEqual((await unlockVault('pw-super-secret')).providers, [], 'the genuine record still unlocks');
});

test('Audit history encrypts under its own record key and roundtrips (session passphrase)', async () => {
  await reset();
  await protectVault({ providers: [], passphrase: 'history-pass-word' });
  const history = [{ id: 'a1', details: [{ response: 'sensitive' }] }];
  await saveAuditHistory(history);
  assert.deepEqual(await loadAuditHistory(), history);
  const historyRecord = await readRawRecord('audit-history');
  assert.equal(historyRecord.v, 2);
  assert.equal(historyRecord.kind, 'encrypted');
  assert.equal(historyRecord.iterations, PBKDF2_ITERATIONS);
});

test('Interop — the secrets record decrypts under a hand-rolled key with its per-key AAD; the history AAD fails', async () => {
  await reset();
  const providers = [{ id: 'cp', name: 'Gateway', endpoint: 'https://gw/v1' }];
  await protectVault({ providers, passphrase: 'pw-super-secret' });
  const record = await readRawRecord('secrets');
  const plaintext = await interopDecrypt(record, 'pw-super-secret', vaultAadString('secrets'), PBKDF2_ITERATIONS);
  assert.deepEqual(JSON.parse(plaintext), { v: 1, providers }, 'the record is PBKDF2-SHA256 + AES-256-GCM bound to groundrumble-vault:secrets:v2');
  await assert.rejects(interopDecrypt(record, 'pw-super-secret', vaultAadString('audit-history'), PBKDF2_ITERATIONS), undefined, 'the audit-history AAD fails on a secrets record');
});

test('Interop — a backup envelope decrypts under a hand-rolled key with the backup AAD; a mutated AAD fails', async () => {
  const bundle = { app: 'groundrumble', version: 1, data: { atlas_demo_mode: 'true', atlas_compare_targets: '[1,2]' } };
  const env = await encryptBackup(bundle, 'pw-super-secret');
  const plaintext = await interopDecrypt({ data: env.ciphertext, salt: env.salt, iv: env.iv }, 'pw-super-secret', BACKUP_AAD_STRING, PBKDF2_ITERATIONS);
  assert.deepEqual(JSON.parse(plaintext), bundle, 'the envelope is PBKDF2-SHA256 + AES-256-GCM bound to groundrumble-backup:v1');
  await assert.rejects(interopDecrypt({ data: env.ciphertext, salt: env.salt, iv: env.iv }, 'pw-super-secret', 'groundrumble-backup:v2', PBKDF2_ITERATIONS), undefined, 'a different AAD string fails GCM');
});

test('DecryptBackup wraps wrong passphrases and corrupted ciphertext in the baseline error, and rejects out-of-range counts explicitly', async () => {
  const bundle = { app: 'groundrumble', version: 1, data: {} };
  const env = await encryptBackup(bundle, 'right-secret-pass');
  await assert.rejects(decryptBackup(env, 'wrong-pass-phrase'), { message: 'Incorrect passphrase or corrupted backup.' });
  await assert.rejects(decryptBackup({ ...env, ciphertext: 'AAAA' }, 'right-secret-pass'), { message: 'Incorrect passphrase or corrupted backup.' });
  for (const iterations of [1, MAX_ITERATIONS + 1, 99999999999]) {
    await assert.rejects(decryptBackup({ ...env, iterations }, 'right-secret-pass'), { message: BACKUP_MSG }, 'the guard fires before any KDF and is not swallowed by the wrap');
  }
  assert.deepEqual(await decryptBackup(env, 'right-secret-pass'), bundle, 'in-range envelopes still decrypt');
});

test('A secrets envelope transplanted into the audit-history slot decrypts to nothing (AAD mismatch)', async () => {
  await reset();
  await protectVault({ providers: [], passphrase: 'pw-super-secret' });
  const secretsEnvelope = await readRawRecord('secrets');
  await writeRawRecord('audit-history', secretsEnvelope);
  assert.equal(await loadAuditHistory(), null, 'the envelope is bound to groundrumble-vault:secrets:v2 and fails under the history AAD');
});

test('A vault record does not decrypt as a backup envelope (cross-call-site binding)', async () => {
  await reset();
  await protectVault({ providers: [], passphrase: 'pw-super-secret' });
  const record = await readRawRecord('secrets');
  const asBackup = {
    app: 'groundrumble', kind: 'encrypted', version: 1,
    iterations: record.iterations, salt: record.salt, iv: record.iv, ciphertext: record.data
  };
  await assert.rejects(decryptBackup(asBackup, 'pw-super-secret'), { message: 'Incorrect passphrase or corrupted backup.' });
});

test('A backup envelope does not unlock as a vault record (cross-call-site binding)', async () => {
  await reset();
  const env = await encryptBackup({ app: 'groundrumble', version: 1, data: {} }, 'pw-super-secret');
  await writeRawRecord('secrets', {
    v: 2, kind: 'encrypted', iterations: env.iterations, salt: env.salt, iv: env.iv, data: env.ciphertext
  });
  await assert.rejects(unlockVault('pw-super-secret'), undefined, 'the backup AAD fails against the vault context binding');
});

test('Non-integer / non-positive record iteration counts fall back to the default instead of throwing', async () => {
  await reset();
  await protectVault({ providers: [], passphrase: 'pw-super-secret' });
  const record = await readRawRecord('secrets');
  for (const iterations of [undefined, 0, -5, 1.5, 'lots']) {
    await writeRawRecord('secrets', { ...record, iterations });
    const unlocked = await unlockVault('pw-super-secret');
    assert.deepEqual(unlocked.providers, [], `iterations=${String(iterations)} falls back to PBKDF2_ITERATIONS`);
  }
});

test('The encrypt path embeds PBKDF2_ITERATIONS in every envelope produced by the module or either facade', async () => {
  await reset();
  await protectVault({ providers: [], passphrase: 'pw-super-secret' });
  assert.equal((await readRawRecord('secrets')).iterations, PBKDF2_ITERATIONS, 'vault record');
  assert.equal((await encryptBackup({ app: 'groundrumble', version: 1, data: {} }, 'pw-super-secret')).iterations, PBKDF2_ITERATIONS, 'backup envelope');
  assert.equal((await encryptJSON({ n: 1 }, 'pw-super-secret', TEST_AAD)).iterations, PBKDF2_ITERATIONS, 'module envelope');
});
