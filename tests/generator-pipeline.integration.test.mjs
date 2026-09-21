// Coverage of the remaining ai-generator.js surface: the toTests fall-through,
// mid-flight abort handling, batching with an already-generated list, and the
// critique pass.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { parseTestPayloads, critiqueGeneratedTests, generateTestsWithAI } from '../src/utils/ai-generator.js';

globalThis.localStorage = {
  getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {}
};

test('parseTestPayloads throws for an object with no tests array', () => {
  assert.throws(() => parseTestPayloads('{"something":"else"}'), /not valid test JSON/);
});

test('parseTestPayloads returns a wrapper object tests array', () => {
  const t = parseTestPayloads('```json\n{"tests":[{"name":"A","userPrompt":"p"}]}\n```');
  assert.equal(t.length, 1);
  assert.equal(t[0].name, 'A');
});

test('parseTestPayloads returns a bare array', () => {
  const t = parseTestPayloads('[{"name":"A","userPrompt":"p"}]');
  assert.equal(t.length, 1);
});

test('parseTestPayloads salvages truncated JSON', () => {
  const t = parseTestPayloads('{"tests":[{"name":"A","userPrompt":"p"}]');
  assert.ok(t);
  assert.equal(t[0].name, 'A');
});

// ── critique pass ─────────────────────────────────────────────────────────

const validTests = [{ name: 'A', userPrompt: 'p', techniqueId: 'AML.T1' }];
let content = '[]';
const server = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content } }] }));
  });
});
await new Promise((resolve) => server.listen(0, resolve));
const judge = { provider: 'mock', model: 'm', endpoint: `http://localhost:${server.address().port}/v1/chat/completions`, apiKey: 'k', allowPrivate: true };
after(() => server.close());

test('critiqueGeneratedTests refines and validates candidates (with guidance)', async () => {
  content = JSON.stringify({ tests: validTests });
  const out = await critiqueGeneratedTests(judge, validTests, {
    techniqueCatalog: 'AML.T1 | Thing',
    existingCoverage: 'None',
    count: 5,
    guidance: 'be stricter',
    maxTokens: 4000
  });
  assert.equal(out.length, 1);
  assert.equal(out.name === 'A' ? out.name : out[0].name, 'A');
});

test('critiqueGeneratedTests works with an empty context', async () => {
  content = JSON.stringify({ tests: validTests });
  const out = await critiqueGeneratedTests(judge, validTests, undefined);
  assert.equal(out.length, 1);
});

test('critiqueGeneratedTests returns an empty list for an empty AI result', async () => {
  content = '{"tests":[]}';
  const out = await critiqueGeneratedTests(judge, validTests, {});
  assert.equal(out.length, 0);
});

test('critiqueGeneratedTests propagates a garbage response as a parse error', async () => {
  content = 'certainly not json';
  await assert.rejects(critiqueGeneratedTests(judge, validTests, {}), /not valid test JSON/);
});

// ── generation: abort + batching with an already-generated list ───────────

let generationContent = '';
let delayMs = 0;
const genServer = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    const respond = () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: generationContent } }] }));
    };
    if (delayMs) setTimeout(respond, delayMs); else respond();
  });
});
await new Promise((resolve) => genServer.listen(0, resolve));
const genJudge = { provider: 'mock', model: 'm', endpoint: `http://localhost:${genServer.address().port}/v1/chat/completions`, apiKey: 'k', allowPrivate: true };
after(() => genServer.close());

test('generateTestsWithAI aborts mid-flight with the abort reason', async () => {
  delayMs = 400;
  generationContent = JSON.stringify({ tests: validTests });
  const ac = new AbortController();
  const run = generateTestsWithAI(genJudge, {
    sourcesText: 's', techniqueCatalog: 'AML.T1 | T', count: 1, batchSize: 1, maxTokens: 1024
  }, ac.signal);
  setTimeout(() => ac.abort(), 50);
  await assert.rejects(run, (e) => e instanceof DOMException);
  delayMs = 0;
});

test('generateTestsWithAI ships distinct batches and reports progress', async () => {
  delayMs = 0;
  generationContent = JSON.stringify({ tests: validTests.map((t, i) => ({ ...t, name: `T${i}` })) });
  const progress = [];
  const { tests, failures } = await generateTestsWithAI(genJudge, {
    sourcesText: 's', techniqueCatalog: 'AML.T1 | T', existingCoverage: 'None',
    count: 2, batchSize: 1, guidance: 'strict', maxTokens: 2048
  }, undefined, (a, b) => progress.push([a, b]));
  assert.equal(tests.length, 2);
  assert.equal(failures, 0);
  assert.deepEqual(progress[0], [1, 2]);
  assert.deepEqual(progress[1], [2, 2]);
});
