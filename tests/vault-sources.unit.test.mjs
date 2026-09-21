// Behavioral coverage for the vault.js edges the main suite leaves dark:
// idbSet's transaction-creation failure and abort rejections, parseRecord's
// corrupt-JSON-string handling, and the loadSourceUrls/saveSourceUrls
// encrypted-storage branches. Runs in its own process because the module
// caches its IndexedDB connection promise and its session state.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// --- self-contained fakes (the shared shim in helpers/dom.mjs can neither
// --- throw from db.transaction() nor fire tx.onabort, which is exactly what
// --- the uncovered branches need) ---

const installLocalStorage = () => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    clear: () => store.clear()
  };
  return store;
};

const makeReq = () => ({
  result: undefined,
  error: null,
  onsuccess: null,
  onerror: null
});

// Fake IndexedDB with test-control knobs:
// - armTxThrow(err): the next db.transaction() call throws err
//   (simulates writing against a closed connection).
// - armTxAbort(): the next readwrite transaction fires onabort instead of
//   oncomplete (simulates the transaction being aborted mid-write).
const installFakeIndexedDB = () => {
  const stores = new Map();
  const control = { txThrow: null, txAbort: false };

  const settle = (req, result) => {
    req.result = result;
    queueMicrotask(() => req.onsuccess && req.onsuccess());
  };

  const txFor = () => {
    if (control.txThrow) {
      const err = control.txThrow;
      control.txThrow = null;
      throw err;
    }
    const tx = { oncomplete: null, onerror: null, onabort: null, error: null };
    queueMicrotask(() => {
      if (control.txAbort) {
        control.txAbort = false;
        if (tx.onabort) tx.onabort();
        return;
      }
      if (tx.oncomplete) tx.oncomplete();
    });
    tx.objectStore = (name) => {
      let map = stores.get(name);
      if (!map) { map = new Map(); stores.set(name, map); }
      return {
        get: (key) => {
          const req = makeReq();
          settle(req, map.has(key) ? map.get(key) : undefined);
          return req;
        },
        put: (value, key) => {
          map.set(key, value);
          const req = makeReq();
          settle(req, undefined);
          return req;
        },
        delete: (key) => {
          map.delete(key);
          const req = makeReq();
          settle(req, undefined);
          return req;
        }
      };
    };
    return tx;
  };

  globalThis.indexedDB = {
    open: () => {
      const req = makeReq();
      queueMicrotask(() => {
        req.result = {
          transaction: txFor,
          createObjectStore: (name) => { stores.set(name, new Map()); return {}; },
          close: () => {}
        };
        if (stores.size === 0 && req.onupgradeneeded) req.onupgradeneeded();
        if (req.onsuccess) req.onsuccess();
      });
      return req;
    }
  };

  return {
    reset: () => {
      stores.clear();
      control.txThrow = null;
      control.txAbort = false;
    },
    seed: (storeName, key, value) => {
      let map = stores.get(storeName);
      if (!map) { map = new Map(); stores.set(storeName, map); }
      map.set(key, value);
    },
    armTxThrow: (err) => { control.txThrow = err; },
    armTxAbort: () => { control.txAbort = true; }
  };
};

const localStorageShim = installLocalStorage();
const idb = installFakeIndexedDB();

const {
  loadVault, saveVault, protectVault, lockVault, loadSourceUrls, saveSourceUrls
} = await import('../src/utils/vault.js');

const KV_STORE = 'kv';
const SECRETS_KEY = 'secrets';
const SOURCES_KEY = 'ai-sources';

const reset = async () => {
  idb.reset();
  localStorageShim.clear();
  await loadVault(); // first-run pass: clears session passphrase + lock state
};

test('loadVault falls back to first-run defaults when the stored record is an unparseable JSON string', async () => {
  await reset();
  idb.seed(KV_STORE, SECRETS_KEY, '{definitely not json');
  const v = await loadVault();
  assert.deepEqual(v, { v: 1, kind: 'plain', providers: [], locked: false, passphraseSet: false });
});

