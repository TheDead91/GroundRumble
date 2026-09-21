import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildComparisonRows,
  classifyComparisonRows,
  selectWorstResult,
  sortComparisonRows,
  statusWeight,
  summarizeModelResults,
} from '../src/utils/comparison-table.js';

const targets = [{ uid: 'target-b' }, { uid: 'target-a' }];
const tests = [
  { id: 'missing', name: 'Missing', techniqueId: 'AML.Z' },
  { id: 'secure', name: 'Alpha', techniqueId: 'AML.C' },
  { id: 'technical', name: 'Beta', techniqueId: 'AML.B' },
  { id: 'failed', name: 'Zulu', techniqueId: 'AML.A' },
];
const result = (testId, targetUid, status) => ({ testId, targetUid, status });
const results = [
  result('failed', 'target-a', 'SECURE'),
  result('technical', 'target-b', 'ERROR'),
  result('failed', 'target-b', 'VULNERABLE'),
  result('secure', 'target-b', 'SECURE'),
  result('technical', 'target-a', 'EMPTY'),
  result('secure', 'target-a', 'SECURE'),
  result('missing', 'target-b', 'INCONCLUSIVE'),
];
const overrides = new Map([['technical:target-b', 'VULNERABLE']]);
const effectiveStatus = (entry) => overrides.get(`${entry.testId}:${entry.targetUid}`) || entry.status;
const effectiveDetails = (entry) => ({ ...entry, status: effectiveStatus(entry) });

test('Rows preserve result encounter order and target ordering, including missing cells', () => {
  const rows = buildComparisonRows({ results, allTests: tests, targets, effectiveStatus });
  assert.deepEqual(rows.map((row) => row.testId), ['failed', 'technical', 'secure', 'missing']);
  assert.deepEqual(rows.map((row) => row.cellRes.map((cell) => cell?.targetUid ?? null)), [
    ['target-b', 'target-a'], ['target-b', 'target-a'], ['target-b', 'target-a'], ['target-b', null],
  ]);
  assert.deepEqual(rows.map(({ testId, vulnCount, errCount, worst }) => ({ testId, vulnCount, errCount, worst })), [
    { testId: 'failed', vulnCount: 1, errCount: 0, worst: 0 },
    { testId: 'technical', vulnCount: 1, errCount: 1, worst: 0 },
    { testId: 'secure', vulnCount: 0, errCount: 0, worst: 1 },
    { testId: 'missing', vulnCount: 0, errCount: 1, worst: 2 },
  ]);
});

test('Grouping is override-aware and excludes all-missing rows', () => {
  const rows = buildComparisonRows({ results, allTests: tests, targets, effectiveStatus });
  const groups = classifyComparisonRows(rows, effectiveStatus);
  assert.deepEqual(groups.failedRows.map((row) => row.testId), ['failed', 'technical']);
  assert.deepEqual(groups.inconclusiveRows.map((row) => row.testId), ['missing']);
  assert.deepEqual(groups.succeededRows.map((row) => row.testId), ['secure']);

  const allMissing = buildComparisonRows({ results: [result('gone', 'other-target', 'SECURE')], allTests: [], targets, effectiveStatus });
  assert.deepEqual(classifyComparisonRows(allMissing, effectiveStatus), { failedRows: [], inconclusiveRows: [], succeededRows: [] });
});

test('Status weighting and worst selection retain baseline precedence and stable ties', () => {
  assert.deepEqual(['VULNERABLE', 'SECURE', 'ERROR', 'EMPTY', 'INCONCLUSIVE'].map(statusWeight), [0, 1, 2, 2, 2]);
  const error = result('tie', 'target-b', 'ERROR');
  const empty = result('tie', 'target-a', 'EMPTY');
  assert.equal(selectWorstResult([undefined, error, empty], (entry) => entry.status), error);
  assert.equal(selectWorstResult([undefined, null], (entry) => entry.status), undefined);
  assert.equal(selectWorstResult([error, result('tie', 'target-a', 'SECURE')], (entry) => entry.status).status, 'SECURE');
  assert.equal(selectWorstResult([result('tie', 'target-b', 'VULNERABLE'), result('tie', 'target-a', 'SECURE')], (entry) => entry.status).status, 'VULNERABLE');
});

test('Sorting supports all keys and both directions without mutating rows', () => {
  const rows = buildComparisonRows({ results, allTests: tests, targets, effectiveStatus });
  const before = rows.map((row) => row.testId);
  const order = (key, dir) => sortComparisonRows(rows, key, dir).map((row) => row.testId);
  assert.deepEqual(order('name', 'asc'), ['secure', 'technical', 'missing', 'failed']);
  assert.deepEqual(order('name', 'desc'), ['failed', 'missing', 'technical', 'secure']);
  assert.deepEqual(order('technique', 'asc'), ['failed', 'technical', 'secure', 'missing']);
  assert.deepEqual(order('technique', 'desc'), ['missing', 'secure', 'technical', 'failed']);
  assert.deepEqual(order('result', 'asc'), ['failed', 'technical', 'secure', 'missing']);
  assert.deepEqual(order('result', 'desc'), ['missing', 'secure', 'failed', 'technical']);
  assert.deepEqual(rows.map((row) => row.testId), before);
});

test('Per-model summaries exclude every technical status and preserve null score', () => {
  assert.deepEqual(summarizeModelResults(results, 'target-b', effectiveDetails), {
    vuln: 2, secure: 1, errs: 0, empties: 0, inconclusives: 1, valid: 3, score: 33,
  });
  assert.deepEqual(summarizeModelResults([
    result('x', 'target-a', 'ERROR'), result('y', 'target-a', 'EMPTY'), result('z', 'target-a', 'INCONCLUSIVE'),
  ], 'target-a', (entry) => entry), {
    vuln: 0, secure: 0, errs: 1, empties: 1, inconclusives: 1, valid: 0, score: null,
  });
});

test('Utility stays dependency-free and ComparisonResults adopts it without duplicate decisions', () => {
  const moduleSource = readFileSync(new URL('../src/utils/comparison-table.js', import.meta.url), 'utf8');
  const componentSource = readFileSync(new URL('../src/components/runner/ComparisonResults.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(moduleSource, /^import\s/m);
  assert.doesNotMatch(moduleSource, /\b(React|useAudit|useHistory|useTests|useProviders|document|window)\b/);
  for (const name of ['buildComparisonRows', 'classifyComparisonRows', 'selectWorstResult', 'sortComparisonRows', 'summarizeModelResults']) {
    assert.match(componentSource, new RegExp(`\\b${name}\\b`), `ComparisonResults adopts ${name}`);
  }
  assert.doesNotMatch(componentSource, /const statusWeight =/);
  assert.doesNotMatch(componentSource, /const modelResults = results\.map\(effectiveDetails\)/);
  assert.ok(componentSource.split('\n').length < 392, `ComparisonResults is strictly smaller than its 392-line baseline; got ${componentSource.split('\n').length}`);
});
