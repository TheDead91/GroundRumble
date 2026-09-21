import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { summarizeVerdicts } from '../src/utils/verdict-summary.js';

const comparison = readFileSync(new URL('../src/components/runner/ComparisonResults.jsx', import.meta.url), 'utf8');
const dashboard = readFileSync(new URL('../src/components/views/DashboardView.jsx', import.meta.url), 'utf8');
const auditModal = readFileSync(new URL('../src/components/modals/AuditDetailModal.jsx', import.meta.url), 'utf8');

const result = (status) => Object.freeze({ status });
const cases = [
  {
    name: 'complete results',
    rows: ['SECURE', 'VULNERABLE', 'SECURE'].map(result),
    expected: { secure: 2, vulnerable: 1, errors: 0, empties: 0, inconclusives: 0, technical: 0, valid: 3, resilience: 67 },
  },
  {
    name: 'technical-only results',
    rows: ['ERROR', 'EMPTY', 'INCONCLUSIVE'].map(result),
    expected: { secure: 0, vulnerable: 0, errors: 1, empties: 1, inconclusives: 1, technical: 3, valid: 0, resilience: null },
  },
  {
    name: 'empty results',
    rows: [],
    expected: { secure: 0, vulnerable: 0, errors: 0, empties: 0, inconclusives: 0, technical: 0, valid: 0, resilience: null },
  },
  {
    name: 'effective overridden results',
    rows: [{ status: 'VULNERABLE', originalStatus: 'SECURE' }, { status: 'SECURE', originalStatus: 'ERROR' }].map(Object.freeze),
    expected: { secure: 1, vulnerable: 1, errors: 0, empties: 0, inconclusives: 0, technical: 0, valid: 2, resilience: 50 },
  },
];

for (const { name, rows, expected } of cases) {
  test(`summarizeVerdicts returns the complete ${name} summary`, () => {
    const before = JSON.stringify(rows);
    assert.deepEqual(summarizeVerdicts(Object.freeze(rows)), expected);
    assert.equal(JSON.stringify(rows), before, 'the pure summary does not mutate its input');
  });
}

test('Every UI summary adopts the shared helper after effective-detail mapping', () => {
  for (const [name, source] of [['comparison', comparison], ['dashboard', dashboard], ['audit modal', auditModal]]) {
    assert.match(source, /import \{ summarizeVerdicts \} from '\.\.\/\.\.\/utils\/verdict-summary';/, `${name} imports the shared summary`);
  }

  assert.match(comparison, /summarizeVerdicts\(modelResults\)/, 'comparison summarizes one effective model result set');
  assert.match(dashboard, /summarizeVerdicts\(allHistoricalResults\)/, 'dashboard overall summarizes effective history');
  assert.match(dashboard, /summarizeVerdicts\(det\)/, 'dashboard history row summarizes effective details');
  assert.match(auditModal, /summarizeVerdicts\(auditDetails\)/, 'audit detail summarizes effective details');

  const joined = `${comparison}\n${dashboard}\n${auditModal}`;
  assert.equal(joined.split('summarizeVerdicts(').length - 1, 4, 'the three surfaces have exactly four summary call sites');
});

test('Duplicated count and resilience formulas leave all three UI surfaces', () => {
  for (const [name, source] of [['comparison', comparison], ['dashboard', dashboard], ['audit modal', auditModal]]) {
    assert.doesNotMatch(source, /\.filter\([^\n]+\.status === 'SECURE'\)\.length;/, `${name} has no inline secure count`);
    assert.doesNotMatch(source, /\.filter\([^\n]+\.status === 'VULNERABLE'\)\.length;/, `${name} has no inline vulnerable count`);
  }
  assert.doesNotMatch(comparison, /Math\.round\(\(secure \/ valid\) \* 100\)/);
  assert.doesNotMatch(dashboard, /Math\.round\(\((historicalSecureCount \/ totalTestsRunCount|recSecure \/ validTests)\) \* 100\)/);
  assert.doesNotMatch(auditModal, /Math\.round\(\(auditSecure \/ auditValid\) \* 100\)/);
});
