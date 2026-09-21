// Contract: src/hooks/useAIGeneration.js carries NO dead legacy wizard ops —
// the six definitions (analyzeSources, generateTests, critiqueTests,
// runWizard, nextWizardStep, prevWizardStep), their six return keys, the
// `aiWizardStep` destructure entry and the useCallback react import are
// absent; the live pipeline surface
// (startAiGeneration/runAiAnalysis/runAiGeneration/runAiCritique/
// confirmAiPreview/finalizeAiDraft/cancelAiGeneration/refineAiTests/
// openAiWizard/toggleAiPreviewItem + the intake ops) is present and the hook
// stays strictly net-smaller (842 → ≈763).
//
// UNION TOLERANCE: the intake cluster may live in
// src/hooks/useAiSources.js with the intake ops re-spread. This suite
// therefore pins NO line floor, pins NO intake-op definitions (only their
// RETURN keys, which the re-spread keeps) and compares the return surface as
// an exact SET (order-free against a spread re-composition). Every pin here
// stays green with the intake cluster in either location.
//
// The live-op body guarantees are carried by the untouched suites
// tests/ai-pipeline.contract.test.mjs (runAi*/orchestration pins) and
// tests/ai-wizard-ops.contract.test.mjs (wizard-op pins) — none of their
// anchors reference the deleted region.
//
// Source-text level under bare `node --test`. Hermetic: no server, no
// network, no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const HOOK_PATH = 'src/hooks/useAIGeneration.js';
const APP_PATH = 'src/App.jsx';
const BASELINE_HOOK_LINES = 842;

const readSource = (relPath) => readFileSync(join(root, relPath), 'utf8').replace(/\r\n/g, '\n');
let hook = '', app = '';
try {
  hook = readSource(HOOK_PATH);
  app = readSource(APP_PATH);
} catch { /* a missing scope file fails its first assertion */ }

const countStr = (source, needle) => source.split(needle).length - 1;
const countIn = (source, re) => [...source.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'))].length;
const idx = (source, needle, from = 0) => source.indexOf(needle, from);

// Recursive src sweep (pure node, hermetic, deterministic).
function srcFiles() {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir).sort()) {
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(js|jsx|mjs)$/.test(entry)) out.push(p);
    }
  };
  walk(join(root, 'src'));
  return out.map((p) => p.slice(root.length + 1));
}
const srcPaths = srcFiles();
const srcBodies = new Map(srcPaths.map((p) => [p, readSource(p)]));

const SIX = ['analyzeSources', 'generateTests', 'critiqueTests', 'runWizard', 'nextWizardStep', 'prevWizardStep'];
const LIVE_PIPELINE = ['startAiGeneration', 'runAiAnalysis', 'runAiGeneration', 'runAiCritique', 'confirmAiPreview', 'finalizeAiDraft', 'cancelAiGeneration', 'refineAiTests', 'openAiWizard', 'toggleAiPreviewItem'];
// The 21 surviving return keys (order-free: compared as a SET, spread-tolerant).
const SURVIVOR_KEYS = [
  'assessSource', 'toggleAiGenSource', 'addAiGenUrl', 'addSourceEntry',
  'saveAiSourceDraft', 'updateSourceDraft', 'toggleAiGenUrl', 'removeAiGenUrl',
  'addPastedSourceDraft', 'handleAddSourceSubmit',
  ...LIVE_PIPELINE, 'validTechniqueIds',
];

// ---------------------------------------------------------------------------
// The six definitions and every reference to them are gone
// ---------------------------------------------------------------------------

test('Zero references to the six legacy ops across the entire src tree', () => {
  assert.ok(srcPaths.includes(HOOK_PATH) && srcPaths.includes(APP_PATH), 'the sweep covers the hook and App');
  for (const name of SIX) {
    for (const [path, body] of srcBodies) {
      assert.equal(countIn(body, new RegExp(`\\b${name}\\b`, 'g')), 0, `${name} has zero references in ${path}`);
    }
  }
});

