// Contract: raw IndexedDB mechanics live in a private adapter while
// vault.js remains the public owner of encryption, session state, mutation
// ordering, and provider/history/source semantics.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const adapterSource = readFileSync(new URL('../src/utils/vault-idb.js', import.meta.url), 'utf8');
const vaultSource = readFileSync(new URL('../src/utils/vault.js', import.meta.url), 'utf8');
const count = (source, needle) => source.split(needle).length - 1;

const controls = { openError: null, txThrow: null, txAbort: false, opError: null };
const stores = new Map();
const log = { opens: [], upgrades: [], transactions: [], operations: [] };

const request = () => ({ result: undefined, error: null, onsuccess: null, onerror: null });
const settleRequest = (req, result, error = null) => {
  req.result = result;
  req.error = error;
  queueMicrotask(() => error ? req.onerror?.() : req.onsuccess?.());
};

const transaction = (storeName, mode) => {
  if (controls.txThrow) {
    const error = controls.txThrow;
    controls.txThrow = null;
    throw error;
  }
  log.transactions.push([storeName, mode]);
  const tx = { error: null, oncomplete: null, onerror: null, onabort: null };
  tx.objectStore = (name) => ({
    get(key) {
      log.operations.push(['get', name, key]);
      const req = request();
      const error = controls.opError;
      controls.opError = null;
      settleRequest(req, stores.get(name)?.get(key), error);
      return req;
    },
    put(value, key) {
      log.operations.push(['put', name, key, value]);
      if (!stores.has(name)) stores.set(name, new Map());
      stores.get(name).set(key, value);
    },
    delete(key) {
      log.operations.push(['delete', name, key]);
      stores.get(name)?.delete(key);
    }
  });
  queueMicrotask(() => {
    if (controls.opError) {
      tx.error = controls.opError;
      controls.opError = null;
      tx.onerror?.();
    } else if (controls.txAbort) {
      controls.txAbort = false;
      tx.onabort?.();
    } else {
      tx.oncomplete?.();
    }
  });
  return tx;
};

globalThis.indexedDB = {
  open(name, version) {
    log.opens.push([name, version]);
    const req = request();
    queueMicrotask(() => {
      if (controls.openError) {
        const error = controls.openError;
        controls.openError = null;
        settleRequest(req, undefined, error);
        return;
      }
      const needsUpgrade = !stores.has('kv');
      req.result = {
        createObjectStore(storeName) {
          log.upgrades.push(storeName);
          stores.set(storeName, new Map());
        },
        transaction
      };
      if (needsUpgrade) req.onupgradeneeded?.();
      req.onsuccess?.();
    });
    return req;
  }
};

const adapter = await import('../src/utils/vault-idb.js');

test('Adapter exports only raw get/set/delete and owns the exact database contract', () => {
  assert.deepEqual(Object.keys(adapter).sort(), ['idbDelete', 'idbGet', 'idbSet']);
  assert.equal(count(adapterSource, "const DB_NAME = 'groundrumble-vault';"), 1);
  assert.equal(count(adapterSource, "const STORE = 'kv';"), 1);
  assert.equal(count(adapterSource, 'indexedDB.open(DB_NAME, 1)'), 1);
  assert.equal(count(adapterSource, 'req.result.createObjectStore(STORE)'), 1);
  assert.doesNotMatch(adapterSource, /localStorage|encryptJSON|decryptJSON|sessionPassphrase|mutationQueue|normalizeProviders/);
});

test('Set/get/delete preserve values, modes, ordering, missing null, and one cached open', async () => {
  const value = { nested: ['exact', 3] };
  await adapter.idbSet('alpha', value);
  assert.strictEqual(await adapter.idbGet('alpha'), value, 'raw values are not cloned or normalized by the adapter');
  await adapter.idbDelete('alpha');
  assert.equal(await adapter.idbGet('alpha'), null, 'missing IndexedDB undefined normalizes to null');
  assert.deepEqual(log.opens, [['groundrumble-vault', 1]], 'all operations reuse one opened connection');
  assert.deepEqual(log.upgrades, ['kv']);
  assert.deepEqual(log.transactions, [
    ['kv', 'readwrite'], ['kv', 'readonly'], ['kv', 'readwrite'], ['kv', 'readonly']
  ]);
  assert.deepEqual(log.operations, [
    ['put', 'kv', 'alpha', value], ['get', 'kv', 'alpha'], ['delete', 'kv', 'alpha'], ['get', 'kv', 'alpha']
  ]);
});

test('Request/transaction failures preserve their exact rejection behavior', async () => {
  controls.opError = new Error('read failed');
  await assert.rejects(adapter.idbGet('bad-read'), { message: 'read failed' });

  controls.opError = new Error('write failed');
  await assert.rejects(adapter.idbSet('bad-write', 1), { message: 'write failed' });

  controls.opError = new Error('delete failed');
  await assert.rejects(adapter.idbDelete('bad-delete'), { message: 'delete failed' });

  controls.txThrow = new Error('closed');
  await assert.rejects(adapter.idbSet('closed', 1), {
    message: 'Failed to create transaction: database connection may be closed'
  });

  controls.txAbort = true;
  await assert.rejects(adapter.idbSet('aborted', 1), { message: 'Transaction aborted' });
});

test('Vault adopts the adapter once, sheds mechanics, and keeps all public/domain ownership', () => {
  assert.equal(count(vaultSource, "import { idbGet, idbSet, idbDelete } from './vault-idb.js';"), 1);
  for (const name of ['openDB', 'idbGet', 'idbSet', 'idbDelete']) {
    assert.equal(count(vaultSource, `const ${name} =`), 0, `${name} definition leaves vault.js`);
  }
  for (const needle of [
    "const KEY = 'secrets';", "const HISTORY_KEY = 'audit-history';", "const SOURCES_KEY = 'ai-sources';",
    'const encryptPayload =', 'const decryptPayload =', 'let sessionPassphrase = null;',
    'let mutationQueue = Promise.resolve();', 'const enqueueMutation =', 'const parseRecord =',
    'export const loadVault', 'export const saveVault', 'export const unlockVault',
    'export const protectVault', 'export const unprotectVault', 'export const lockVault',
    'export const clearVault', 'export const loadAuditHistory', 'export const saveAuditHistory',
    'export const clearAuditHistory', 'export const loadSourceUrls', 'export const saveSourceUrls'
  ]) assert.equal(count(vaultSource, needle), 1, `vault.js retains ${needle}`);
  assert.ok(vaultSource.split('\n').length < 329, 'vault.js is strictly smaller than the 329-line baseline');
});
