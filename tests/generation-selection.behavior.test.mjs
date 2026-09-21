import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {
  selectTechniqueCatalog, generateTestsWithAI, critiqueGeneratedTests,
  TECHNIQUE_CATALOG_BUDGET,
} from '../src/utils/ai-generator.js';
import { BUNDLED_ATLAS_MATRIX } from '../src/data/atlas-bundled.js';

globalThis.localStorage = {
  getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {},
};

const fullCatalog = BUNDLED_ATLAS_MATRIX
  .flatMap((t) => (t.techniques || []).map((tech) => `${tech.id} | ${tech.name} | ${t.name}`))
  .join('\n');
const allIds = BUNDLED_ATLAS_MATRIX.flatMap((t) => (t.techniques || []).map((tech) => tech.id));
// Techniques past the 4000-char head-truncation boundary (selection must not drop them).
const beyondBoundary = allIds.filter((id) => !fullCatalog.slice(0, 4000).includes(id));
assert.ok(beyondBoundary.length > 0, 'precondition: the bundled matrix overflows the budget');

test('Profile-required techniques near/outside the old boundary survive selection', () => {
  const required = new Set([beyondBoundary[0], beyondBoundary[1], allIds[0]]);
  const selected = selectTechniqueCatalog(fullCatalog, required);
  for (const id of required) {
    assert.ok(selected.split('\n').some((line) => line.startsWith(`${id} |`)), `${id} available to generation/critique`);
  }
  assert.ok(selected.length <= TECHNIQUE_CATALOG_BUDGET + 100, 'token budget respected');
});

test('Without required ids selection matches the previous head-truncation', () => {
  const a = selectTechniqueCatalog(fullCatalog, null);
  const b = selectTechniqueCatalog(fullCatalog, new Set());
  const c = selectTechniqueCatalog(fullCatalog);
  assert.equal(a, b, 'null and empty required sets agree');
  assert.equal(a, c, 'missing required set agrees');
  assert.ok(a.startsWith(fullCatalog.split('\n')[0]), 'head-truncation order preserved');
  assert.ok(a.length <= TECHNIQUE_CATALOG_BUDGET + 100, 'budget respected');
  assert.ok(!a.includes(beyondBoundary[0]), 'old boundary behavior documented: no prioritization without required ids');
});

test('Unknown required ids degrade gracefully', () => {
  const selected = selectTechniqueCatalog(fullCatalog, new Set(['AML.T9999']));
  assert.ok(selected.length > 0, 'catalog still produced');
  assert.ok(selected.length <= TECHNIQUE_CATALOG_BUDGET + 100);
});

// ── end-to-end through the author/critic prompts ────────────────────────────

const seen = [];
let content = '[]';
const server = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    seen.push(JSON.parse(raw));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content } }] }));
  });
});
await new Promise((resolve) => server.listen(0, resolve));
const judge = { provider: 'mock', model: 'm', endpoint: `http://localhost:${server.address().port}/v1/chat/completions`, apiKey: 'k', allowPrivate: true };
after(() => server.close());

test('The author system instruction carries profile-required boundary ids', async () => {
  seen.length = 0;
  content = JSON.stringify({ tests: [{ name: 'A', userPrompt: 'p', techniqueId: beyondBoundary[0] }] });
  const required = new Set([beyondBoundary[0]]);
  const { tests } = await generateTestsWithAI(judge, {
    sourcesText: 'src', profilesText: 'profiles', techniqueCatalog: fullCatalog,
    existingCoverage: 'None', count: 1, profileTechniqueIds: required,
    validTechniqueIds: new Set(allIds),
  });
  assert.equal(tests.length, 1);
  const systemTexts = seen.map((b) => JSON.stringify(b)).join('\n');
  assert.ok(systemTexts.includes(beyondBoundary[0]), 'boundary profile technique present in the author prompt');
});

test('The critic catalog carries candidate boundary ids', async () => {
  seen.length = 0;
  content = JSON.stringify({ tests: [{ name: 'A', userPrompt: 'p', techniqueId: beyondBoundary[1] }] });
  const candidates = [{ name: 'A', userPrompt: 'p', techniqueId: beyondBoundary[1] }];
  const out = await critiqueGeneratedTests(judge, candidates, {
    techniqueCatalog: fullCatalog, existingCoverage: 'None', count: 1,
    profileTechniqueIds: new Set([beyondBoundary[1]]),
    validTechniqueIds: new Set(allIds),
  });
  assert.equal(out.length, 1);
  const promptTexts = seen.map((b) => JSON.stringify(b)).join('\n');
  assert.ok(promptTexts.includes(beyondBoundary[1]), 'boundary candidate technique present in the critic prompt');
});