test('The dead-ops cluster is deleted whole — comments, copy, stepper table, dynamic imports', () => {
  for (const marker of ['// Analyze sources', '// Generate tests', '// Critique tests', '// Run wizard', '// Wizard step handlers']) {
    assert.equal(countStr(hook, marker), 0, `the cluster section comment is gone: ${marker}`);
  }
  for (const copy of ['Add at least one source first', 'No sources with profiles', 'No draft tests to critique', 'Critique complete', 'Analysis failed: ', 'Critique failed: ', "Generation failed: ${err.message}", "const steps = ['sources', 'config', 'running', 'profiles', 'draft', 'results'];"]) {
    assert.equal(countStr(hook, copy), 0, `cluster-only copy is gone: ${copy.slice(0, 60)}`);
  }
  assert.equal(countIn(hook, /await import\('/g), 0, 'the three dead-op dynamic imports (ai-analyzer/ai-generator) are gone');
  assert.ok(hook.includes('// Ticking elapsed-time display while a generation stage is running.'), 'the live elapsed-effect comment survives as the cluster floor');
});

test('The dead judge-acquisition path is gone — no zero-arg buildJudge calls remain', () => {
  assert.equal(countIn(hook, /buildJudge\(\)/g), 0, 'no zero-arg buildJudge() call sites remain in the hook');
  for (const name of ['analyzeSourcesWithAI', 'generateTestsWithAI', 'critiqueGeneratedTests']) {
    assert.ok(countIn(hook, new RegExp(`\\b${name}\\b`)) >= 1, `the live pipeline still reaches ${name} through the utils/api import`);
  }
});

// ---------------------------------------------------------------------------
// The hook return object loses exactly the six keys
// ---------------------------------------------------------------------------

test('The return surface is the exact 21-key survivor set — six keys lost, nothing else', () => {
  const retStart = idx(hook, 'return {\n    assessSource,');
  assert.ok(retStart > 0, 'the hook return surface keeps its T08 head');
  const retEnd = idx(hook, '};', retStart);
  const retBody = hook.slice(retStart, retEnd);
  const keys = [...retBody.matchAll(/^ {4}([A-Za-z_$][A-Za-z0-9_$]*),?\s*$/gm)].map((m) => m[1]);
  assert.equal(keys.length, 21, `exactly 21 keys survive (landed ${keys.length})`);
  assert.deepEqual([...keys].sort(), [...SURVIVOR_KEYS].sort(), 'the survivor set is exact (order-free against a T10 re-spread)');
  for (const name of SIX) {
    assert.ok(!keys.includes(name), `the dead key ${name} left the return object`);
  }
});

// ---------------------------------------------------------------------------
// The AIGenContext destructure entries that are dead are absent
// ---------------------------------------------------------------------------

test('The aiWizardStep destructure entry is gone; setAiWizardStep stays live for openAiWizard', () => {
  assert.equal(countIn(hook, /\baiWizardStep\b/g), 0, 'zero bare aiWizardStep tokens remain (the dead stepper readers are deleted)');
  assert.ok(countIn(hook, /\bsetAiWizardStep\(/g) >= 1, 'the live setAiWizardStep callers (openAiWizard et al.) stay');
});

test('The react import is slimmed — useCallback is fully gone from the hook', () => {
  assert.match(hook, /import \{ (useEffect, useRef|useRef, useEffect) \} from 'react';/, "the react import slims to 'useEffect, useRef' (no new lint finding)");
  assert.equal(countIn(hook, /useCallback/g), 0, 'zero useCallback occurrences remain');
});

// ---------------------------------------------------------------------------
// The live pipeline surface is unchanged — the deleted ops took nothing live with them
// ---------------------------------------------------------------------------

test('The ten live pipeline ops remain hook-defined exactly once each', () => {
  for (const name of LIVE_PIPELINE) {
    assert.equal(countIn(hook, new RegExp(`const ${name} = `, 'g')), 1, `the live op ${name} is still defined exactly once in the hook`);
  }
});

test('The hook shrinks strictly net-smaller (~80 lines off the 842-line baseline)', () => {
  const hookLines = hook.split('\n').length;
  assert.ok(hookLines < BASELINE_HOOK_LINES, `useAIGeneration.js is strictly net-smaller than the 842-line baseline (landed ${hookLines}; no >700 floor here — T10 re-bases it legitimately)`);
});

// ---------------------------------------------------------------------------
// App's adoption is untouched — it still binds only the live names
// ---------------------------------------------------------------------------

test('App still adopts the hook exactly once and binds only live names', () => {
  let adoptionSites = 0;
  for (const body of srcBodies.values()) adoptionSites += countIn(body, /= useAIGeneration\(\{/g);
  assert.equal(adoptionSites, 1, 'useAIGeneration is still adopted exactly once across src (App)');
  const adoptionStart = idx(app, '= useAIGeneration({');
  const destructure = app.slice(app.lastIndexOf('const {', adoptionStart), adoptionStart);
  for (const name of ['toggleAiGenSource', 'saveAiSourceDraft', 'updateSourceDraft', 'toggleAiGenUrl', 'removeAiGenUrl', 'handleAddSourceSubmit', 'startAiGeneration', 'runAiGeneration', 'confirmAiPreview', 'finalizeAiDraft', 'cancelAiGeneration', 'refineAiTests', 'openAiWizard', 'toggleAiPreviewItem']) {
    assert.match(destructure, new RegExp(`\\b${name}\\b`), `the App destructure still binds ${name}`);
  }
  assert.ok(app.includes("from './hooks/useAIGeneration'"), 'App still imports the hook');
});
