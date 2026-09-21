// Regression coverage for the react(only-export-components) rule. React Fast
// Refresh only works when a component file exports components (plus, per
// .oxlintrc.json, constant exports). AuditContext.jsx intentionally keeps the
// sanctioned non-component export — the useAudit hook — because consumer
// suites require it to be importable from this exact module. The sanctioned
// export is therefore guarded by an inline oxlint-disable-next-line
// react/only-export-components comment, the same pattern the repo uses for
// useHistory in HistoryContext.jsx.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'src/context/AuditContext.jsx'), 'utf8');
const GUARD = '// oxlint-disable-next-line react/only-export-components\n';

test('UseAudit stays exported from AuditContext.jsx behind a Fast-Refresh guard', () => {
  const match = src.match(/^export function useAudit\(\) \{$/m);
  assert.ok(match, 'expected `export function useAudit() {` in AuditContext.jsx');
  assert.ok(src.slice(0, match.index).endsWith(GUARD), 'useAudit must be Fast-Refresh guarded by an oxlint-disable-next-line comment');
});

test('The provider component and context constant exports survive', () => {
  assert.match(src, /^export function AuditProvider\(/m, 'AuditProvider component export stays');
  assert.match(src, /^export \{ AuditContext \};$/m, 'AuditContext constant export stays (allowConstantExport permits it)');
});

test('The hook keeps its throw guard contract', () => {
  assert.match(src, /throw new Error\('useAudit must be used within an AuditProvider'\)/, 'the hook still guards against missing providers');
});