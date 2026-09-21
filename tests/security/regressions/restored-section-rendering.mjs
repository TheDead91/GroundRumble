// Restored-section rendering regression.
//
// Neither compare targets nor audit history can persist a record whose
// render-relevant fields are non-string (the prior object-child crash vectors),
// and an invalid whole record or invalid nested container rejects the restore
// atomically before any write.
//
//   atlas_compare_targets  -> RunnerView renders `{t.model}`
//   atlas_audit_history    -> DashboardView renders `{record.model}` when a
//                             record has an empty/absent `targets` array
//
// No production file is modified; no network I/O is performed.
//
// Run: node --test tests/security/regressions/restored-section-rendering.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { openBackup } from '../../../src/utils/backup.js';

const repoFile = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');

const craftedBundle = (data) => ({
  app: 'groundrumble',
  version: 1,
  exportedAt: '2026-09-19T00:00:00.000Z',
  data
});

test('compare-target objects are string-coerced before reaching RunnerView', async () => {
  const targets = JSON.stringify([
    { uid: 'u1', provider: 'sandbox', model: {} },
    { uid: 'u2', provider: 'sandbox', model: ['arr'] }
  ]);
  const opened = await openBackup(craftedBundle({ 'atlas_compare_targets': targets }));

  // Confirm the production render expression is exactly the object-child form.
  const runner = repoFile('src/components/views/RunnerView.jsx');
  assert.ok(runner.includes('{t.model}'), 'RunnerView renders the raw target.model as a React child');

  const normalized = JSON.parse(opened.data['atlas_compare_targets']);
  assert.equal(typeof normalized[0].model, 'string', 'object model coerced to string');
  assert.equal(typeof normalized[1].model, 'string', 'array model coerced to string');
  assert.doesNotThrow(
    () => renderToStaticMarkup(createElement('div', null, createElement('div', null, normalized[0].model))),
    'the previously crashing model child now renders a string'
  );
});

test('a whole non-object target record rejects the restore', async () => {
  await assert.rejects(
    () => openBackup(craftedBundle({ 'atlas_compare_targets': JSON.stringify(['sandbox::x']) })),
    /Comparison target entry 1 .* must be an object\./
  );
});

test('audit-history metadata is string-coerced before reaching DashboardView/AuditDetailModal', async () => {
  const historyRecord = {
    id: 'h1',
    timestamp: '2026-09-19T00:00:00.000Z',
    targets: [],
    model: {},                    // object ever last -> DashboardView line 294
    provider: 'sandbox',
    isDemo: false,
    details: [{
      auditId: 'h1', targetUid: 'u1', testId: 't1',
      testName: {}, tactic: {}, techniqueId: [], techniqueName: {},
      status: 'SECURE', model: {}, provider: 'sandbox',
      systemPrompt: 's', userPrompt: 'u', response: 'r', reasoning: 're'
    }]
  };
  const raw = JSON.stringify([historyRecord]);

  const opened = await openBackup(craftedBundle({ 'atlas_audit_history': raw }));
  const [record] = JSON.parse(opened.data['atlas_audit_history']);

  assert.equal(typeof record.model, 'string', 'record.model is coerced');
  assert.equal(typeof record.details[0].testName, 'string', 'detail.testName is coerced');
  assert.equal(typeof record.details[0].techniqueId, 'string', 'detail.techniqueId is coerced');

  const dashboard = repoFile('src/components/views/DashboardView.jsx');
  assert.ok(dashboard.includes('record.model'), 'DashboardView renders record.model when no targets are present');

  assert.doesNotThrow(
    () => renderToStaticMarkup(createElement('div', null, record.model)),
    'the previously crashing record.model now renders a string'
  );
});

test('non-array nested containers and non-object whole records reject atomically', async () => {
  // The worst case: a non-array `targets` (which used to
  // break `record.targets?.map`) is rejected during candidate construction.
  await assert.rejects(
    () => openBackup(craftedBundle({ 'atlas_audit_history': JSON.stringify([{ id: 'h1', targets: 'u1' }]) })),
    /Audit history entry 1: `targets` must be an array\./
  );
  // A whole non-object history record is rejected, never silently dropped.
  await assert.rejects(
    () => openBackup(craftedBundle({ 'atlas_audit_history': JSON.stringify([42]) })),
    /Audit history entry 1 .* must be an object\./
  );
});

test('contrast — test/preset sections keep their drop contract; overrides/prompts keep rejecting', async () => {
  // Tests and presets are normalized per-entry and malformed entries are dropped
  // (their established bulk-import contract).
  const normalized = await openBackup(craftedBundle({
    'atlas_custom_tests': JSON.stringify([{ name: 'missing everything else' }]),
    'atlas_test_presets': JSON.stringify([{ name: 'no id' }])
  }));
  assert.ok(normalized.normalization.droppedTests >= 1, 'malformed custom test dropped');
  assert.ok(normalized.normalization.droppedPresets >= 1, 'malformed preset dropped');

  // Overrides and prompts are shape-validated at openBackup time and reject the
  // whole import on invalid values.
  await assert.rejects(
    () => openBackup(craftedBundle({ 'atlas_result_overrides': JSON.stringify({ k: { verdict: 'BOGUS', reason: '' } }) })),
    /invalid|too large/i,
    'result-overrides section with a non-allowlisted verdict is rejected'
  );
  await assert.rejects(
    () => openBackup(craftedBundle({ 'atlas_ai_prompts': JSON.stringify({ judge_system: 42 }) })),
    /invalid|too large/i,
    'prompt section with a non-string value is rejected'
  );
});