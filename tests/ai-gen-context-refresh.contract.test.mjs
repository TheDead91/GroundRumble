// Regression coverage for the react(only-export-components) rule. React Fast
// Refresh only works when a component file exports components (plus, per
// .oxlintrc.json, constant exports). The useAIGen hook lives in its own module,
// so the context file stays component/constant-only — otherwise `npm run lint`
// warns.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8').replace(/\r\n/g, '\n');

test('UseAIGen lives in its own module so AIGenContext.jsx stays Fast-Refresh clean', () => {
  const ctx = read('src/context/AIGenContext.jsx');
  const functions = [...ctx.matchAll(/export function (\w+)/g)].map((m) => m[1]);
  assert.deepEqual(functions, ['AIGenProvider'], 'AIGenContext.jsx exports exactly one function — the provider component');
  assert.ok(/export \{ AIGenContext \};$/.test(ctx.trimEnd()), 'the context constant export stays (allowConstantExport permits it)');
  const hook = read('src/context/useAIGen.js');
  assert.match(hook, /^import \{ useContext \} from 'react';$/m, 'the hook imports useContext');
  assert.match(hook, /import \{ AIGenContext \} from '\.\/AIGenContext';/, 'the hook derives from the context object');
  assert.match(hook, /^export function useAIGen\(\) \{/m, 'the hook is exported from the dedicated module');
});