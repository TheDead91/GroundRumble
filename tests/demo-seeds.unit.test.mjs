// Structural pins for the pre-recorded demo simulation seeds: they live in ONE
// pure-data module, src/data/demo-seeds.js, and are re-sourced through a
// single extensionless import inside the './data/*' group.
//
// Complements the location-agnostic characterization suite
// (tests/demo-simulation.contract.test.mjs), which keeps guarding value
// identity wherever the declaration lives; THIS file pins the mandated module
// layout itself and imports the real module directly under plain Node ESM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEMO_SIMULATION_RESPONSES } from '../src/data/demo-seeds.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MODULE_PATH = 'src/data/demo-seeds.js';

const sourceOf = (relPath) => readFileSync(join(root, relPath), 'utf8');

test('demo-seeds.js is a pure-data module that imports nothing', () => {
  const text = sourceOf(MODULE_PATH);
  assert.doesNotMatch(text, /^[ \t]*import\b/m, 'the module must not import anything (cycle-free pure data)');
  assert.doesNotMatch(text, /\brequire\s*\(/, 'no CommonJS require either');
  assert.doesNotMatch(text, /\bexport\s*\{[^}]*\}\s*from\b/m, 'no re-exports: the data is declared right here');
});

test('demo-seeds.js opens with a one-line header comment in the src/data house style', () => {
  const lines = sourceOf(MODULE_PATH).replace(/\r\n/g, '\n').split('\n');
  assert.match(lines[0], /^\/\/ \S/, 'line 1 must be a single `//` header comment (mirrors src/data/app-config.js)');
  assert.equal(lines[1], '', 'exactly one blank line separates the header from the data block');
});

test('the moved block keeps its verbatim lead comment, a bare const declaration, and a separate named export', () => {
  const text = sourceOf(MODULE_PATH).replace(/\r\n/g, '\n');
  assert.match(
    text,
    /^\/\/ Pre-recorded demo responses\nconst DEMO_SIMULATION_RESPONSES[ \t]*=/m,
    'the original comment stays directly above a bare line-start const (an inline `export const` prefix would break the characterization regexes)'
  );
  assert.doesNotMatch(text, /^[ \t]*export const DEMO_SIMULATION_RESPONSES/m, 'no inline export on the declaration');
  assert.match(text, /^export \{ DEMO_SIMULATION_RESPONSES \};$/m, 'the named export is its own statement on its own line');
  assert.deepEqual(
    text.match(/^export[^\n]*/gm) ?? [],
    ['export { DEMO_SIMULATION_RESPONSES };'],
    'the module exports exactly one symbol, exactly one way'
  );
});

test('importing the real module yields the pinned five-scenario snapshot with stable polarity', () => {
  // Byte-level value identity (deepEqual + stringify + sha256) is enforced
  // tree-wide by tests/demo-simulation.contract.test.mjs; this proves the
  // actual module loads, parses and exports that exact data via ESM.
  assert.deepEqual(Object.keys(DEMO_SIMULATION_RESPONSES), [
    'direct_override',
    'system_prompt_leak',
    'dan_jailbreak',
    'excess_agency_tools',
    'refusal_hijack'
  ]);
  for (const [scenario, set] of Object.entries(DEMO_SIMULATION_RESPONSES)) {
    assert.deepEqual(Object.keys(set), ['llama_secure', 'llama_vulnerable'], `${scenario}: exact persona keys`);
    assert.equal(set.llama_secure.status, 'SECURE', `${scenario}: secure verdict`);
    assert.equal(set.llama_vulnerable.status, 'VULNERABLE', `${scenario}: vulnerable verdict`);
  }
  assert.ok(
    DEMO_SIMULATION_RESPONSES.system_prompt_leak.llama_vulnerable.response.includes("'OASIS_RED_SHADOW_2026'"),
    'distinctive token fragment survives into the exported value'
  );
});

test("useAuditRun.js sources the seeds extensionlessly, immediately after the './utils/api' import (T04 port)", () => {
  const app = sourceOf('src/App.jsx').replace(/\r\n/g, '\n');
  const hook = sourceOf('src/hooks/useAuditRun.js').replace(/\r\n/g, '\n');
  assert.doesNotMatch(hook, /^[ \t]*(?:export )?const DEMO_SIMULATION_RESPONSES[ \t]*=/m, 'no local copy may remain in the hook');
  assert.doesNotMatch(hook, /['"]\.\.\/data\/demo-seeds\.js['"]/, 'the specifier must be extensionless');
  assert.match(hook, /^import \{ DEMO_SIMULATION_RESPONSES \} from '\.\.\/data\/demo-seeds';$/m, 'grouped import line required verbatim');
  assert.equal(hook.split("from '../data/demo-seeds'").length - 1, 1, 'exactly one importing line');
  const lines = hook.split('\n');
  const idx = lines.findIndex((l) => l.includes("'../data/demo-seeds'"));
  assert.ok(idx > 0, 'the demo-seeds import is found');
  assert.match(lines[idx - 1], /from '\.\.\/utils\/api';$/, 'sits IMMEDIATELY after the utils/api import');
  // The audit engine is the only consumer, so App stops importing the seeds.
  assert.doesNotMatch(app, /from '\.\/data\/demo-seeds';/, 'App.jsx no longer imports the seeds (the engine moved to the hook)');
});

test("the './data/*' import group stays contiguous and nothing but blank lines precedes the judge comment", () => {
  const app = sourceOf('src/App.jsx').replace(/\r\n/g, '\n');
  const lines = app.split('\n');
  const dataIdxs = lines.reduce((acc, l, i) => (l.includes("from './data/") ? [...acc, i] : acc), []);
  assert.ok(dataIdxs.length >= 2, 'payloads and app-config wire through ./data/* (demo-seeds moved to useAuditRun.js by T04)');
  for (let i = 1; i < dataIdxs.length; i++) {
    assert.equal(dataIdxs[i], dataIdxs[i - 1] + 1, "'./data/*' imports form one contiguous group");
  }
  const seam = app.match(/^import \{ AppLayout \} from '\.\/components\/layout\/AppLayout';\n((?:[ \t]*\n)+)\/\/ First-run demo lineup/m);
  assert.ok(seam, 'AppLayout import, then only blank line(s), then the module-scope demo-lineup comment — no relocation residue');
});