test('loadVault parses a valid JSON-string record instead of discarding it', async () => {
  await reset();
  idb.seed(KV_STORE, SECRETS_KEY, JSON.stringify({ v: 1, kind: 'plain', providers: [{ id: 'legacy' }] }));
  const v = await loadVault();
  assert.equal(v.kind, 'plain');
  assert.deepEqual(v.providers, [{ id: 'legacy' }]);
  assert.equal(v.locked, false);
});

test('loadSourceUrls returns [] for a missing record and for a plain record without sources', async () => {
  await reset();
  assert.deepEqual(await loadSourceUrls(), []);
  idb.seed(KV_STORE, SOURCES_KEY, { kind: 'plain' });
  assert.deepEqual(await loadSourceUrls(), []);
});

test('loadSourceUrls reads plain source lists, including legacy JSON-string records', async () => {
  await reset();
  idb.seed(KV_STORE, SOURCES_KEY, { kind: 'plain', sources: ['https://a.example', 'https://b.example'] });
  assert.deepEqual(await loadSourceUrls(), ['https://a.example', 'https://b.example']);
  idb.seed(KV_STORE, SOURCES_KEY, JSON.stringify({ kind: 'plain', sources: ['https://c.example'] }));
  assert.deepEqual(await loadSourceUrls(), ['https://c.example']);
});

test('saveSourceUrls stores plaintext without a session passphrase and reloads it verbatim', async () => {
  await reset();
  await saveSourceUrls(['https://plain.example', 'https://plain2.example']);
  const loaded = await loadSourceUrls();
  assert.deepEqual(loaded, ['https://plain.example', 'https://plain2.example']);
});

test('saveSourceUrls encrypts at rest while a session passphrase is active and loadSourceUrls decrypts it back', async () => {
  await reset();
  await protectVault({ providers: [], passphrase: 'sources-roundtrip' });
  await saveSourceUrls(['https://one.example', 'https://two.example']);
  // The encrypted branch unwraps the decrypted envelope the same way the plain
  // branch does: it returns the sources array, not the { sources: [...] } payload.
  assert.deepEqual(await loadSourceUrls(), ['https://one.example', 'https://two.example']);
});

test('saveSourceUrls normalizes non-array input to an empty source list (encrypted write path)', async () => {
  await reset();
  await protectVault({ providers: [], passphrase: 'sources-normalize' });
  await saveSourceUrls('not-an-array');
  assert.deepEqual(await loadSourceUrls(), []);
  await saveSourceUrls(null);
  assert.deepEqual(await loadSourceUrls(), []);
});

test('loadSourceUrls returns [] instead of throwing when the vault is locked (no session passphrase)', async () => {
  await reset();
  await protectVault({ providers: [], passphrase: 'sources-locked' });
  await saveSourceUrls(['https://secret.example']);
  lockVault();
  assert.deepEqual(await loadSourceUrls(), [], 'locked vault hides sources instead of throwing');
});

test('loadSourceUrls returns [] instead of throwing when decryption fails (passphrase changed underneath)', async () => {
  await reset();
  await protectVault({ providers: [], passphrase: 'first-pass-phrase' });
  await saveSourceUrls(['https://stale.example']);
  await protectVault({ providers: [], passphrase: 'second-pass-phrase' });
  assert.deepEqual(await loadSourceUrls(), [], 'a record encrypted under the old passphrase yields []');
});

test('idbSet rejects with the closed-connection error when the transaction cannot be created', async () => {
  await reset();
  idb.armTxThrow(new Error('simulated closed connection'));
  await assert.rejects(
    saveVault({ providers: [] }),
    { message: 'Failed to create transaction: database connection may be closed' }
  );
});

test('idbSet rejects with "Transaction aborted" when the write transaction aborts, and the vault keeps working', async () => {
  await reset();
  idb.armTxAbort();
  await assert.rejects(saveVault({ providers: [] }), { message: 'Transaction aborted' });
  // The failed write must not poison the mutation queue: the next save lands.
  await saveVault({ providers: [{ id: 'after-abort' }] });
  const v = await loadVault();
  assert.deepEqual(v.providers, [{ id: 'after-abort' }]);
});
