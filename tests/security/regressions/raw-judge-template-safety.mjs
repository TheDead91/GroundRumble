// Raw Judge template-safety regression.
//
// Externally influenced values substituted into a raw Judge JSON body cannot
// alter intended request structure through quotes, escapes, delimiters,
// newlines or JSON syntax. JSON-intended templates are serialized with the
// shared context-safe `applyBodyTemplate` and validated before transport;
// genuine non-JSON/plain-text templates keep raw textual substitution; and the
// endpoint policy still runs first.
//
// The global fetch is replaced with a deterministic in-process stub. NOTHING in
// this file performs real network I/O. Every host is a reserved example name or
// loopback literal and every secret is a literal sentinel. No production file is
// modified.
//
// Run: node --test tests/security/regressions/raw-judge-template-safety.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { queryRawJudge } from '../../../src/utils/api/judge-client.js';
import { applyBodyTemplate, isJsonBodyTemplate } from '../../../src/utils/api/provider-request-config.js';

const SENTINEL_KEY = 'sk-JUDGE-SERIALIZATION-SENTINEL';
const MARKER = 'AI_CONTROL_SENTINEL_B';

const calls = [];
let savedFetch = null;

const okResponse = (body = { result: 'ok' }) => new Response(JSON.stringify(body), {
  status: 200,
  headers: { 'content-type': 'application/json' }
});

const installStub = () => {
  calls.length = 0;
  if (savedFetch == null) savedFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    calls.push({ url: String(input), method: init.method || 'GET', headers: init.headers || {}, body: init.body });
    return okResponse();
  };
};

const restoreStub = () => {
  if (savedFetch != null) { globalThis.fetch = savedFetch; savedFetch = null; }
};

const judge = {
  connector: 'raw',
  endpoint: 'https://judge.example/evaluate',
  model: 'local-test-model',
  apiKey: '',
  headers: {},
  rpm: 0,
};

test('hostile evidence stays inside its JSON string field (no sibling injection)', async () => {
  const template = '{"system":"{{systemPrompt}}","user":"{{userPrompt}}","verdict":"PENDING","marker":"fixed"}';
  const evidence = `ordinary response", ${'"'}injected${'"'}: ${'"'}${MARKER}${'"'}, "padding": "end`;

  installStub();
  try {
    const result = await queryRawJudge(judge, 'system', evidence, undefined, {
      bodyTemplate: template,
      responsePath: 'result'
    });
    const parsed = JSON.parse(calls[0].body);

    assert.equal(result, 'ok');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, judge.endpoint);
    assert.equal(parsed.user, evidence, 'the intended field retains the exact input string');
    assert.equal(parsed.system, 'system');
    assert.equal(parsed.verdict, 'PENDING', 'the request verdict field is untouched');
    assert.equal(parsed.marker, 'fixed');
    assert.ok(!('injected' in parsed), 'no sibling injected field');
    assert.ok(!('padding' in parsed), 'no sibling padding field');
  } finally {
    restoreStub();
  }
});

test('quotes, escapes and newlines round-trip as exact JSON string data', async () => {
  const template = '{"user":"{{userPrompt}}"}';
  const evidence = 'say "hi" \\ then\nnewline\rreturn\ttab {brace} [bracket] 中文 🎉';

  installStub();
  try {
    await queryRawJudge(judge, 'sys', evidence, undefined, { bodyTemplate: template, responsePath: 'result' });
    const parsed = JSON.parse(calls[0].body);
    assert.equal(parsed.user, evidence);
  } finally {
    restoreStub();
  }
});

test('the shared serializer is context-safe and flags JSON templates', () => {
  const template = '{"user":"{{userPrompt}}","marker":"fixed"}';
  const evidence = `ordinary", "injected": "${MARKER}", "padding": "`;

  const body = applyBodyTemplate(template, {
    systemPrompt: 'system',
    userPrompt: evidence,
    model: judge.model,
    maxTokens: 4096,
    temperature: 0,
    jsonMode: true
  });
  const parsed = JSON.parse(body);

  assert.equal(parsed.user, evidence, 'value preserved exactly inside the string field');
  assert.equal(parsed.marker, 'fixed');
  assert.equal('injected' in parsed, false, 'no sibling injected field');
  assert.equal('padding' in parsed, false);
  assert.equal(isJsonBodyTemplate(template), true, 'the quoted template is classified JSON');

  assert.equal(isJsonBodyTemplate('PROMPT={{userPrompt}}'), false, 'a plain-text template is not JSON-classified');
});

test('a malformed JSON template fails closed before transport', async () => {
  installStub();
  try {
    await assert.rejects(
      () => queryRawJudge(judge, 'sys', 'usr', undefined, {
        bodyTemplate: '{"user":"{{userPrompt}}",}',
        responsePath: 'result'
      }),
      /Body template produced invalid JSON/,
    );
    assert.equal(calls.length, 0, 'no fetch call was issued for malformed JSON');
  } finally {
    restoreStub();
  }
});

test('non-JSON plain-text templates keep raw substitution', async () => {
  const userPrompt = 'hello "world" \\ backslash\nnewline\ttab';
  installStub();
  try {
    await queryRawJudge(judge, 'SYS', userPrompt, undefined, {
      bodyTemplate: 'PROMPT={{userPrompt}}',
      responsePath: 'result'
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].body, `PROMPT=${userPrompt}`, 'raw textual substitution is byte-preserving');
  } finally {
    restoreStub();
  }
});

test('unquoted string placeholders in a JSON body cannot inject structure', async () => {
  const template = '{"system": {{systemPrompt}}, "user": {{userPrompt}}, "verdict":"PENDING"}';
  const evidence = `ordinary", ${'"'}injected${'"'}: ${'"'}${MARKER}${'"'}, "padding": "end`;

  installStub();
  try {
    const result = await queryRawJudge(judge, 'system', evidence, undefined, {
      bodyTemplate: template,
      responsePath: 'result'
    });
    const parsed = JSON.parse(calls[0].body);

    assert.equal(result, 'ok');
    assert.equal(calls.length, 1);
    assert.equal(parsed.user, evidence, 'the unquoted hole still receives the exact string value');
    assert.equal(parsed.system, 'system');
    assert.equal(parsed.verdict, 'PENDING');
    assert.ok(!('injected' in parsed), 'no sibling injected field');
    assert.ok(!('padding' in parsed), 'no sibling padding field');
    assert.equal(isJsonBodyTemplate(template), true, 'a JSON body with unquoted placeholders is classified JSON');
  } finally {
    restoreStub();
  }
});

test('endpoint policy runs first and forbidden targets get zero traffic', async () => {
  installStub();
  try {
    await assert.rejects(
      () => queryRawJudge({ ...judge, endpoint: 'http://127.0.0.1:11434/v1', apiKey: SENTINEL_KEY }, 'sys', 'usr', undefined, {
        bodyTemplate: '{"user":"{{userPrompt}}"}',
        responsePath: 'result'
      }),
      /Private or loopback/,
    );
    assert.equal(calls.length, 0, 'no credential-bearing request reached the forbidden transport');
  } finally {
    restoreStub();
  }
});