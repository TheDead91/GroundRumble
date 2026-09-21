import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseJSONObject } from '../src/utils/api.js';
import { parseTestPayloads } from '../src/utils/ai-generator.js';

test('parseJSONObject extracts an object embedded in prose', () => {
  const out = parseJSONObject('blah {"status":"high","reason":"solid"} blah');
  assert.ok(out);
  assert.equal(out.status, 'high');
});

test('parseJSONObject recovers a fenced object', () => {
  const out = parseJSONObject('Here:\n```json\n{"a":1,"b":2}\n```');
  assert.ok(out);
  assert.equal(out.a, 1);
});

test('judge parsing pipeline tolerates fences and prose', async () => {
  // The judge parser (ai-judge.js) uses the same shared block extraction as
  // parseJSONObject — verify that behavior here (fences + embedded JSON).
  const fenced = parseJSONObject('```json\n{"status":"SECURE","reasoning":"ok"}\n```');
  assert.equal(fenced.status, 'SECURE');
  const embedded = parseJSONObject('The verdict: {"status":"VULNERABLE","reasoning":"leak"} end');
  assert.equal(embedded.status, 'VULNERABLE');
});

test('parseTestPayloads and parseJSONObject share block extraction for nested JSON', () => {
  const tests = parseTestPayloads('```\n{"tests":[{"name":"X","userPrompt":"y"}]}\n```');
  assert.equal(tests.length, 1);
  assert.equal(tests[0].name, 'X');
  const obj = parseJSONObject('{"tests":[{"name":"X"}]} trailing');
  assert.ok(Array.isArray(obj.tests));
});
