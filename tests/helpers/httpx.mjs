// Shared HTTP response helpers for mocking fetch in the api.js tests.
const headers = (obj = {}) => ({
  get: (k) => {
    const v = obj[k.toLowerCase()];
    return v === undefined ? null : String(v);
  }
});

export const jsonRes = (data, status = 200, h = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: headers(h),
  text: async () => JSON.stringify(data),
  json: async () => data
});

export const textRes = (text, status = 200, h = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: headers(h),
  text: async () => text,
  json: async () => { throw new Error('not json'); }
});

// Exact parsed-hostname comparison for mock routing. Parses `url` structurally
// and compares `URL.hostname` for equality — never a substring — so a host that
// merely *contains* `host` (or vice versa) does not match. Malformed or
// non-URL input returns false.
export const hostIs = (url, host) => {
  try {
    return new URL(String(url)).hostname === host;
  } catch {
    return false;
  }
};

const dispatch = async (routes, req, fallback) => {
  for (const [pred, handler] of routes) {
    if (pred(req)) return typeof handler === 'function' ? handler(req) : handler;
  }
  return typeof fallback === 'function' ? fallback(req) : fallback;
};

// `routes` is a list of [predict, handler] pairs; predict receives
// { url, method, body } and returns truthy to claim the request.
export const stubFetch = (routes, fallback = jsonRes({}, 404)) => {
  const mockFetch = async (url, options = {}) => {
    let body = options.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { /* raw */ } }
    const req = { url: String(url), method: (options.method || 'GET').toUpperCase(), body, headers: options.headers, signal: options.signal };
    return dispatch(routes, req, fallback);
  };
  globalThis.fetch = mockFetch;
};

// Runs `fn` with setTimeout/clearTimeout replaced by microtasks, so exponential
// backoff retries complete instantly instead of sleeping for ~90s.
export const withFastTimers = async (fn) => {
  const origSet = globalThis.setTimeout;
  const origClear = globalThis.clearTimeout;
  const origNow = Date.now;
  let now = origNow();
  const pending = new Set();
  Date.now = () => now;
  globalThis.setTimeout = (cb, ms, ...args) => {
    const token = {};
    pending.add(token);
    queueMicrotask(() => {
      if (!pending.delete(token)) return;
      now += Math.max(0, Number(ms) || 0);
      cb(...args);
    });
    return token;
  };
  globalThis.clearTimeout = token => pending.delete(token);
  try {
    return await fn();
  } finally {
    globalThis.setTimeout = origSet;
    globalThis.clearTimeout = origClear;
    Date.now = origNow;
  }
};
