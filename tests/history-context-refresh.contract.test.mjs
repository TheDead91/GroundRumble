// Regression coverage for the react(only-export-components) rule. React Fast
// Refresh only works when a component file exports components (plus, per
// .oxlintrc.json, constant exports). HistoryContext.jsx intentionally keeps
// two sanctioned non-component exports — the resultOverrideKey re-export and
// the useHistory hook — because consumer suites require them to be importable
// from this exact module. Each sanctioned export is therefore guarded by an
// inline oxlint-disable-next-line react/only-export-components comment, the
// same pattern the repo uses for no-unused-vars keeps.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'src/context/HistoryContext.jsx'), 'utf8');
const GUARD = '// oxlint-disable-next-line react/only-export-components\n';

const guardedBy = (s, decl) => {
  const match = s.match(decl);
  assert.ok(match, `expected declaration in HistoryContext.jsx: ${decl}`);
  assert.ok(s.slice(0, match.index).endsWith(GUARD), `${match[0]} must be Fast-Refresh guarded by an oxlint-disable-next-line comment`);
};

test('ResultOverrideKey stays re-exported from HistoryContext.jsx behind a Fast-Refresh guard', () => {
  guardedBy(src, /^export \{ resultOverrideKey \};$/m);
  assert.doesNotMatch(src, /export const resultOverrideKey =/m, 'no local definition replaces the re-export');
});

test('UseHistory stays exported from HistoryContext.jsx behind a Fast-Refresh guard', () => {
  guardedBy(src, /^export function useHistory\(\) \{$/m);
});

test('The provider component and context constant exports survive', () => {
  assert.match(src, /^export function HistoryProvider\(/m, 'HistoryProvider component export stays');
  assert.match(src, /^export \{ HistoryContext \};$/m, 'HistoryContext constant export stays (allowConstantExport permits it)');
});