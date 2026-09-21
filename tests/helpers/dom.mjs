// Shared DOM globals for Node unit tests.
//
// - jsdom provides DOMParser (used by api.js article extraction) and a
//   window.confirm fallback for the proxy consent prompt.
// - A minimal in-memory IndexedDB shim powers vault.js (open / createObjectStore
//   / transaction .get .put .delete), which is the only surface vault uses.

const makeReq = () => {
  const r = {
    result: undefined,
    error: null,
    onsuccess: null,
    onerror: null,
    _finish: (res) => { r.result = res; queueMicrotask(() => r.onsuccess && r.onsuccess()); },
    _fail: (err) => { r.error = err; queueMicrotask(() => r.onerror && r.onerror()); }
  };
  return r;
};

export const installFakeIndexedDB = () => {
  const stores = new Map();
  let failNext = null;
  let failOpen = null;

  const txFor = () => {
    const tx = {
      oncomplete: null,
      onerror: null,
      error: null,
      _failed: false,
      objectStore: (name) => {
        let map = stores.get(name);
        if (!map) { map = new Map(); stores.set(name, map); }
        const guard = (fn) => {
          if (failNext) {
            const err = failNext; failNext = null;
            tx._failed = true;
            tx.error = err;
            const r = makeReq(); r._fail(err);
            queueMicrotask(() => tx.onerror && tx.onerror());
            return r;
          }
          return fn();
        };
        return {
          get: (key) => guard(() => { const r = makeReq(); r._finish(map.has(key) ? map.get(key) : undefined); return r; }),
          put: (value, key) => guard(() => { const r = makeReq(); map.set(key, value); r._finish(undefined); return r; }),
          delete: (key) => guard(() => { const r = makeReq(); map.delete(key); r._finish(undefined); return r; })
        };
      }
    };
    queueMicrotask(() => { if (!tx._failed && tx.oncomplete) tx.oncomplete(); });
    return tx;
  };

  globalThis.indexedDB = {
    open: (_name, _version) => {
      const req = makeReq();
      queueMicrotask(() => {
        if (failOpen) {
          const err = failOpen; failOpen = null;
          req._fail(err);
          return;
        }
        const needsUpgrade = stores.size === 0;
        req.result = {
          transaction: () => txFor(),
          createObjectStore: (name) => {
            stores.set(name, new Map());
            return {};
          }
        };
        if (needsUpgrade && req.onupgradeneeded) req.onupgradeneeded();
        if (req.onsuccess) req.onsuccess();
      });
      return req;
    }
  };

  return {
    reset: () => stores.clear(),
    failNextOp: (err) => { failNext = err || new Error('IDB operation failed'); },
    failNextOpen: (err) => { failOpen = err || new Error('IDB open failed'); }
  };
};

export const installLocalStorage = () => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    clear: () => store.clear()
  };
  return store;
};