// Coverage of src/utils/api/judge-client.js — the statements the api-core
// suite never reaches: repairTruncatedJson's final JSON.parse catch (167-168),
// queryOpenAIJudge's disable-thinking retry failure paths (257-259: a 413
// wraps as "Payload too large for the judge endpoint: …", other errors rethrow
// unchanged), and queryRawJudge's default (no bodyTemplate) JSON body
// construction incl. jsonMode response_format and header merge (281-296).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseJSONObject, repairTruncatedJson, queryOpenAIJudge, queryRawJudge
} from '../src/utils/api/judge-client.js';
import { jsonRes, stubFetch } from './helpers/httpx.mjs';

let savedFetch;
before(() => { savedFetch = globalThis.fetch; });
after(() => { globalThis.fetch = savedFetch; });

const judge = { provider: 'mock', model: 'm', endpoint: 'https://judge.example/v1/chat/completions', apiKey: 'k' };

// ── repairTruncatedJson: the final JSON.parse catch ───────────────────────

test('repairTruncatedJson returns null when the repaired string still fails to parse', () => {
  // '{a:b}' is bracket-balanced and string-clean, so the repairer appends no
  // closers and hands '{a:b}' to JSON.parse — an unquoted key is beyond
  // simple truncation, so the catch maps it to null.
  assert.equal(repairTruncatedJson('{a:b}'), null);
  assert.equal(parseJSONObject('{a:b}'), null, 'the repair catch feeds parseJSONObject\'s null contract');
  // Contrast: structurally similar inputs the repairer CAN fix still parse.
  assert.deepEqual(repairTruncatedJson('{"a":1}'), { a: 1 });
  assert.deepEqual(repairTruncatedJson('{"a":[1,2'), { a: [1, 2] });
});

// ── queryOpenAIJudge: the disable-thinking retry's failure paths ──────────

test('a 413 from the disable-thinking retry wraps as "Payload too large for the judge endpoint: …"', async () => {
  const seen = [];
  let call = 0;
  stubFetch([[_pred => true, (req) => {
    seen.push(req);
    call++;
    if (call === 1) return jsonRes({ choices: [{ message: { content: '' } }] });
    return jsonRes({}, 413);
  }]]);
  await assert.rejects(
    queryOpenAIJudge(judge, 'S', 'U'),
    { message: 'Payload too large for the judge endpoint: HTTP 413: {}' }
  );
  assert.equal(seen.length, 2, 'exactly the initial call + one disable-thinking retry');
  // Initial round-trip: json_object response_format, thinking untouched,
  // prompts unshrunk, documented default arguments.
  assert.equal(seen[0].body.model, 'm');
  assert.deepEqual(seen[0].body.messages, [
    { role: 'system', content: 'S' }, { role: 'user', content: 'U' }
  ]);
  assert.equal(seen[0].body.max_tokens, 4096);
  assert.equal(seen[0].body.temperature, 0);
  assert.deepEqual(seen[0].body.response_format, { type: 'json_object' });
  assert.equal(seen[0].body.reasoning, undefined);
  // The retry ran with thinking disabled and no response_format.
  assert.deepEqual(seen[1].body.reasoning, { exclude: true });
  assert.equal(seen[1].body.response_format, undefined);
  assert.equal(seen[1].body.max_tokens, 4096);
  assert.equal(seen[1].headers.Authorization, 'Bearer k');
});

test('a non-413 failure of the disable-thinking retry rethrows unchanged', async () => {
  const seen = [];
  let call = 0;
  stubFetch([[_pred => true, (req) => {
    seen.push(req);
    call++;
    if (call === 1) return jsonRes({ choices: [{ message: { content: '' } }] });
    return jsonRes({}, 400);
  }]]);
  // The 400 becomes "Judge HTTP 400: {}" in requestContent's catch; the retry
  // guard must rethrow that verbatim — no second wrapping, no payload-shrink.
  await assert.rejects(
    queryOpenAIJudge(judge, 'S', 'U'),
    { message: 'Judge HTTP 400: {}' }
  );
  assert.equal(seen.length, 2, 'exactly the initial call + one disable-thinking retry');
  assert.deepEqual(seen[1].body.reasoning, { exclude: true });
});

// ── queryRawJudge: the default (no bodyTemplate) JSON body ────────────────

test('queryRawJudge builds the default JSON body with jsonMode response_format and merged headers', async () => {
  const seen = [];
  stubFetch([[_pred => true, (req) => {
    seen.push(req);
    return jsonRes({ choices: [{ message: { content: 'VERDICT' } }] });
  }]]);
  const rawJudge = {
    model: 'raw-model', endpoint: 'https://raw.example/judge',
    apiKey: 'secret-key', headers: { 'X-Custom': 'c1' }
  };
  const out = await queryRawJudge(rawJudge, 'SYS', 'USR', undefined, { maxTokens: 512, temperature: 0.25, jsonMode: true });
  assert.equal(out, 'VERDICT', 'the default responsePath reads choices.0.message.content');
  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, 'https://raw.example/judge');
  assert.equal(seen[0].method, 'POST');
  assert.deepEqual(seen[0].body, {
    model: 'raw-model',
    messages: [
      { role: 'system', content: 'SYS' }, { role: 'user', content: 'USR' }
    ],
    max_tokens: 512,
    temperature: 0.25,
    response_format: { type: 'json_object' }
  });
  assert.equal(seen[0].headers['Content-Type'], 'application/json');
  assert.equal(seen[0].headers['X-Custom'], 'c1', 'judge.headers must merge into the request headers');
  assert.equal(seen[0].headers.Authorization, 'Bearer secret-key', 'apiKey supplies Authorization when not overridden');

  // jsonMode:false drops response_format; an explicit Authorization in
  // judge.headers wins over the apiKey default; a missing model falls back
  // to ''.
  const rawJudge2 = {
    endpoint: 'https://raw.example/judge',
    apiKey: 'secret-key', headers: { Authorization: 'Bearer explicit' }
  };
  await queryRawJudge(rawJudge2, 'SYS2', 'USR2', undefined, { jsonMode: false });
  assert.equal(seen[1].body.response_format, undefined);
  assert.equal(seen[1].body.model, '');
  assert.equal(seen[1].body.max_tokens, 4096);
  assert.equal(seen[1].body.temperature, 0);
  assert.deepEqual(seen[1].body.messages, [
    { role: 'system', content: 'SYS2' }, { role: 'user', content: 'USR2' }
  ]);
  assert.equal(seen[1].headers.Authorization, 'Bearer explicit', 'an explicit judge.headers Authorization wins');
});
