// Full coverage of src/utils/vault.js — IndexedDB-backed secret storage with
// optional passphrase encryption and session lock semantics.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeIndexedDB, installLocalStorage } from './helpers/dom.mjs';

const { reset: resetDB, failNextOp } = installFakeIndexedDB();
installLocalStorage();

const {
  vaultSupported, loadVault, saveVault, unlockVault, protectVault,
  unprotectVault, hasVaultPassphrase, lockVault, clearVault, validateProviders,
  loadAuditHistory, saveAuditHistory, clearAuditHistory, PBKDF2_ITERATIONS,
  clampIterations, MIN_ITERATIONS, MAX_ITERATIONS, MIN_PASSPHRASE_LENGTH
} = await import('../src/utils/vault.js');

const reset = async () => { resetDB(); await loadVault(); };

test('vaultSupported reflects indexedDB + subtle availability', () => {
  assert.equal(vaultSupported(), true);
  const origIDB = globalThis.indexedDB;
  globalThis.indexedDB = undefined;
  try {
    assert.equal(vaultSupported(), false);
  } finally { globalThis.indexedDB = origIDB; }
});

test('validateProviders rejects malformed and duplicate provider records', () => {
  const valid = validateProviders([{
    id: 'cp', name: 'Gateway', endpoint: 'https://example.com/v1', connector: 'openai', models: ['m1'],
    headers: '{"X-Test":"ok"}', method: 'POST'
  }]);
  assert.equal(valid[0].enabled, true);
  assert.throws(() => validateProviders([{ id: 'bad', name: 'Bad', endpoint: 'file:///tmp', connector: 'openai', models: [] }]), /invalid provider/);
  assert.throws(() => validateProviders([
    { id: 'same', name: 'A', endpoint: 'https://a', connector: 'openai', models: [] },
    { id: 'same', name: 'B', endpoint: 'https://b', connector: 'openai', models: [] }
  ]), /duplicate/);
  const base = { id: 'edge', name: 'Edge', endpoint: 'https://example.com', connector: 'openai', models: [] };
  assert.throws(() => validateProviders([{ ...base, endpoint: 'not-a-url' }]), /invalid provider/);
  assert.throws(() => validateProviders([{ ...base, modelsEndpoint: '%%%'}]), /invalid provider/);
  assert.throws(() => validateProviders([{ ...base, headers: '{bad' }]), /invalid provider/);
  assert.throws(() => validateProviders([{ ...base, headers: '{"X":1}' }]), /invalid provider/);
  assert.throws(() => validateProviders([{ ...base, connector: 'raw', bodyTemplate: '{bad' }]), /invalid provider/);
});

test('loadVault with no record returns empty defaults', async () => {
  await reset();
  const v = await loadVault();
  assert.equal(v.kind, 'plain');
  assert.equal(v.locked, false);
  assert.deepEqual(v.providers, []);
});

test('loadVault adopts providers already in localStorage on first run', async () => {
  await reset();
  localStorage.setItem('atlas_providers', JSON.stringify([{ id: 'cp', name: 'Mine' }]));
  const v = await loadVault();
  assert.equal(v.providers.length, 1);
  assert.equal(v.providers[0].id, 'cp');
  assert.equal(localStorage.getItem('atlas_providers'), null, 'providers move out of localStorage after adoption');
  const again = await loadVault();
  assert.equal(again.providers.length, 1, 'adopted providers persist in the vault');
});

test('saveVault persists providers and reloads them normalized', async () => {
  await reset();
  await saveVault({ providers: [1, 2] });
  const v = await loadVault();
  assert.deepEqual(v.providers, [1, 2]);
});

test('protectVault encrypts at rest and locks until unlocked', async () => {
  await reset();
  await protectVault({ providers: [], passphrase: 'pw-one-secret' });
  assert.equal(await hasVaultPassphrase(), true);

  lockVault();
  const locked = await loadVault();
  assert.equal(locked.kind, 'encrypted');
  assert.equal(locked.locked, true);
  assert.deepEqual(locked.providers, []);
});

test('unlockVault returns plaintext and loadVault then decrypts with the session passphrase', async () => {
  await reset();
  await protectVault({ providers: [{ id: 'x' }], passphrase: 'pw-two-secret' });
  const unlocked = await unlockVault('pw-two-secret');
  assert.equal(unlocked.providers.length, 1);

  const loaded = await loadVault();
  assert.equal(loaded.locked, false);
  assert.deepEqual(loaded.providers, [{ id: 'x' }]);
});

