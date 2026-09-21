// Strict diagnostic projection at production console sinks.
//
// These tests drive REAL production failure paths (a batched source-analysis
// chunk failure and a provider connection-test failure) and assert that a fake
// unknown-prefix 16-char token, a 24-char token, and a canonical provider token
// never reach the captured console output, while ordinary diagnostic prose and
// the useful category/status survive. No external network traffic.
import './helpers/source-loader.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import React, { act, useLayoutEffect } from 'react';
import { mountComponent } from './helpers/react-harness.mjs';
import { expectConsoleWarn, expectConsoleError } from './helpers/expected-console.mjs';
import { installFakeIndexedDB, installLocalStorage } from './helpers/dom.mjs';

installLocalStorage();

const { analyzeSourcesWithAI } = await import('../src/utils/ai-analyzer.js');

const CATALOG = 'AML.T1 | Some technique';
const SHORT_16 = 'AbCdEfGhIjKlMnOp';        // 16-char unknown-prefix token
const SHORT_24 = 'QrStUvWxYz0123456789ab';  // 24-char unknown-prefix token
const CANONICAL = 'sk-probe-1234567890';    // canonical provider token

test('batched source-analysis chunk failure strictly scrubs tokens while keeping prose', async t => {
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(`gateway rejected key ${SHORT_16} and ${SHORT_24} and ${CANONICAL}. Authentication failed (HTTP 401): the key could not be verified.`);
    });
  });
  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => new Promise((res, rej) => server.close((e) => (e ? rej(e) : res()))));
  const judge = { provider: 'mock', model: 'm', endpoint: `http://localhost:${server.address().port}/v1/chat/completions`, apiKey: 'k', allowPrivate: true };

  let profiles;
  const captured = await expectConsoleWarn('Batched source analysis failed for a chunk', async () => {
    profiles = await analyzeSourcesWithAI(judge, [{ title: 'S1', excerpt: 'x' }], CATALOG, undefined, 1, '', null, 2048);
  });
  assert.deepEqual(profiles, [null]);
  const text = captured.map((args) => args.map(String).join(' ')).join('\n');

  assert.match(text, /Batched source analysis failed for a chunk/, 'the category prefix survives');
  assert.match(text, /Authentication failed \(HTTP 401\)/, 'ordinary prose survives');
  assert.doesNotMatch(text, new RegExp(SHORT_16), 'the 16-char unknown-prefix token is scrubbed');
  assert.doesNotMatch(text, new RegExp(SHORT_24), 'the 24-char unknown-prefix token is scrubbed');
  assert.doesNotMatch(text, new RegExp(CANONICAL), 'the canonical provider token is scrubbed');
  assert.match(text, /\[REDACTED_TOKEN\]/, 'the short-token placeholder is present');
});

test('provider connection-test failure strictly scrubs tokens from the console error', async t => {
  const db = installFakeIndexedDB();
  db.reset();
  const { ProvidersProvider, useProviders } = await import('../src/context/ProvidersContext.jsx');
  const { saveVault } = await import('../src/utils/vault.js');

  const saved = { id: 'public', name: 'Public', connector: 'openai', endpoint: 'https://provider.example/v1', models: [], apiKey: 'test-key' };
  await saveVault({ providers: [saved] });

  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'warn', () => {});
  t.mock.method(globalThis, 'fetch', async () =>
    new Response(`{"error":"gateway rejected ${SHORT_16}"}`, { status: 500, headers: { 'content-type': 'application/json' } }));

  let ctx;
  function Probe() { const value = useProviders(); useLayoutEffect(() => { ctx = value; }); return null; }
  function Harness() { return React.createElement(ProvidersProvider, null, React.createElement(Probe)); }
  await mountComponent(t, Harness);

  const draft = { ...saved, id: 'draft' };
  const captured = await expectConsoleError('[handleProviderTest] Error', async () => {
    await act(async () => {
      try { await ctx.handleProviderTest(draft, 'draft'); } catch { /* expected: the draft test rethrows after setting state */ }
    });
  });

  const text = captured.map((args) => args.map(String).join(' ')).join('\n');
  assert.match(text, /\[handleProviderTest\] Error/, 'the console error is emitted with its category prefix');
  assert.doesNotMatch(text, new RegExp(SHORT_16), 'the unknown-prefix token is scrubbed from the console error');
  assert.match(text, /\[REDACTED_TOKEN\]/, 'the short-token placeholder is present');
  assert.equal(ctx.providerTest.draft.status, 'error', 'the inline status still records the failure');
});
