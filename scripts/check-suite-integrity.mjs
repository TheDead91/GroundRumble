// Suite-integrity check: prevents future orphan or misclassified tests.
//
// Convention over manifest:
// - tests/*.unit|integration|behavior|contract.test.mjs must be reachable
//   from `npm test` (patterns parsed from package.json).
// - tests/*.browser.test.mjs must be reachable from the browser runner
//   (explicit entries or convention discovery in run-browser-tests.mjs).
// - Executable tests/exploratory/*.mjs files must be registered in the
//   exploratory catalog (EXPLORATORY_SUITES in run-exploratory.mjs);
//   non-executable exploratory modules must be imported by another one.
// - Non-test executables at tests/ root are limited to a justified allowlist.
// - Canonical basenames and test titles must not carry historical provenance
//   labels (PES/EAT/Txx/port/gaps/...); concise traceability comments are
//   out of scope for this check by design.
// - Every tests/<path> reference in tests and scripts must resolve.
//
// Usage: npm run test:integrity (also runs inside npm run release:check
// and the CI verify job). Deterministic, no browser, no network.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export const NODE_TYPES = ['unit', 'integration', 'behavior', 'contract'];
export const CANONICAL_TEST_PATTERN = /^[a-z0-9-]+\.(unit|integration|behavior|contract|browser)\.test\.mjs$/;

// Root-level .mjs files that are intentionally not *.test.mjs:
// browser scenario harnesses (run by test:browser), the workflow manifest,
// the proxy mock helper, and the standalone performance benchmark
// (npm run test:benchmark — timing-sensitive, excluded from npm test).
export const ROOT_NON_TEST_ALLOWLIST = new Map([
  ['browser-smoke.mjs', 'required browser harness (test:browser)'],
  ['browser-e2e.mjs', 'required browser harness (test:browser)'],
  ['ui-workflows.mjs', 'required-workflow manifest (browser gate)'],
  ['mock-ollama.mjs', 'mock provider server used by proxy-end-to-end tests'],
  ['endpoint-policy-benchmark.mjs', 'standalone timing benchmark (test:benchmark)'],
]);

const HISTORICAL_BASENAME_PATTERN =
  /(^|[.-])(pes|eat)([.-]|$)|(^|[-_])t\d{2}([-_.]|$)|-port\.|_port|gaps|consolidation|exhaustion5|phase|round\d/i;

const TITLE_PREFIX_PATTERNS = [
  /^T\d+(?:-POST|-PRE|-MOD)?(?:[ -]A\d+(?:\/A\d+)*)?(?:\/T\d+(?:-POST|-PRE|-MOD)?(?:[ -]A\d+)?)*(?:\s*\([^)]*\))?:?\s+/,
  /^(?:AHM|LINT)-POST-A\d+:\s*/,
  /^PES-\d+[a-z]?(?:\/PES-\d+[a-z]?)*(?:\s*\([^)]*\))?:\s*/,
  /^R\d+\.\d+(?:\/R\d+\.\d+)?:\s*/,
  /^(?:acceptance grep|preservation):\s*/,
];

export function isCanonicalTestName(basename) {
  return CANONICAL_TEST_PATTERN.test(basename);
}

export function hasHistoricalBasename(basename) {
  return HISTORICAL_BASENAME_PATTERN.test(basename);
}

export function stripTitlePrefix(title) {
  for (const pattern of TITLE_PREFIX_PATTERNS) {
    const next = title.replace(pattern, '');
    if (next !== title && next.length > 0) return next;
  }
  return title;
}

