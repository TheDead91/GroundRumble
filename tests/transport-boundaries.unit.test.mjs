import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as settle } from 'node:timers/promises';
import { RateLimiter } from '../src/utils/api/rate-limiter.js';
import { fetchWithRetry } from '../src/utils/api/fetch-retry.js';
import { queryModel } from '../src/utils/api/provider-client.js';
import { makeProvider } from './fixtures/audit-factory.mjs';
import { jsonRes } from './helpers/httpx.mjs';

test('RateLimiter_ConcurrentSameKey_ReservesDistinctStartTimes', async t => {
  // Arrange
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 100000 });
  const limiter = new RateLimiter();
  const starts = [];
  // Act
  const pending = Array.from({ length: 3 }, (_, index) => limiter.wait('model', 60).then(() => starts.push([index, Date.now()])));
  await settle();
  t.mock.timers.tick(999);
  await settle();
  // Assert: none of the queued requests may start before its own slot.
  assert.deepEqual(starts, [[0, 100000]]);
  t.mock.timers.tick(1);
  await settle();
  assert.deepEqual(starts, [[0, 100000], [1, 101000]]);
  t.mock.timers.tick(1000);
  await Promise.all(pending);
  assert.deepEqual(starts, [[0, 100000], [1, 101000], [2, 102000]]);
});

test('RateLimiter_DifferentKeys_ProceedIndependently', async t => {
  // Arrange
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 100000 });
  const limiter = new RateLimiter();
  // Act
  await Promise.all([limiter.wait('first', 1), limiter.wait('second', 1)]);
  // Assert
  assert.equal(Date.now(), 100000, 'different providers must not queue behind one another');
});

for (const rpm of [0, -1, null, undefined, NaN, Infinity, 'invalid']) {
  test(`RateLimiter_DisabledRPM${rpm}_DoesNotWait`, async t => {
    // Arrange
    t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 100000 });
    const limiter = new RateLimiter();
    // Act
    await Promise.all([limiter.wait('model', rpm), limiter.wait('model', rpm)]);
    // Assert
    assert.equal(limiter.slots.size, 0);
    assert.equal(Date.now(), 100000);
  });
}

for (const reason of [new Error('Stop requested'), 'user stopped']) {
  test(`RateLimiter_${typeof reason === 'string' ? 'String' : 'Error'}AbortReason_RejectsAndCleansListener`, async t => {
    // Arrange
    t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 100000 });
    const limiter = new RateLimiter();
    await limiter.wait('model', 60);
    const controller = new AbortController();
    const remove = t.mock.method(controller.signal, 'removeEventListener');
    const pending = limiter.wait('model', 60, controller.signal);
    const rejection = assert.rejects(pending, error => reason instanceof Error ? error === reason : error.name === 'AbortError');
    // Act
    controller.abort(reason);
    await rejection;
    t.mock.timers.tick(1000);
    // Assert
    assert.equal(remove.mock.callCount(), 1);
    assert.equal(remove.mock.calls[0].arguments[0], 'abort');
  });
}

test('RateLimiter_Clear_RemovesPreviousRunReservations', async t => {
  // Arrange
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 100000 });
  const limiter = new RateLimiter();
  await limiter.wait('model', 1);
  // Act
  limiter.clear();
  await limiter.wait('model', 1);
  // Assert
  assert.equal(Date.now(), 100000);
  assert.equal(limiter.slots.size, 1);
});

test('FetchRetry_TransientRateLimit_WaitsExactBackoffBeforeRecovery', async t => {
  // Arrange
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 100000 });
  const starts = [];
  const fetch = t.mock.method(globalThis, 'fetch', async () => {
    starts.push(Date.now());
    return starts.length < 3 ? jsonRes({}, 429) : jsonRes({ ok: true });
  });
  // Act
  const pending = fetchWithRetry('https://provider.example', {}, 2);
  await settle();
  t.mock.timers.tick(499);
  await settle();
  assert.equal(fetch.mock.callCount(), 1, 'retry must wait the full 500 ms');
  t.mock.timers.tick(1);
  await settle();
  t.mock.timers.tick(999);
  await settle();
  assert.equal(fetch.mock.callCount(), 2, 'second retry must wait 1000 ms');
  t.mock.timers.tick(1);
  const response = await pending;
  // Assert
  assert.deepEqual(starts, [100000, 100500, 101500]);
  assert.deepEqual(await response.json(), { ok: true });
});

test('FetchRetry_QuotaExhausted_ReportsRetryAfterAtBoundary', async t => {
  // Arrange
  t.mock.method(globalThis, 'fetch', async () => jsonRes({}, 429, { 'retry-after': '60' }));
  // Act
  const pending = fetchWithRetry('https://provider.example', {}, 0);
  // Assert
  await assert.rejects(pending, { message: 'Rate limit reached (HTTP 429) — quota exhausted, retry after 60s' });
});

test('FetchRetry_AbortDuringBackoff_DoesNotSendAnotherRequest', async t => {
  // Arrange
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const controller = new AbortController();
  const reason = new DOMException('Cancelled', 'AbortError');
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('Offline'); });
  const pending = fetchWithRetry('https://provider.example', {}, 2, null, controller.signal);
  const rejection = assert.rejects(pending, error => error === reason && error.nonRetryable === true);
  await settle();
  // Act
  controller.abort(reason);
  t.mock.timers.tick(500);
  await rejection;
  // Assert
  assert.equal(fetch.mock.callCount(), 1);
});

for (const status of [300, 301, 302, 307, 308, 399]) {
  test(`FetchRetry_Redirect${status}_RefusesWithoutRetryOrCredentialForwarding`, async t => {
    // Arrange
    const fetch = t.mock.method(globalThis, 'fetch', async () => jsonRes({}, status, { location: 'https://other.example' }));
    // Act
    const pending = fetchWithRetry('https://provider.example', { headers: { Authorization: 'Bearer fixture-key' } });
    // Assert
    await assert.rejects(pending, { message: 'Redirect to https://other.example refused: refusing to follow redirects (credential guard)', nonRetryable: true });
    assert.equal(fetch.mock.callCount(), 1);
    assert.equal(fetch.mock.calls[0].arguments[1].redirect, 'manual');
  });
}

for (const [scenario, thrown, message] of [
  ['Null', null, 'null'], ['Undefined', undefined, 'Unknown fetch error'],
  ['Number', 42, '42'], ['EmptyObject', {}, '{}'], ['BlankError', new Error(''), 'Unknown error'],
]) {
  test(`FetchRetry_${scenario}Rejection_ProducesActionableError`, async t => {
    // Arrange
    t.mock.method(globalThis, 'fetch', async () => { throw thrown; });
    // Act
    const pending = fetchWithRetry('https://provider.example', {}, 0);
    // Assert
    await assert.rejects(pending, { name: 'Error', message });
  });
}

for (const connector of ['openai', 'raw']) {
  test(`ProviderClient_${connector}Abort_PreservesOriginalException`, async t => {
    // Arrange
    const controller = new AbortController();
    const reason = new DOMException('Stop audit', 'AbortError');
    const provider = makeProvider({ connector, bodyTemplate: '{"prompt":"{{userPrompt}}"}' });
    const fetch = t.mock.method(globalThis, 'fetch', async () => { controller.abort(reason); throw reason; });
    // Act
    const pending = queryModel(provider.id, 'model', 'system', 'payload', [provider], controller.signal);
    // Assert
    await assert.rejects(pending, error => error === reason);
    assert.equal(fetch.mock.callCount(), 1);
  });
}
