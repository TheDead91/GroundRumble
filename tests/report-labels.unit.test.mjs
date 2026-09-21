import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRunReportBody, buildModelReportBody } from '../src/utils/report-builder.js';
import { resolveProviderLabel } from '../src/utils/provider-record.js';

const providers = [
  { id: 'cp_mu6n9q5n', name: 'My Local LLM', models: ['local-1'] },
  { id: 'cp_mu6nvmqc', name: 'Cloud Custom', models: ['c-1', 'c-2'] },
];
const providerLabel = (ref) => {
  if (ref === 'sandbox') return 'Sandbox (2 models)';
  return resolveProviderLabel(ref, providers);
};

const runResults = [
  { testName: 'T1', techniqueId: 'AML.T0034', tactic: 'Execution', model: 'local-1', provider: 'cp_mu6n9q5n', status: 'SECURE', reasoning: 'ok' },
  { testName: 'T2', techniqueId: 'AML.T0034', tactic: 'Execution', model: 'c-1', provider: 'cp_mu6nvmqc', status: 'VULNERABLE', reasoning: 'bad' },
];

test('Run report Provider column uses readable labels, not raw ids', () => {
  const body = buildRunReportBody({ results: runResults, providerLabel });
  assert.ok(body.includes('My Local LLM'), 'custom provider label shown');
  assert.ok(body.includes('Cloud Custom'), 'second custom provider label shown');
  assert.ok(!body.includes('cp_mu6n9q5n'), 'no raw internal id leaks');
  assert.ok(!body.includes('cp_mu6nvmqc'), 'no raw internal id leaks');
});

test('Model report header uses the readable label', () => {
  const body = buildModelReportBody({
    model: 'local-1', provider: 'cp_mu6n9q5n', providerLabel,
    modelResults: runResults.filter((r) => r.provider === 'cp_mu6n9q5n'),
  });
  assert.ok(body.includes('My Local LLM'), 'header shows the friendly name');
  assert.ok(!body.includes('cp_mu6n9q5n'), 'no raw internal id leaks');
});

test('Sandbox and removed-provider fallbacks stay readable', () => {
  const sandboxBody = buildRunReportBody({
    results: [{ testName: 'T', techniqueId: 'T', tactic: 'T', model: 'Demo Secure', provider: 'sandbox', status: 'SECURE', reasoning: '' }],
    providerLabel,
  });
  assert.ok(sandboxBody.includes('Sandbox'), 'sandbox label shown');
  assert.ok(!sandboxBody.includes('>sandbox<'), 'no bare sandbox id');
  const missingBody = buildRunReportBody({
    results: [{ testName: 'T', techniqueId: 'T', tactic: 'T', model: 'm', provider: 'cp_deleted', status: 'SECURE', reasoning: '' }],
    providerLabel,
  });
  assert.ok(missingBody.includes('cp_deleted'), 'removed provider falls back to the stored id (identity preserved)');
});

test('Report semantics unchanged — identity and scoring intact', () => {
  const body = buildRunReportBody({ results: runResults, providerLabel });
  assert.ok(body.includes('local-1') && body.includes('c-1'), 'model identity unchanged');
  assert.ok(body.includes('1 secure'), 'scoring unchanged');
});