// Single-line test()/describe() title literals with escape-aware quote scan.
// Template literals are skipped (they may span lines or embed expressions).
export function extractTitles(source) {
  const titles = [];
  for (const line of source.split('\n')) {
    const match = line.match(/\b(?:test|describe)\(\s*(['"])/);
    if (!match) continue;
    const quote = match[1];
    const start = match.index + match[0].length - 1;
    let i = start + 1;
    let closed = -1;
    while (i < line.length) {
      if (line[i] === '\\') { i += 2; continue; }
      if (line[i] === quote) { closed = i; break; }
      i += 1;
    }
    if (closed > start) titles.push(line.slice(start + 1, closed));
  }
  return titles;
}

export function findTitleViolations(source) {
  return extractTitles(source).filter((title) => stripTitlePrefix(title) !== title);
}

export function extractTestRefs(source) {
  const refs = new Set();
  for (const match of source.matchAll(/tests\/[A-Za-z0-9_./-]+\.mjs\b/g)) {
    refs.add(match[0]);
  }
  return [...refs];
}

function globToRegExp(glob) {
  return new RegExp(`^${glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')}$`);
}

export function parseNpmTestPatterns(packageJsonSource) {
  const scripts = JSON.parse(packageJsonSource).scripts;
  const testScript = scripts.test;
  const patterns = [...testScript.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  return patterns.map(globToRegExp);
}

export function runChecks({ testFiles, testSources, packageJsonSource, runnerSource, exploratorySuites, exploratorySources, rootFiles }) {
  const failures = [];
  const patterns = parseNpmTestPatterns(packageJsonSource);
  const nodeFiles = testFiles.filter((file) => NODE_TYPES.some((type) => file.endsWith(`.${type}.test.mjs`)));
  const browserFiles = testFiles.filter((file) => file.endsWith('.browser.test.mjs'));

  for (const file of testFiles) {
    if (!isCanonicalTestName(file)) {
      failures.push(`${file}: filename is not <domain>.<unit|integration|behavior|contract|browser>.test.mjs`);
    }
    if (hasHistoricalBasename(file)) {
      failures.push(`${file}: filename carries a historical provenance label`);
    }
  }
  for (const file of nodeFiles) {
    const candidate = `tests/${file}`;
    if (!patterns.some((pattern) => pattern.test(candidate))) {
      failures.push(`${file}: durable Node test is not reachable from \`npm test\``);
    }
  }
  const runnerCoversDiscovery = runnerSource.includes('.browser.test.mjs');
  for (const file of browserFiles) {
    const literal = `tests/${file}`;
    if (!runnerSource.includes(literal) && !runnerCoversDiscovery) {
      failures.push(`${file}: durable browser test is not reachable from \`npm run test:browser\``);
    }
  }
  for (const file of rootFiles) {
    if (file.endsWith('.test.mjs')) continue;
    if (!file.endsWith('.mjs')) continue;
    if (!ROOT_NON_TEST_ALLOWLIST.has(file)) {
      failures.push(`tests/${file}: root executable is not a canonical test and has no justified entry point`);
    }
    if (hasHistoricalBasename(file)) {
      failures.push(`tests/${file}: filename carries a historical provenance label`);
    }
  }
  for (const [file, source] of Object.entries(testSources)) {
    for (const title of findTitleViolations(source)) {
      failures.push(`${file}: test title carries a historical provenance prefix: ${title.slice(0, 80)}`);
    }
    for (const ref of extractTestRefs(source)) {
      if (!existsInTree(ref)) {
        failures.push(`${file}: stale reference to ${ref}`);
      }
    }
  }
  const exploratoryNames = new Set(Object.keys(exploratorySources));
  for (const entry of exploratorySuites) {
    const base = entry.file.replace(/^tests\/exploratory\//, '');
    if (!exploratoryNames.has(base)) {
      failures.push(`${entry.file}: exploratory catalog entry does not resolve to a file`);
    }
    if (hasHistoricalBasename(base)) {
      failures.push(`${entry.file}: filename carries a historical provenance label`);
    }
  }
  for (const [base, source] of Object.entries(exploratorySources)) {
    const isExecutable = source.includes('playwright') || source.includes('process.argv');
    if (isExecutable) {
      const registered = exploratorySuites.some((entry) => entry.file === `tests/exploratory/${base}`);
      if (!registered) failures.push(`tests/exploratory/${base}: exploratory executable has no catalog entry (unreachable from \`npm run test:exploratory\`)`);
    } else {
      const imported = Object.entries(exploratorySources).some(([other, otherSource]) =>
        other !== base && otherSource.includes(base));
      if (!imported) failures.push(`tests/exploratory/${base}: exploratory helper/data module is imported by nothing`);
    }
  }
  return failures;
}

function existsInTree(ref) {
  if (!ref.startsWith('tests/') && !ref.startsWith('scripts/')) return true;
  try {
    readFileSync(join(root, ref), 'utf8');
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const testFiles = readdirSync(join(root, 'tests')).filter((file) => file.endsWith('.test.mjs')).sort();
  const testSources = Object.fromEntries(
    testFiles.map((file) => [file, readFileSync(join(root, 'tests', file), 'utf8')]),
  );
  const rootFiles = readdirSync(join(root, 'tests')).sort();
  const packageJsonSource = readFileSync(join(root, 'package.json'), 'utf8');
  const runnerSource = readFileSync(join(root, 'scripts', 'run-browser-tests.mjs'), 'utf8');
  const { EXPLORATORY_SUITES } = await import('./run-exploratory.mjs');
  const exploratoryFiles = readdirSync(join(root, 'tests', 'exploratory')).filter((file) => file.endsWith('.mjs')).sort();
  const exploratorySources = Object.fromEntries(
    exploratoryFiles.map((file) => [file, readFileSync(join(root, 'tests', 'exploratory', file), 'utf8')]),
  );
  const failures = runChecks({ testFiles, testSources, packageJsonSource, runnerSource, exploratorySuites: EXPLORATORY_SUITES, exploratorySources, rootFiles });
  if (failures.length > 0) {
    console.error(`Suite-integrity check FAILED with ${failures.length} violation(s):`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  const nodeCount = testFiles.filter((file) => NODE_TYPES.some((type) => file.endsWith(`.${type}.test.mjs`))).length;
  const browserCount = testFiles.filter((file) => file.endsWith('.browser.test.mjs')).length;
  console.log(`Suite-integrity check passed: ${nodeCount} Node tests in \`npm test\`, ${browserCount} browser tests in \`test:browser\`, ${EXPLORATORY_SUITES.length} exploratory entries, 0 orphans.`);
}

if (process.argv[1]?.endsWith('check-suite-integrity.mjs')) {
  await main();
}
