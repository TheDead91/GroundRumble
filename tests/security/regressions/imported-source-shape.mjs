// Imported research-source shape regression.
//
// A crafted research-sources section can no longer persist entries of arbitrary
// shape. The restore boundary canonicalizes render-relevant source fields to
// strings before any write, rejects a whole non-object record explicitly (never
// silently dropped), and still cannot smuggle a network-policy bypass — every
// source fetch goes through assertPublicSourceUrl/redirectFollowPolicy.
//
// All network access is replaced by a deterministic in-process stub; NOTHING in
// this file performs real I/O. No production file is modified.
//
// Run: node --test tests/security/regressions/imported-source-shape.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { openBackup } from '../../../src/utils/backup.js';
import { fetchSourceExcerpt } from '../../../src/utils/api/atlas-sync.js';

const repoFile = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');

// --- deterministic transport stub -----------------------------------------

const calls = [];
let savedFetch = null;

const installStub = () => {
  calls.length = 0;
  if (savedFetch == null) savedFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    calls.push({ url: String(input) });
    return new Response('stub body', { status: 200, headers: { 'content-type': 'text/plain' } });
  };
};

const restoreStub = () => {
  if (savedFetch != null) { globalThis.fetch = savedFetch; savedFetch = null; }
};

// A crafted entry set: a repairable object plus whole records that cannot be
// normalized without inventing product meaning (null, a number, a string).
const CRAFTED_SOURCES = [
  { id: 's1', kind: 'url', enabled: true, url: { toString: 'nope' }, title: {}, description: [] },
  null,
  42,
  'not-an-entry'
];

const craftedBundle = (sourcesValue) => ({
  app: 'groundrumble',
  version: 1,
  exportedAt: '2026-09-19T00:00:00.000Z',
  data: {
    'atlas_ai_gen_urls': sourcesValue,
    // A malformed custom test, to show the test-bearing section is still
    // normalized via the existing importer contract.
    'atlas_custom_tests': JSON.stringify([{ name: 'missing everything else' }])
  }
});

test('a whole non-object source record rejects the restore before persistence', async () => {
  const sourcesValue = JSON.stringify(CRAFTED_SOURCES);
  await assert.rejects(
    () => openBackup(craftedBundle(sourcesValue), 'test-passphrase'),
    /Research source entry 2 .* must be an object\./,
    'the null entry makes candidate construction fail'
  );
});

test('a malformed field is canonically coerced instead of reaching React as an object child', async () => {
  const sourcesValue = JSON.stringify([CRAFTED_SOURCES[0]]);
  const opened = await openBackup(craftedBundle(sourcesValue), 'test-passphrase');

  const entries = JSON.parse(opened.data['atlas_ai_gen_urls']);
  assert.equal(typeof entries[0].title, 'string', 'non-string title is coerced');
  assert.equal(typeof entries[0].description, 'string', 'non-string description is coerced');
  assert.equal(typeof entries[0].url, 'string', 'non-string url is coerced');

  // The app renders source fields as React children in exactly this form.
  const wizard = repoFile('src/components/modals/AiGenWizardModal.jsx');
  const testsView = repoFile('src/components/views/TestsView.jsx');
  const expression = "s.title || s.url || 'Untitled source'";
  assert.ok(wizard.includes(`{${expression}}`), 'AiGenWizardModal renders the source label expression');
  assert.ok(testsView.includes(`title: ${expression}`), 'TestsView builds the custom-source row title from it');

  // The normalized fields are plain strings, so the render expression no longer
  // throws. (A raw object still would — the mechanism was real.)
  const safe = entries[0];
  assert.doesNotThrow(
    () => renderToStaticMarkup(createElement('span', null, safe.title || safe.url || 'Untitled source')),
    'the previously crashing expression now renders a string'
  );
});

test('imported sources cannot smuggle a network-policy bypass (transport closed)', async () => {
  installStub();
  try {
    // Every reject below happens inside assertPublicSourceUrl, before any request.
    await assert.rejects(() => fetchSourceExcerpt('http://127.0.0.1:11434/v1/models', 1000, undefined), /private, local, or reserved/);
    await assert.rejects(() => fetchSourceExcerpt('http://169.254.169.254/latest/meta-data/', 1000, undefined), /private, local, or reserved/);
    await assert.rejects(() => fetchSourceExcerpt('file:///etc/passwd', 1000, undefined), /HTTP or HTTPS/);
    await assert.rejects(() => fetchSourceExcerpt('javascript:alert(1)', 1000, undefined), /HTTP or HTTPS/);
    // A DNS name cannot be proven public from the browser, so it is refused unless
    // the guarded proxy is enabled or the request explicitly approves private hosts.
    await assert.rejects(() => fetchSourceExcerpt('https://attacker.example/report', 1000, undefined), /cannot be proven public/);

    assert.equal(calls.length, 0, 'no source request reached the transport');
  } finally {
    restoreStub();
  }
});