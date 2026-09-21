// Unit contract for the suite-integrity checker: naming, title, reference
// and reachability rules must flag violations and accept clean fixtures.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NODE_TYPES,
  ROOT_NON_TEST_ALLOWLIST,
  isCanonicalTestName,
  hasHistoricalBasename,
  stripTitlePrefix,
  extractTitles,
  findTitleViolations,
  extractTestRefs,
  parseNpmTestPatterns,
  runChecks,
} from '../scripts/check-suite-integrity.mjs';

const PACKAGE_JSON = JSON.stringify({
  scripts: { test: 'node --test "tests/*.unit.test.mjs" "tests/*.integration.test.mjs" "tests/*.behavior.test.mjs" "tests/*.contract.test.mjs"' },
});

const baseArgs = () => ({
  testFiles: ['provider-delete.behavior.test.mjs', 'vault.integration.test.mjs', 'read-only-mode.browser.test.mjs'],
  testSources: {
    'provider-delete.behavior.test.mjs': "test('Deletion requires explicit confirmation', () => {});",
    'vault.integration.test.mjs': "test('SaveVault persists providers', () => {});",
    'read-only-mode.browser.test.mjs': "test('read-only mode locks settings', () => {});",
  },
  packageJsonSource: PACKAGE_JSON,
  runnerSource: "readdirSync(join(root, 'tests')) // discovers tests/*.browser.test.mjs\n['node', ['tests/browser-smoke.mjs']]",
  exploratorySuites: [{ name: 'acceptance', file: 'tests/exploratory/acceptance.mjs' }],
  exploratorySources: {
    'acceptance.mjs': "import { chromium } from 'playwright';",
    'dialog-ledger.mjs': "export const dialogLedger = [];\n// imported by exploration-inventory.mjs",
    'exploration-inventory.mjs': "await import('./dialog-ledger.mjs');",
  },
  rootFiles: ['provider-delete.behavior.test.mjs', 'browser-smoke.mjs', 'ui-workflows.mjs'],
});

test('canonical names accept every durable type and reject ad-hoc shapes', () => {
  for (const type of [...NODE_TYPES, 'browser']) {
    assert.ok(isCanonicalTestName(`catalog-persistence.${type}.test.mjs`), type);
  }
  assert.ok(!isCanonicalTestName('catalog-persistence-failure.test.mjs'));
  assert.ok(!isCanonicalTestName('catalog-persistence.test.mjs'));
  assert.ok(!isCanonicalTestName('Catalog-Persistence.unit.test.mjs'));
});

test('historical basenames are flagged without catching domain words', () => {
  for (const name of ['t05-context.contract.test.mjs', 'provider-port.test.mjs', 'ai-gaps.unit.test.mjs', 'pes-dialog-probes.mjs', 'eat-output.mjs', 'state-consolidation.contract.test.mjs']) {
    assert.ok(hasHistoricalBasename(name), name);
  }
  for (const name of ['transport-boundaries.unit.test.mjs', 'report-composition.contract.test.mjs', 'proxy-imports.contract.test.mjs', 'provider-delete.behavior.test.mjs']) {
    assert.ok(!hasHistoricalBasename(name), name);
  }
});

test('provenance title prefixes strip while behavior-led titles survive', () => {
  assert.equal(stripTitlePrefix('T04-POST-A2: The dialog renders'), 'The dialog renders');
  assert.equal(stripTitlePrefix(`${['PES', '007'].join('-')}: Confirm exposes a dialog landmark`), 'Confirm exposes a dialog landmark');
  assert.equal(stripTitlePrefix('LINT-POST-A1: The hook keeps its guard'), 'The hook keeps its guard');
  assert.equal(stripTitlePrefix('R1.1: The module exists'), 'The module exists');
  assert.equal(stripTitlePrefix('acceptance grep: One definition site remains'), 'One definition site remains');
  assert.equal(stripTitlePrefix('Deletion requires explicit confirmation'), 'Deletion requires explicit confirmation');
  assert.equal(stripTitlePrefix('parseJSONObject recovers a fenced object'), 'parseJSONObject recovers a fenced object');
});

