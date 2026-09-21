// Durable regression/security coverage for raw-request Content-Type selection
// and case-insensitive Authorization handling across the
// provider/Judge/raw/model/probe request-construction paths.
//
// Invariants:
//   - a JSON-shaped body ships `application/json`, a genuine non-JSON body ships
//     `text/plain; charset=utf-8`, an explicit operator Content-Type is preserved,
//     and the template-free fallback stays JSON;
//   - `Authorization`, `authorization`, `AUTHORIZATION` etc. are the same header:
//     a custom credential is preserved without a second auto-injected Bearer, an
//     absent custom credential still injects Bearer when an apiKey exists, and
//     keyless paths are unchanged.
//
// No external network traffic: global fetch is replaced with an in-process stub.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { queryRawJudge, queryOpenAIJudge, queryAI } from '../src/utils/api/judge-client.js';
import { queryRawProvider, queryOpenAIProvider, queryModel, testProvider } from '../src/utils/api/provider-client.js';

const SENTINEL_KEY = 'sk-CONTENT-TYPE-AUTH-SENTINEL';

const calls = [];
let savedFetch;

before(() => { savedFetch = globalThis.fetch; });
after(() => { globalThis.fetch = savedFetch; });

const installCapture = () => {
  calls.length = 0;
  globalThis.fetch = async (input, init = {}) => {
    calls.push({
      url: String(input),
      method: (init.method || 'GET').toUpperCase(),
      headers: init.headers || {},
      body: init.body,
    });
    return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }], result: 'ok', data: { out: 'ok' } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
};

const header = (call, name) => {
  for (const key of Object.keys(call.headers)) {
    if (key.toLowerCase() === name.toLowerCase()) return call.headers[key];
  }
  return undefined;
};

const authHeaders = (call) =>
  Object.keys(call.headers).filter((k) => k.toLowerCase() === 'authorization');

// ── raw Judge Content-Type ──────────────────────────────────────────────────

test('raw Judge: JSON-shaped template ships application/json', async () => {
  installCapture();
  await queryRawJudge(
    { connector: 'raw', endpoint: 'https://judge.example/evaluate', apiKey: '', headers: {} },
    'sys', 'usr', undefined,
    { bodyTemplate: '{"user":"{{userPrompt}}"}', responsePath: 'result' },
  );
  assert.equal(calls.length, 1);
  assert.equal(header(calls[0], 'content-type'), 'application/json');
});

test('raw Judge: non-JSON template ships text/plain', async () => {
  installCapture();
  await queryRawJudge(
    { connector: 'raw', endpoint: 'https://judge.example/evaluate', apiKey: '', headers: {} },
    'sys', 'usr', undefined,
    { bodyTemplate: 'PROMPT={{userPrompt}}', responsePath: 'result' },
  );
  assert.equal(calls.length, 1);
  assert.equal(header(calls[0], 'content-type'), 'text/plain; charset=utf-8');
});

test('raw Judge: explicit operator Content-Type is preserved', async () => {
  installCapture();
  await queryRawJudge(
    { connector: 'raw', endpoint: 'https://judge.example/evaluate', apiKey: '', headers: { 'Content-Type': 'application/x-ndjson' } },
    'sys', 'usr', undefined,
    { bodyTemplate: 'PROMPT={{userPrompt}}', responsePath: 'result' },
  );
  assert.equal(calls.length, 1);
  assert.equal(header(calls[0], 'content-type'), 'application/x-ndjson');
});

test('raw Judge: template-free fallback stays JSON', async () => {
  installCapture();
  await queryRawJudge(
    { connector: 'raw', endpoint: 'https://judge.example/evaluate', apiKey: '', headers: {} },
    'sys', 'usr', undefined,
    { responsePath: 'result' },
  );
  assert.equal(calls.length, 1);
  assert.equal(header(calls[0], 'content-type'), 'application/json');
  assert.doesNotThrow(() => JSON.parse(calls[0].body));
});

// ── raw Judge Authorization ─────────────────────────────────────────────────

test('raw Judge: lowercase custom authorization is preserved with no second credential', async () => {
  installCapture();
  await queryRawJudge(
    { connector: 'raw', endpoint: 'https://judge.example/evaluate', apiKey: SENTINEL_KEY, headers: { authorization: 'Bearer custom-key' } },
    'sys', 'usr', undefined,
    { bodyTemplate: '{"user":"{{userPrompt}}"}', responsePath: 'result' },
  );
  assert.equal(calls.length, 1);
  assert.deepEqual(authHeaders(calls[0]), ['authorization'], 'only the custom header name survives');
  assert.equal(header(calls[0], 'authorization'), 'Bearer custom-key');
});

test('raw Judge: absent custom auth + apiKey injects Bearer', async () => {
  installCapture();
  await queryRawJudge(
    { connector: 'raw', endpoint: 'https://judge.example/evaluate', apiKey: SENTINEL_KEY, headers: {} },
    'sys', 'usr', undefined,
    { bodyTemplate: '{"user":"{{userPrompt}}"}', responsePath: 'result' },
  );
  assert.equal(header(calls[0], 'authorization'), `Bearer ${SENTINEL_KEY}`);
  assert.deepEqual(authHeaders(calls[0]), ['Authorization']);
});

