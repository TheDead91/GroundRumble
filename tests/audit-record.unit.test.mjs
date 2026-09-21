// Coverage of src/utils/audit-record.js — the single canonical copy of the
// audit-history hygiene helpers (task 20260826-091530-mod007 R1), consumed by
// src/App.jsx, src/context/HistoryContext.jsx and src/hooks/useAuditRun.js.
//
// Style mirrors tests/redact.unit.test.mjs. Every export is exercised — including
// both arms of every Array.isArray ternary — so c8 gates stay green (100%
// lines / 100% functions / >=70% branches under npm run test:coverage:ci).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { redactSensitiveText } from '../src/utils/redact.js';
import { redactAuditResult, redactAuditRecord, summarizeAuditRecord } from '../src/utils/audit-record.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MODULE_PATH = join(root, 'src/utils/audit-record.js');

// Fixture whose four verbose fields all trigger REAL scrubbing.
const SECRET_DETAIL = {
  uid: 'result-1',
  systemPrompt: 'Authorization: Bearer abcDEF123._-',
  userPrompt: 'failed with sk-abcdef123456',
  response: 'apiKey: someValue',
  reasoning: 'z'.repeat(40),
  status: 'VULNERABLE'
};

test('the module keeps the three hygiene exports and permits only the T11 builder beside them', () => {
  const text = readFileSync(MODULE_PATH, 'utf8');
  const exports = text.match(/^export[^\n]*/gm) ?? [];
  const legacyExports = [
    'export function redactAuditResult(result) {',
    'export function redactAuditRecord(record) {',
    'export function summarizeAuditRecord(record) {'
  ];
  assert.deepEqual(
    exports.filter((line) => !line.startsWith('export function buildAuditRecord(')),
    legacyExports,
    'the three hygiene exports remain byte-identical'
  );
  assert.ok(
    exports.length === 3 || (exports.length === 4 && exports.some((line) => line.startsWith('export function buildAuditRecord('))),
    `only the T11 builder may join the three historical exports (got ${exports.join(', ')})`
  );
  assert.doesNotMatch(text, /^export default/m, 'no default export');
});

test('redactAuditResult scrubs all four known fields and preserves extra keys', () => {
  const out = redactAuditResult(SECRET_DETAIL);
  assert.equal(out.systemPrompt, 'Authorization: [REDACTED_AUTH]');
  assert.match(out.userPrompt, /\[REDACTED_KEY\]/);
  assert.match(out.response, /\[REDACTED\]/);
  assert.equal(out.reasoning, '[REDACTED_HIGH_ENTROPY]');
  assert.equal(out.status, 'VULNERABLE', 'extra keys ride along untouched');
  assert.equal(out.uid, 'result-1', 'extra keys ride along untouched');
  assert.deepEqual(Object.keys(out).sort(), Object.keys(SECRET_DETAIL).sort(), 'the key set is unchanged');
});

test('redactAuditResult delegates every field to redactSensitiveText verbatim', () => {
  const out = redactAuditResult(SECRET_DETAIL);
  for (const field of ['systemPrompt', 'userPrompt', 'response', 'reasoning']) {
    assert.equal(out[field], redactSensitiveText(SECRET_DETAIL[field]));
  }
});

test('redactAuditResult leaves already-clean string values byte-identical', () => {
  const clean = { systemPrompt: 'hello world', userPrompt: '', response: 'ok', reasoning: 'fine' };
  assert.deepEqual(redactAuditResult(clean), clean);
});

test('redactAuditRecord maps an array details field through redactAuditResult', () => {
  const record = { id: 'rec-1', target: 'sandbox::demo-vulnerable', details: [{ ...SECRET_DETAIL, verdict: 'FAIL' }] };
  const out = redactAuditRecord(record);
  assert.equal(out.id, 'rec-1', 'record-level keys are preserved');
  assert.equal(out.target, 'sandbox::demo-vulnerable', 'record-level keys are preserved');
  assert.equal(out.details.length, 1);
  assert.equal(out.details[0].verdict, 'FAIL', 'non-verbose detail keys survive');
  assert.equal(out.details[0].systemPrompt, 'Authorization: [REDACTED_AUTH]', 'a nested field got redacted');
  assert.notEqual(out.details, record.details, 'details is a mapped copy, not aliased');
  assert.deepEqual(out.details[0], redactAuditResult(record.details[0]));
});

test('redactAuditRecord collapses every non-array details value to []', () => {
  for (const badDetails of [undefined, null, 'garbage', { 0: 'x' }]) {
    assert.deepEqual(
      redactAuditRecord({ id: 'rec-2', details: badDetails, extra: 'kept' }),
      { id: 'rec-2', details: [], extra: 'kept' },
      `details: ${String(badDetails)} must yield []`
    );
  }
});

test('summarizeAuditRecord strips the four verbose fields but keeps other detail and record keys', () => {
  const record = { id: 'rec-3', model: 'Demo Vulnerable', details: [{ ...SECRET_DETAIL, verdict: 'FAIL' }] };
  const out = summarizeAuditRecord(record);
  assert.equal(out.id, 'rec-3', 'record-level keys are preserved');
  assert.equal(out.model, 'Demo Vulnerable', 'record-level keys are preserved');
  assert.equal(out.details.length, 1);
  for (const field of ['systemPrompt', 'userPrompt', 'response', 'reasoning']) {
    assert.ok(!(field in out.details[0]), `${field} must be stripped`);
  }
  assert.deepEqual(out.details[0], { uid: 'result-1', status: 'VULNERABLE', verdict: 'FAIL' });
});

test('summarizeAuditRecord reduces a fully-verbose detail to {} (rest-pattern keeps only the remainder)', () => {
  const stripped = summarizeAuditRecord({
    id: 'rec-4',
    details: [{ systemPrompt: 'a', userPrompt: 'b', response: 'c', reasoning: 'd' }]
  }).details[0];
  assert.deepEqual(stripped, {});
});

test('summarizeAuditRecord collapses every non-array details value to []', () => {
  for (const badDetails of [undefined, null, 42]) {
    assert.deepEqual(
      summarizeAuditRecord({ id: 'rec-5', details: badDetails, tag: 'kept' }),
      { id: 'rec-5', details: [], tag: 'kept' },
      `details: ${String(badDetails)} must yield []`
    );
  }
});
