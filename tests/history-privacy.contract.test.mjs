import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installLocalStorage } from './helpers/dom.mjs';

installLocalStorage();

const { summarizeAuditRecord } = await import('../src/utils/audit-record.js');

const SENSITIVE = {
  id: 'run-1',
  timestamp: Date.now(),
  model: 'm',
  provider: 'cp_x',
  details: [{
    testName: 'Probe',
    techniqueId: 'AML.T0034',
    tactic: 'Execution',
    model: 'm',
    provider: 'cp_x',
    status: 'VULNERABLE',
    systemPrompt: 'TOP-SECRET system gate',
    userPrompt: 'malicious payload',
    response: 'leaked model output',
    reasoning: 'judge reasoning trace',
  }],
};

test('Summaries keep verdicts and metadata', () => {
  const summarized = summarizeAuditRecord(SENSITIVE);
  assert.equal(summarized.details[0].status, 'VULNERABLE', 'verdict survives');
  assert.equal(summarized.details[0].testName, 'Probe', 'non-sensitive metadata survives');
  assert.equal(summarized.details[0].techniqueId, 'AML.T0034');
  assert.equal(summarized.id, 'run-1');
});

test('Prompts and model responses are NOT persisted in unencrypted history', () => {
  const summarized = summarizeAuditRecord(SENSITIVE);
  const d = summarized.details[0];
  assert.equal(d.systemPrompt, undefined, 'prompts are NOT persisted');
  assert.equal(d.userPrompt, undefined, 'prompts are NOT persisted');
  assert.equal(d.response, undefined, 'model responses/evidence are NOT persisted');
  assert.equal(d.reasoning, undefined, 'reasoning is NOT persisted');
  // A reload round-trip through storage cannot reconstruct sensitive evidence.
  localStorage.setItem('atlas_audit_history', JSON.stringify([summarized]));
  const reloaded = JSON.parse(localStorage.getItem('atlas_audit_history'));
  const rd = reloaded[0].details[0];
  assert.equal(rd.systemPrompt, undefined);
  assert.equal(rd.userPrompt, undefined);
  assert.equal(rd.response, undefined);
  assert.equal(rd.reasoning, undefined);
  assert.equal(rd.status, 'VULNERABLE', 'verdict/status survive reload');
});

test('History UI distinguishes policy-withheld evidence from absent evidence', async () => {
  const { readFileSync } = await import('node:fs');
  const { dirname, join } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const modal = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/components/modals/AuditDetailModal.jsx'), 'utf8');
  assert.ok(modal.includes('Detailed evidence not stored in unencrypted history.'), 'policy wording present');
  // The distinction rides the existing passphrase flag — no sensitive state added.
  assert.ok(modal.includes('(vaultPassphraseSet ?? false)'), 'wording keys off the existing vault flag');
  assert.ok(!modal.includes('d.systemPrompt ||'), 'no bare (none) fallback that implies missing evidence');
});
