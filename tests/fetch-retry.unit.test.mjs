// Behavioral coverage for the fetchWithRetry error-normalization ladder and
// the redirectRefusal helper in src/utils/api/fetch-retry.js. Every test pins
// the exact error message produced for its input class. Single attempt
// (retries=0) so no backoff timers are involved; the retry/backoff paths are
// covered by tests/api-core.integration.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stubFetch } from './helpers/httpx.mjs';

const { fetchWithRetry, redirectRefusal } = await import('../src/utils/api/fetch-retry.js');

const URL = 'https://unit.test/endpoint';

const rejectsWithMessage = async (handler, expected) => {
  stubFetch([[_unused => true, handler]]);
  await assert.rejects(
    fetchWithRetry(URL, {}, 0),
    (err) => err instanceof Error && !(err instanceof DOMException) && err.message === expected
  );
};

test('a thrown DOMException (non-abort) is re-wrapped as an Error carrying its message', async () => {
  await rejectsWithMessage(
    () => { throw new DOMException('net gone', 'DataCloneError'); },
    'net gone'
  );
});

test('an Error with an undefined/empty message surfaces as "Unknown error"', async () => {
  await rejectsWithMessage(() => { throw new Error(); }, 'Unknown error');
  await rejectsWithMessage(() => { throw new Error('undefined'); }, 'Unknown error');
});

test('a thrown string surfaces as an Error whose message is that string', async () => {
  await rejectsWithMessage(() => { throw 'boom-string'; }, 'boom-string');
});

test('plain-object errors resolve their message through the candidate ladder in priority order', async () => {
  await rejectsWithMessage(() => { throw { message: 'primary', statusText: 'secondary' }; }, 'primary');
  await rejectsWithMessage(() => { throw { statusText: 'Service Unavailable' }; }, 'Service Unavailable');
  await rejectsWithMessage(() => { throw { status: 503 }; }, '503');
  await rejectsWithMessage(() => { throw { code: 'ECONNREFUSED' }; }, 'ECONNREFUSED');
  await rejectsWithMessage(() => { throw { name: 'NetworkError' }; }, 'NetworkError');
  await rejectsWithMessage(() => { throw { cause: { message: 'socket hung up' } }; }, 'socket hung up');
  await rejectsWithMessage(() => { throw { cause: 'plain cause' }; }, 'plain cause');
});

test('an object with no message candidates is serialized via JSON.stringify (sliced)', async () => {
  await rejectsWithMessage(() => { throw {}; }, '{}');
  await rejectsWithMessage(() => { throw { message: '' }; }, '{"message":""}');
  const big = { blob: 'x'.repeat(800) };
  await rejectsWithMessage(() => { throw big; }, JSON.stringify(big).slice(0, 500));
});

test('non-string non-object throwables fall back to String(err)', async () => {
  await rejectsWithMessage(() => { throw 42; }, '42');
  await rejectsWithMessage(() => { throw true; }, 'true');
});

test('a thrown undefined is normalized to "Unknown fetch error", never the literal "undefined"', async () => {
  await rejectsWithMessage(() => { throw undefined; }, 'Unknown fetch error');
});

test('redirectRefusal throws "Redirect to <location> refused" for 3xx and passes non-3xx through', async () => {
  const { jsonRes } = await import('./helpers/httpx.mjs');
  assert.throws(
    () => redirectRefusal(jsonRes({}, 302, { location: 'https://evil.example/steal' })),
    { message: 'Redirect to https://evil.example/steal refused' }
  );
  assert.throws(
    () => redirectRefusal(jsonRes({}, 307, { location: '/relative' })),
    { message: 'Redirect to /relative refused' }
  );
  const ok = jsonRes({ data: 1 }, 200);
  assert.equal(redirectRefusal(ok), ok, 'non-3xx responses pass through untouched');
  const notFound = jsonRes({}, 404);
  assert.equal(redirectRefusal(notFound), notFound, '4xx/5xx are not redirect refusals');
});
