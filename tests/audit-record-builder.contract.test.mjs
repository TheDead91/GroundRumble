import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const hook = readFileSync(join(root, 'src/hooks/useAuditRun.js'), 'utf8').replace(/\r\n/g, '\n');
const history = readFileSync(join(root, 'src/context/HistoryContext.jsx'), 'utf8').replace(/\r\n/g, '\n');
const modulePath = join(root, 'src/utils/audit-record.js');
const moduleSource = readFileSync(modulePath, 'utf8').replace(/\r\n/g, '\n');
const { buildAuditRecord } = await import(pathToFileURL(modulePath).href);

const NOW = '2026-09-08T12:34:56.789Z';
const lineup = Object.freeze([
  Object.freeze({ uid: 'target-a', provider: 'openai', model: 'gpt-a', ignored: true }),
  Object.freeze({ uid: 'target-b', provider: 'anthropic', model: 'claude-b' })
]);
const mixedResults = Object.freeze([
  Object.freeze({ id: 'r1', status: 'VULNERABLE', response: 'Authorization: Bearer keep-owner-redaction' }),
  Object.freeze({ id: 'r2', status: 'SECURE' }),
  Object.freeze({ id: 'r3', status: 'ERROR' }),
  Object.freeze({ id: 'r4', status: 'EMPTY' }),
  Object.freeze({ id: 'r5', status: 'INCONCLUSIVE' }),
  Object.freeze({ id: 'r6', status: 'VULNERABLE' }),
  Object.freeze({ id: 'r7', status: 'FUTURE_STATUS' })
]);

test('One pure builder creates the exact completed mixed-status record from an injected timestamp', () => {
  const input = Object.freeze({
    id: 'audit-complete', timestamp: NOW, lineup, isDemo: true,
    results: mixedResults, expectedCount: 8, completed: true
  });
  const record = buildAuditRecord(input);

  assert.deepEqual(record, {
    id: 'audit-complete',
    timestamp: NOW,
    targets: [
      { provider: 'openai', model: 'gpt-a' },
      { provider: 'anthropic', model: 'claude-b' }
    ],
    model: 'gpt-a, claude-b',
    provider: 'openai, anthropic',
    isDemo: true,
    totalTests: 7,
    vulnerableCount: 2,
    secureCount: 1,
    errorCount: 1,
    emptyCount: 1,
    inconclusiveCount: 1,
    completed: true,
    completedCount: 7,
    expectedCount: 8,
    details: mixedResults
  });
  assert.equal('cancelled' in record, false);
  assert.equal(record.details, mixedResults, 'result order and array identity remain unchanged');
  assert.equal(record.details[0].response, 'Authorization: Bearer keep-owner-redaction', 'construction does not steal redaction from persistence');
  assert.equal(input.timestamp, NOW, 'the frozen input remains unchanged');
});

test('The same builder creates the exact cancelled partial-record distinction', () => {
  const partialResults = Object.freeze([mixedResults[1], mixedResults[3], mixedResults[4]]);
  const record = buildAuditRecord({
    id: 'audit-cancelled', timestamp: NOW, lineup, isDemo: false,
    results: partialResults, expectedCount: 12, completed: false
  });

  assert.deepEqual(Object.keys(record), [
    'id', 'timestamp', 'targets', 'model', 'provider', 'isDemo', 'completed',
    'cancelled', 'completedCount', 'expectedCount', 'totalTests',
    'vulnerableCount', 'secureCount', 'errorCount', 'emptyCount',
    'inconclusiveCount', 'details'
  ]);
  assert.deepEqual(record, {
    id: 'audit-cancelled', timestamp: NOW,
    targets: [
      { provider: 'openai', model: 'gpt-a' },
      { provider: 'anthropic', model: 'claude-b' }
    ],
    model: 'gpt-a, claude-b', provider: 'openai, anthropic', isDemo: false,
    completed: false, cancelled: true, completedCount: 3, expectedCount: 12,
    totalTests: 3, vulnerableCount: 0, secureCount: 1, errorCount: 0,
    emptyCount: 1, inconclusiveCount: 1, details: partialResults
  });
});

test('Empty records are direct-covered and construction remains separate from persistence/redaction', () => {
  const record = buildAuditRecord({
    id: 'audit-empty', timestamp: NOW, lineup: [], isDemo: false,
    results: [], expectedCount: 0, completed: true
  });

  assert.deepEqual(record, {
    id: 'audit-empty', timestamp: NOW, targets: [], model: '', provider: '', isDemo: false,
    totalTests: 0, vulnerableCount: 0, secureCount: 0, errorCount: 0,
    emptyCount: 0, inconclusiveCount: 0, completed: true, completedCount: 0,
    expectedCount: 0, details: []
  });
  assert.match(history, /const redacted = next\.map\(redactAuditRecord\);[\s\S]*await persistAuditHistory\(redacted\)/,
    'HistoryContext still owns record redaction before persistence');
  assert.match(hook, /const errMsg = projectDiagnosticTextStrict\(err\);/,
    'the audit engine still owns per-result error projection');
});

test('UseAuditRun delegates both lifecycle outcomes to the shared builder before persisting', () => {
  assert.match(hook, /import \{[^}]*\bbuildAuditRecord\b[^}]*\} from '\.\.\/utils\/audit-record';/);
  assert.equal((hook.match(/buildAuditRecord\(\{/g) ?? []).length, 2, 'complete and cancelled paths share exactly one imported builder');
  assert.doesNotMatch(hook, /const (?:final|partial)AuditRecord = \{/,
    'the duplicate inline record constructors are gone');

  const completeBuild = hook.indexOf('const finalAuditRecord = buildAuditRecord({');
  const completePersist = hook.indexOf('historyPersisted = await appendAuditHistory(finalAuditRecord);');
  const cancelGuard = hook.indexOf('if (!historyPersisted) {');
  const cancelBuild = hook.indexOf('const partialAuditRecord = buildAuditRecord({');
  const cancelPersist = hook.indexOf('await appendAuditHistory(partialAuditRecord);');
  assert.ok(completeBuild >= 0 && completePersist > completeBuild, 'complete record is built before append');
  assert.ok(cancelGuard > completePersist && cancelBuild > cancelGuard && cancelPersist > cancelBuild,
    'cancelled record is built and appended only inside the existing not-persisted guard');
  assert.equal((hook.match(/timestamp: new Date\(\)\.toISOString\(\)/g) ?? []).length, 4,
    'two result timestamps and two record timestamps remain injected at their current engine call sites');
  assert.match(moduleSource, /export function buildAuditRecord\(/, 'the builder is a named pure utility export');
});