test('raw Judge: keyless path has no Authorization header', async () => {
  installCapture();
  await queryRawJudge(
    { connector: 'raw', endpoint: 'https://judge.example/evaluate', apiKey: '', headers: {} },
    'sys', 'usr', undefined,
    { bodyTemplate: '{"user":"{{userPrompt}}"}', responsePath: 'result' },
  );
  assert.equal(authHeaders(calls[0]).length, 0);
});

// ── OpenAI Judge: case-insensitive Authorization ────────────────────────────

test('OpenAI Judge: uppercase custom Authorization is preserved without duplication', async () => {
  installCapture();
  await queryOpenAIJudge(
    { connector: 'openai', endpoint: 'https://judge.example/v1/chat/completions', apiKey: SENTINEL_KEY, headers: { Authorization: 'Bearer custom-key' } },
    'sys', 'usr', undefined,
  );
  assert.equal(calls.length, 1);
  assert.deepEqual(authHeaders(calls[0]), ['Authorization'], 'no duplicate credential');
  assert.equal(header(calls[0], 'authorization'), 'Bearer custom-key');
});

test('OpenAI Judge: a differently-cased custom authorization header is preserved with no second credential', async () => {
  installCapture();
  await queryOpenAIJudge(
    { connector: 'openai', endpoint: 'https://judge.example/v1/chat/completions', apiKey: SENTINEL_KEY, headers: { AUTHORIZATION: 'Bearer custom-key' } },
    'sys', 'usr', undefined,
  );
  assert.equal(calls.length, 1);
  assert.deepEqual(authHeaders(calls[0]), ['AUTHORIZATION'], 'single credential header');
  assert.equal(header(calls[0], 'authorization'), 'Bearer custom-key');
});

// ── raw provider path ───────────────────────────────────────────────────────

test('raw provider: a non-JSON template still fails closed (JSON-only transport preserved)', async () => {
  installCapture();
  const provider = {
    id: 'cp_raw', connector: 'raw', endpoint: 'https://provider.example/v1',
    apiKey: SENTINEL_KEY, headers: '{"authorization":"Bearer custom-key"}', bodyTemplate: 'PROMPT={{userPrompt}}',
    responsePath: 'data.out', method: 'POST',
  };
  await assert.rejects(
    () => queryModel(provider.id, 'm', 's', 'u', [provider], undefined, { bodyTemplate: 'PROMPT={{userPrompt}}', responsePath: 'data.out' }),
    /Body template produced invalid JSON/,
  );
  assert.equal(calls.length, 0, 'no non-JSON request ever reaches the raw provider transport');
});

test('raw provider: JSON template ships application/json and injects Bearer when absent', async () => {
  installCapture();
  const provider = {
    id: 'cp_raw2', connector: 'raw', endpoint: 'https://provider.example/v1',
    apiKey: SENTINEL_KEY, headers: '{}', bodyTemplate: '{"u":"{{userPrompt}}"}',
    responsePath: 'data.out', method: 'POST',
  };
  await queryRawProvider(provider, 'm', 's', 'u', undefined, { bodyTemplate: '{"u":"{{userPrompt}}"}', responsePath: 'data.out' });
  assert.equal(calls.length, 1);
  assert.equal(header(calls[0], 'content-type'), 'application/json');
  assert.equal(header(calls[0], 'authorization'), `Bearer ${SENTINEL_KEY}`);
});

// ── OpenAI provider with a body template ────────────────────────────────────

test('OpenAI provider: a non-JSON body template ships text/plain', async () => {
  installCapture();
  const provider = {
    id: 'cp_openai', connector: 'openai', endpoint: 'https://provider.example/v1',
    apiKey: '', headers: '{}', bodyTemplate: '', method: 'POST',
  };
  await queryOpenAIProvider(provider, 'm', 's', 'u', undefined, { bodyTemplate: 'PROMPT={{userPrompt}}' });
  assert.equal(calls.length, 1);
  assert.equal(header(calls[0], 'content-type'), 'text/plain; charset=utf-8');
});

// ── connection probe raw path ───────────────────────────────────────────────

test('testProvider raw: non-JSON template ships text/plain', async () => {
  installCapture();
  const provider = {
    id: 'cp_probe', connector: 'raw', endpoint: 'https://provider.example/v1',
    apiKey: '', headers: '{}', bodyTemplate: 'PROMPT={{userPrompt}}', method: 'POST',
  };
  await testProvider(provider);
  assert.equal(header(calls[0], 'content-type'), 'text/plain; charset=utf-8');
});

// ── dispatch sanity (queryAI raw stays case-insensitive) ────────────────────

test('queryAI raw dispatch keeps a single credential and correct content type', async () => {
  installCapture();
  const judge = {
    connector: 'raw', endpoint: 'https://judge.example/evaluate', apiKey: SENTINEL_KEY,
    headers: { authorization: 'Bearer custom-key' }, bodyTemplate: 'PROMPT={{userPrompt}}', responsePath: 'result',
  };
  await queryAI(judge, 'sys', 'usr', 128, undefined);
  assert.equal(calls.length, 1);
  assert.equal(header(calls[0], 'content-type'), 'text/plain; charset=utf-8');
  assert.deepEqual(authHeaders(calls[0]), ['authorization']);
  assert.equal(header(calls[0], 'authorization'), 'Bearer custom-key');
});