test('unlockVault rejects a wrong passphrase and non-encrypted vaults', async () => {
  await reset();
  await protectVault({ providers: [], passphrase: 'good-pass-phrase' });
  lockVault();
  await assert.rejects(unlockVault('bad'), undefined);

  await reset();
  await saveVault({ providers: [] });
  await assert.rejects(unlockVault('any'), /not passphrase-protected/);
});

test('protectVault enforces a passphrase of at least MIN_PASSPHRASE_LENGTH', async () => {
  await reset();
  await assert.rejects(protectVault({ providers: [], passphrase: '' }), /at least 12 characters/);
  await assert.rejects(protectVault({ providers: [], passphrase: 'short' }), /at least 12 characters/);
  assert.equal(MIN_PASSPHRASE_LENGTH, 12);
});

test('saveVault while a session passphrase is active stores an encrypted record', async () => {
  await reset();
  await protectVault({ providers: [], passphrase: 'session-pass' });
  await saveVault({ providers: [] });
  assert.equal(await hasVaultPassphrase(), true);
  const loaded = await loadVault();
  assert.equal(loaded.locked, false);
  assert.deepEqual(loaded.providers, []);
});

test('saveVault rejects writes after locking an existing vault', async () => {
  await reset();
  await protectVault({ providers: [], passphrase: 'lock-pass-word' });
  lockVault();
  await assert.rejects(saveVault({ providers: [] }), /vault is locked/i);
});

test('audit history is encrypted, unavailable while locked, and clearable', async () => {
  await reset();
  await protectVault({ providers: [], passphrase: 'history-pass' });
  const history = [{ id: 'a1', details: [{ response: 'sensitive' }] }];
  await saveAuditHistory(history);
  assert.deepEqual(await loadAuditHistory(), history);
  // A history write queued before a lock must still persist: the lock keeps the
  // captured passphrase valid for a later unlock, so dropping the write would
  // silently lose the audit's detailed evidence.
  const queuedHistory = saveAuditHistory([{ id: 'queued' }]);
  lockVault();
  await queuedHistory;
  assert.equal(await loadAuditHistory(), null, 'history is unavailable while locked');
  await unlockVault('history-pass');
  assert.deepEqual(await loadAuditHistory(), [{ id: 'queued' }], 'queued history written under the lock is restored after unlock');
  const decrypt = crypto.subtle.decrypt;
  crypto.subtle.decrypt = async () => { throw new Error('corrupt history'); };
  try { assert.equal(await loadAuditHistory(), null); } finally { crypto.subtle.decrypt = decrypt; }
  lockVault();
  assert.equal(await loadAuditHistory(), null);
  await unlockVault('history-pass');
  assert.deepEqual(await loadAuditHistory(), [{ id: 'queued' }]);
  await clearAuditHistory();
  assert.equal(await loadAuditHistory(), null);
});

test('saveAuditHistory rejects without a session passphrase', async () => {
  await reset();
  await assert.rejects(
    saveAuditHistory([{ id: 'no-pass' }]),
    { message: 'A passphrase-protected vault is required for detailed audit history.' }
  );
});

test('unprotectVault stores plaintext and drops the session passphrase', async () => {
  await reset();
  await protectVault({ providers: [], passphrase: 'pw-super-secret' });
  await unprotectVault({ providers: [] });
  assert.equal(await hasVaultPassphrase(), false);
  const loaded = await loadVault();
  assert.equal(loaded.kind, 'plain');
  assert.deepEqual(loaded.providers, []);
});

test('clearVault wipes the record and the session passphrase', async () => {
  await reset();
  await protectVault({ providers: [], passphrase: 'pw-super-secret' });
  await clearVault();
  assert.equal(await hasVaultPassphrase(), false);
  const loaded = await loadVault();
  assert.equal(loaded.locked, false);
  assert.deepEqual(loaded.providers, []);
});

test('providers survive protect → unlock → unprotect round-trips', async () => {
  await reset();
  const providers = [{ id: 'cp1', name: 'Gateway', endpoint: 'https://gw/v1' }];
  await protectVault({ providers, passphrase: 'pw-super-secret' });
  lockVault();

  const locked = await loadVault();
  assert.equal(locked.locked, true);
  const unlocked = await unlockVault('pw-super-secret');
  assert.deepEqual(unlocked.providers, providers, 'providers preserved after unlock');

  await unprotectVault({ providers: unlocked.providers });
  const after = await loadVault();
  assert.equal(after.locked, false);
  assert.deepEqual(after.providers, providers, 'providers preserved after unprotect');
});