test('title extraction skips template literals and honors escapes', () => {
  const source = [
    "test('Plain title', () => {});",
    'test("It handles \\"quoted\\" words", () => {});',
    'test(`Dynamic ${name} title`, () => {});',
    'describe(\'Suite name\', () => {});',
    'test spanning (',
    "'two lines', () => {});",
  ].join('\n');
  assert.deepEqual(extractTitles(source), ['Plain title', 'It handles \\"quoted\\" words', 'Suite name']);
});

// Fixture titles/paths are assembled so the checker's self-scan of this
// file never sees a literal violation.
const historyTitle = ['T08', 'POST: The hook owns state'].join('-');
const historySource = `test('${historyTitle}', () => {});`;
const missingRef = ['tests', 'does-not-exist.test.mjs'].join('/');

test('title violations report only prefixed titles', () => {
  assert.deepEqual(findTitleViolations(historySource), [historyTitle]);
  assert.deepEqual(findTitleViolations("test('The hook owns state', () => {});"), []);
});

test('test references extract quoted and bare tests/ paths', () => {
  const source = "const a = readSource('tests/catalog-actions.contract.test.mjs');\n// see tests/vault.integration.test.mjs for the vault shape\nconst b = `tests/${name}`;";
  assert.deepEqual(extractTestRefs(source).sort(), ['tests/catalog-actions.contract.test.mjs', 'tests/vault.integration.test.mjs']);
});

test('npm test patterns cover the four Node types and nothing else', () => {
  const patterns = parseNpmTestPatterns(PACKAGE_JSON);
  assert.ok(patterns.some((pattern) => pattern.test('tests/vault.integration.test.mjs')));
  assert.ok(!patterns.some((pattern) => pattern.test('tests/read-only-mode.browser.test.mjs')));
});

test('clean tree passes with zero failures', () => {
  assert.deepEqual(runChecks(baseArgs()), []);
});

test('non-canonical and historical filenames fail', () => {
  const args = baseArgs();
  args.testFiles = [...args.testFiles, 'provider-port.test.mjs', 't05-context.contract.test.mjs'];
  args.testSources['provider-port.test.mjs'] = "test('Policy holds', () => {});";
  args.testSources['t05-context.contract.test.mjs'] = "test('Context adopts', () => {});";
  const failures = runChecks(args);
  assert.ok(failures.some((failure) => failure.includes('provider-port.test.mjs')), failures.join('\n'));
  assert.ok(failures.some((failure) => failure.includes('t05-context.contract.test.mjs')), failures.join('\n'));
});

test('Node test outside npm test patterns is an orphan failure', () => {
  const args = baseArgs();
  args.packageJsonSource = JSON.stringify({ scripts: { test: 'node --test "tests/*.unit.test.mjs"' } });
  const failures = runChecks(args);
  assert.ok(failures.some((failure) => failure.includes('vault.integration.test.mjs') && failure.includes('npm test')), failures.join('\n'));
});

test('browser test without runner coverage is an orphan failure', () => {
  const args = baseArgs();
  args.runnerSource = "['node', ['tests/browser-smoke.mjs']]";
  const failures = runChecks(args);
  assert.ok(failures.some((failure) => failure.includes('read-only-mode.browser.test.mjs') && failure.includes('test:browser')), failures.join('\n'));
});

test('unregistered exploratory executable and stale references fail', () => {
  const args = baseArgs();
  args.exploratorySources['rogue-harness.mjs'] = "import { chromium } from 'playwright';";
  args.testSources['vault.integration.test.mjs'] = `readSource('${missingRef}');`;
  const failures = runChecks(args);
  assert.ok(failures.some((failure) => failure.includes('rogue-harness.mjs')), failures.join('\n'));
  assert.ok(failures.some((failure) => failure.includes('does-not-exist.test.mjs')), failures.join('\n'));
});

test('root allowlist covers the justified non-test executables', () => {
  for (const file of ['browser-smoke.mjs', 'browser-e2e.mjs', 'ui-workflows.mjs', 'mock-ollama.mjs', 'endpoint-policy-benchmark.mjs']) {
    assert.ok(ROOT_NON_TEST_ALLOWLIST.has(file), file);
  }
  const args = baseArgs();
  args.rootFiles = [...args.rootFiles, 'mystery-runner.mjs'];
  const failures = runChecks(args);
  assert.ok(failures.some((failure) => failure.includes('mystery-runner.mjs')), failures.join('\n'));
});
