import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resultOverrideKey } from '../src/utils/audit-result-key.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readSource = (path) => readFileSync(join(root, path), 'utf8').replace(/\r\n/g, '\n');
const keySrc = readSource('src/utils/audit-result-key.js');
const historySrc = readSource('src/context/HistoryContext.jsx');
const backupSrc = readSource('src/hooks/useBackupFlow.js');

const cases = [
  [{ auditId: 'audit-7', timestamp: 'ignored', targetUid: 'target-2', testId: 'test-9' }, 'audit-7-target-2-test-9'],
  [{ auditId: '', timestamp: '2026-09-08T01:02:03Z', targetUid: 'target', testId: 'test' }, '2026-09-08T01:02:03Z-target-test'],
  [{ auditId: 0, timestamp: 'fallback', targetUid: 'target', testId: 'test' }, 'fallback-target-test'],
  [{ auditId: null, timestamp: 'fallback', targetUid: undefined, testId: undefined }, 'fallback-undefined-undefined'],
  [{ auditId: 'a-b', timestamp: 'ignored', targetUid: 'c-d', testId: 'e-f' }, 'a-b-c-d-e-f'],
];

test('The pure module preserves every composite-key edge case', () => {
  assert.match(keySrc, /^export const resultOverrideKey = \(r\) => `\$\{r\.auditId \|\| r\.timestamp\}-\$\{r\.targetUid\}-\$\{r\.testId\}`;$/m);
  for (const [record, expected] of cases) assert.equal(resultOverrideKey(record), expected);

  const accesses = [];
  const record = {};
  for (const [name, value] of [['auditId', 'audit'], ['timestamp', 'unused'], ['targetUid', 'target'], ['testId', 'test']]) {
    Object.defineProperty(record, name, { get() { accesses.push(name); return value; }, configurable: true });
  }
  assert.equal(resultOverrideKey(record), 'audit-target-test');
  assert.deepEqual(accesses, ['auditId', 'targetUid', 'testId']);
  accesses.length = 0;
  Object.defineProperty(record, 'auditId', { get() { accesses.push('auditId'); return ''; } });
  assert.equal(resultOverrideKey(record), 'unused-target-test');
  assert.deepEqual(accesses, ['auditId', 'timestamp', 'targetUid', 'testId']);
});

test('Exactly one implementation exists and both flows adopt it', () => {
  const srcDir = join(root, 'src');
  const files = readdirSync(srcDir, { recursive: true })
    .map((path) => path.split(sep).join('/'))
    .filter((path) => /\.(js|jsx)$/.test(path) && statSync(join(srcDir, path)).isFile());
  const definitions = files.filter((path) => /(?:export )?const resultOverrideKey = \(r\) =>/.test(readSource(join('src', path))));
  assert.deepEqual(definitions, ['utils/audit-result-key.js']);
  assert.match(backupSrc, /import \{ resultOverrideKey \} from '\.\.\/utils\/audit-result-key';/);
  assert.doesNotMatch(backupSrc, /const resultOverrideKey =/);
  assert.match(historySrc, /import \{ resultOverrideKey \} from '\.\.\/utils\/audit-result-key';/);
  assert.match(historySrc, /export \{ resultOverrideKey \};/);
  assert.doesNotMatch(historySrc, /const resultOverrideKey =/);
});

test('HistoryContext keeps the public export without stateful wrapping', () => {
  const imports = historySrc.match(/import \{ resultOverrideKey \} from '\.\.\/utils\/audit-result-key';/g) || [];
  const exports = historySrc.match(/export \{ resultOverrideKey \};/g) || [];
  assert.equal(imports.length, 1);
  assert.equal(exports.length, 1);
  assert.doesNotMatch(historySrc, /(?:const|let|var|function)\s+resultOverrideKey\b/);
  for (const path of ['src/components/modals/AuditDetailModal.jsx', 'src/components/runner/ComparisonResults.jsx']) {
    assert.match(readSource(path), /import \{[^}]*resultOverrideKey[^}]*\} from '[^']*context\/HistoryContext';/);
  }
});

test('Restore indexing and filtering order are unchanged', () => {
  assert.match(backupSrc, /if \(detail && detail\.status\) knownResults\.set\(resultOverrideKey\(detail\), detail\.status\);/);
  const imported = backupSrc.indexOf('collectResultStatuses(importedHistory);');
  const existing = backupSrc.indexOf('collectResultStatuses(historyRef.current);');
  const filtered = backupSrc.indexOf('filterRestoredOverrides(overridesObj, knownResults)');
  assert.ok(imported >= 0 && existing > imported && filtered > existing);
});

test('The utility is stateless and dependency-free', async () => {
  assert.doesNotMatch(keySrc, /^import /m);
  assert.doesNotMatch(keySrc, /React|use[A-Z]|localStorage|sessionStorage|document|window|fetch\s*\(/);
  assert.equal(Object.keys(await import('../src/utils/audit-result-key.js')).join(','), 'resultOverrideKey');
});