// Low-level read/write of the vault record, routed through the same fake IDB
// the module uses — needed to simulate an externally corrupted vault.
const readRawRecord = () => new Promise((resolve) => {
  const req = indexedDB.open('groundrumble-vault', 1);
  req.onsuccess = () => {
    const tx = req.result.transaction('kv', 'readonly');
    const r = tx.objectStore('kv').get('secrets');
    r.onsuccess = () => resolve(r.result);
  };
});
const writeRawRecord = (record) => new Promise((resolve) => {
  const req = indexedDB.open('groundrumble-vault', 1);
  req.onsuccess = () => {
    const tx = req.result.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(record, 'secrets');
    tx.oncomplete = () => resolve();
  };
});

test('encrypted vault records carry the current iteration count', async () => {
  await reset();
  await protectVault({ providers: [], passphrase: 'pw-super-secret' });
  const record = await readRawRecord();
  assert.equal(record.v, 2);
  assert.equal(record.iterations, PBKDF2_ITERATIONS);
  const unlocked = await unlockVault('pw-super-secret');
  assert.deepEqual(unlocked.providers, []);
});

test('recordIterations clamps a stored iteration count to [MIN, MAX]', () => {
  assert.equal(clampIterations(PBKDF2_ITERATIONS), PBKDF2_ITERATIONS);
  assert.equal(clampIterations(1), MIN_ITERATIONS, 'a downgraded count is raised to the floor');
  assert.equal(clampIterations(99999999999), MAX_ITERATIONS, 'a crafted huge count is capped');
  assert.equal(clampIterations(NaN), PBKDF2_ITERATIONS, 'a non-number falls back to the default');
});

test('unlockVault rejects an out-of-range iteration count explicitly instead of silently clamping', async () => {
  await reset();
  await protectVault({ providers: [], passphrase: 'pw-super-secret' });
  const record = await readRawRecord();
  // A tampered/downgraded/future iteration count is rejected with its own
  // explicit error (distinguishable from a wrong passphrase) before any KDF.
  for (const iterations of [1, MAX_ITERATIONS + 1, 99999999999]) {
    await writeRawRecord({ ...record, iterations });
    await assert.rejects(unlockVault('pw-super-secret'), /outside the supported range/);
  }
  // Restoring the genuine record still unlocks.
  await writeRawRecord(record);
  const unlocked = await unlockVault('pw-super-secret');
  assert.deepEqual(unlocked.providers, []);
});

test('loadVault removes a corrupt legacy atlas_providers key instead of leaving it behind', async () => {
  resetDB(); // no vault record yet — simulates the first-run migration path
  localStorage.setItem('atlas_providers', '{corrupt json');
  const v = await loadVault();
  assert.deepEqual(v.providers, []);
  assert.equal(localStorage.getItem('atlas_providers'), null, 'the corrupt legacy key must be removed so it cannot linger in plaintext');
});

test('loadVault treats an expired session passphrase as locked (decrypt failure)', async () => {
  await reset();
  await protectVault({ providers: [], passphrase: 'pw-old-secret' });
  const staleEnvelope = await readRawRecord(); // encrypted with pw-old

  // New session key, then corrupt the vault back to the earlier envelope.
  await protectVault({ providers: [], passphrase: 'pw-new-secret' });
  await writeRawRecord(staleEnvelope);

  const loaded = await loadVault();
  assert.equal(loaded.kind, 'encrypted');
  assert.equal(loaded.locked, true);
  assert.deepEqual(loaded.providers, []);
});

// IndexedDB error paths: reads/writes reject and propagate the error.
test('vault operations reject when IndexedDB fails', async () => {
  await reset();
  await saveVault({ providers: [] });

  failNextOp(new Error('IDB read failed'));
  await assert.rejects(loadVault(), /IDB read failed/);

  failNextOp(new Error('IDB write failed'));
  await assert.rejects(saveVault({ providers: [] }), /IDB write failed/);

  failNextOp(new Error('IDB delete failed'));
  await assert.rejects(clearVault(), /IDB delete failed/);
});
