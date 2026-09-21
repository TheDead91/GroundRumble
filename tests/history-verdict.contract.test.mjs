// Contract: the override-aware verdict lookups (effectiveStatus /
// effectiveDetails) have ONE definition site — src/context/HistoryContext.jsx —
// exposed as HistoryProvider context values keyed by the shared
// resultOverrideKey template, and App.jsx / ComparisonResults.jsx hold no
// local re-implementations. Behavior is byte-compatible: same override
// lookups, same falsy passthrough, same call-site wiring into the engine,
// dashboard, and report-builder paths.
//
// Sections:
//   1. Grep gate over src/ — zero `const effectiveStatus =` /
//      `const effectiveDetails =` outside HistoryContext (exact gate).
//   2. HistoryContext pins — the selector bodies keep their exact semantics and
//      ride the provider value; resultOverrideKey stays exported verbatim.
//   3. Consumer adoption pins — both consumers consume from useHistory() and
//      keep every pinned call site.
//   4. Runtime behavioral — the REAL HistoryProvider is mounted (rolldown
//      bundle under bare node --test, same technique as the pin in
//      tests/audit-history-context.contract.test.mjs) and the full
//      override-lookup contract is exercised against the live context values.
//
// RED BEFORE the definitions consolidate (they still live in the consumers);
// green after. Hermetic: no dev server, no network, no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { installFakeIndexedDB, installLocalStorage } from './helpers/dom.mjs';

installLocalStorage();

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP_PATH = 'src/App.jsx';
const CR_PATH = 'src/components/runner/ComparisonResults.jsx';
const HISTORY_CTX_PATH = 'src/context/HistoryContext.jsx';

const readSource = (relPath) => readFileSync(join(root, relPath), 'utf8').replace(/\r\n/g, '\n');
let app = '', cr = '', historyCtx = '', auditModalSrc = '', comparisonTable = '', resultKeySrc = '';
try {
  app = readSource(APP_PATH);
  cr = readSource(CR_PATH);
  historyCtx = readSource(HISTORY_CTX_PATH);
  // The audit-detail modal (which consumes resultOverrideKey and maps
  // effectiveDetails) — read tolerantly and `auditModalSrc` stays '' when
  // absent.
  try { auditModalSrc = readSource('src/components/modals/AuditDetailModal.jsx'); } catch { /* modal may be absent */ }
  try { comparisonTable = readSource('src/utils/comparison-table.js'); } catch { /* table may be absent */ }
  try { resultKeySrc = readSource('src/utils/audit-result-key.js'); } catch { /* utility may be absent */ }
} catch { /* missing files fail their first assertion */ }

const countIn = (source, re) => [...source.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'))].length;
const idx = (source, needle, from = 0) => source.indexOf(needle, from);
const valueSlice = (ctx) => {
  const start = idx(ctx, 'const value = {');
  return start < 0 ? '' : ctx.slice(start, idx(ctx, '};', start));
};

// ---------------------------------------------------------------------------
// 1. Grep gate: zero local re-implementations outside HistoryContext
// ---------------------------------------------------------------------------

test('Grep gate — `const effectiveStatus =` / `const effectiveDetails =` exist ONLY in HistoryContext across src/', () => {
  const srcDir = join(root, 'src');
  const files = readdirSync(srcDir, { recursive: true })
    .map((p) => p.split(sep).join('/'))
    .filter((p) => /\.(js|jsx)$/.test(p) && statSync(join(srcDir, p)).isFile());
  assert.ok(files.includes('context/HistoryContext.jsx'), 'the src walk sees the context directory');
  let statusSites = [];
  let detailsSites = [];
  for (const rel of files) {
    const src = readSource(join('src', rel));
    if (/const effectiveStatus = /.test(src)) statusSites.push(rel);
    if (/const effectiveDetails = /.test(src)) detailsSites.push(rel);
  }
  assert.deepEqual(statusSites, ['context/HistoryContext.jsx'], 'effectiveStatus is defined in exactly one file: HistoryContext.jsx');
  assert.deepEqual(detailsSites, ['context/HistoryContext.jsx'], 'effectiveDetails is defined in exactly one file: HistoryContext.jsx');
  assert.equal(countIn(historyCtx, /const effectiveStatus = /g), 1, 'exactly one effectiveStatus definition');
  assert.equal(countIn(historyCtx, /const effectiveDetails = /g), 1, 'exactly one effectiveDetails definition');
  assert.equal(countIn(app, /const effectiveStatus = /g), 0, 'App.jsx has no local effectiveStatus');
  assert.equal(countIn(app, /const effectiveDetails = /g), 0, 'App.jsx has no local effectiveDetails');
  assert.equal(countIn(cr, /const effectiveStatus = /g), 0, 'ComparisonResults.jsx has no local effectiveStatus');
  assert.equal(countIn(cr, /const effectiveDetails = /g), 0, 'ComparisonResults.jsx has no local effectiveDetails');
});

// ---------------------------------------------------------------------------
// 2. HistoryContext pins: the selector bodies keep their exact semantics
// ---------------------------------------------------------------------------

test('HistoryContext owns the selectors and preserves the shared key export', () => {
  assert.match(historyCtx, /const effectiveStatus = \(r\) => \(r \? \(overrides\[resultOverrideKey\(r\)\]\?\.verdict \|\| r\.status\) : r\);/,
    'effectiveStatus keeps the exact override-wins + falsy-passthrough expression');
  assert.match(historyCtx, /const effectiveDetails = \(d\) => \{\n\s*const o = overrides\[resultOverrideKey\(d\)\];\n\s*return o \? \{ \.\.\.d, status: o.verdict, overrideReason: o.reason \} : d;\n\s*\};/,
    'effectiveDetails keeps the exact copy-on-override body');
  const keyHomes = historyCtx + '\n' + resultKeySrc;
  assert.equal(countIn(keyHomes, /(?:export )?const resultOverrideKey = \(r\) => `\$\{r\.auditId \|\| r\.timestamp\}-\$\{r\.targetUid\}-\$\{r\.testId\}`;/g), 1,
    'the shared key template has exactly one implementation across HistoryContext and its extracted utility');
  assert.match(historyCtx, /export const resultOverrideKey =|export \{ resultOverrideKey \};/,
    'HistoryContext preserves its public resultOverrideKey export before and after extraction');
});

test('The selectors are exposed as HistoryProvider context values', () => {
  const valueBlock = valueSlice(historyCtx);
  assert.ok(valueBlock.length > 0, 'HistoryProvider builds a value object');
  assert.match(valueBlock, /\beffectiveStatus\b/, 'the provider value exposes effectiveStatus');
  assert.match(valueBlock, /\beffectiveDetails\b/, 'the provider value exposes effectiveDetails');
  const defs = ['effectiveStatus', 'effectiveDetails'].map((name) => idx(historyCtx, `const ${name} = `));
  const valueStart = idx(historyCtx, 'const value = {');
  assert.ok(defs.every((d) => d >= 0 && d < valueStart), 'both selectors are defined inside the provider, before the value object');
  assert.match(historyCtx, /const \[overrides, setOverrides\] = useState\(/, 'the selectors still close over the provider-owned overrides state');
});

test('App drops the duplicated helper block (net-smaller mechanism)', () => {
  assert.doesNotMatch(app, /single definition site for override-aware verdict lookups/, 'the App-side helper comment block is gone (it lives with the definition now)');
  assert.doesNotMatch(app, /\(r \? \(overrides\[resultOverrideKey\(r\)\] \|\| r\.status\) : r\)/, 'no inlined copy of the effectiveStatus expression remains in App');
  assert.doesNotMatch(app, /o \? \{ \.\.\.d, status: o \} : d/, 'no inlined copy of the effectiveDetails body remains in App');
});

// ---------------------------------------------------------------------------
// 3. Consumer anchors: consumers consume from the context; every call site
// keeps its exact shape
// ---------------------------------------------------------------------------

test('App consumes the selectors from useHistory() and keeps its wiring', () => {
  assert.match(app, /= useHistory\(\)/, 'App still drives history state through useHistory()');
  const destructureStart = idx(app, '= useHistory()');
  const destructure = app.slice(Math.max(0, destructureStart - 900), destructureStart);
  assert.match(destructure, /\beffectiveStatus\b/, 'App destructures effectiveStatus from useHistory()');
  assert.match(destructure, /\beffectiveDetails\b/, 'App destructures effectiveDetails from useHistory()');
  // The audit-detail modal — App's only resultOverrideKey consumer — lives in
  // src/components/modals/AuditDetailModal.jsx; the shared key template import
  // resolves across App ∪ modal (App-side or modal-side).
  assert.match(app + '\n' + auditModalSrc, /import \{[^}]*resultOverrideKey[^}]*\} from '[^']*HistoryContext';/, 'the shared key template stays imported from HistoryContext');
  const depsStart = idx(app, '= useAuditRun({');
  assert.ok(depsStart > 0, 'App drives the engine through useAuditRun');
  const deps = app.slice(depsStart, depsStart + 1200);
  const s = idx(deps, 'effectiveStatus,');
  const d = idx(deps, 'effectiveDetails,');
  assert.ok(s > 0 && d > s, 'useAuditRun still receives effectiveStatus then effectiveDetails');
  assert.match(app, /effectiveDetails=\{effectiveDetails\}/, 'DashboardView still receives the effectiveDetails prop');
  // printRunReport lives in src/hooks/useAuditDetail.js — the mapping call
  // site resolves across App ∪ hook, exactly once across the union.
  let auditDetailHookSrc = '';
  try { auditDetailHookSrc = readSource('src/hooks/useAuditDetail.js'); } catch { /* hook may be absent */ }
  assert.equal(
    countIn(app + '\n' + auditDetailHookSrc, /buildRunReportBody\(\{ results: results\.map\(effectiveDetails\), title, subtitle, meta, providerLabel \}\)/),
    1,
    'printable report still maps effectiveDetails at the call site (exactly once across App ∪ useAuditDetail)'
  );
  // The audit-detail derivation lives in
  // src/components/modals/AuditDetailModal.jsx — the mapping resolves across
  // App ∪ modal.
  assert.ok(countIn(app + '\n' + auditModalSrc, /\(selectedAudit\.details \|\| \[\]\)\.map\(effectiveDetails\)/) >= 1, 'audit-detail rendering still maps effectiveDetails (App-side pre-T02, AuditDetailModal.jsx after)');
});

test('ComparisonResults consumes the selectors from useHistory() and keeps its wiring', () => {
  assert.match(cr, /= useHistory\(\)/, 'ComparisonResults still reads history state through useHistory()');
  const destructureStart = idx(cr, '= useHistory()');
  const destructure = cr.slice(Math.max(0, destructureStart - 400), destructureStart);
  assert.match(destructure, /\beffectiveStatus\b/, 'ComparisonResults destructures effectiveStatus from useHistory()');
  assert.match(destructure, /\beffectiveDetails\b/, 'ComparisonResults destructures effectiveDetails from useHistory()');
  assert.match(destructure, /\boverrides\b/, 'ComparisonResults keeps the overrides map for the override-button states');
  const decisionSurface = cr + '\n' + comparisonTable;
  assert.match(decisionSurface, /\['ERROR', 'EMPTY', 'INCONCLUSIVE'\]\.includes\(effectiveStatus\(c\)\)|classifyComparisonRows/, 'group classification remains override-aware');
  assert.match(decisionSurface, /statusWeight\(effectiveStatus\(r\)\) < statusWeight\(effectiveStatus\(acc\)\)|selectWorstResult/, 'worst-row selection remains override-aware');
  assert.match(cr, /const effStatus = effectiveStatus\(res\);/);
  assert.match(cr, /printRunReport\(results\.map\(effectiveDetails\), \{/, 'download-report path still maps effectiveDetails');
  assert.match(decisionSurface, /const modelResults = results\.map\(effectiveDetails\)\.filter\(r => r\.targetUid === t\.uid\);|summarizeModelResults/, 'per-model summary path still maps effectiveDetails');
  assert.match(cr, /import \{ useHistory, resultOverrideKey \} from '\.\.\/\.\.\/context\/HistoryContext';/, 'the shared key template stays imported from HistoryContext');
});

// ---------------------------------------------------------------------------
// 4. Runtime behavioral: the REAL HistoryProvider, mounted, exposes selectors
//    that meet the exact characterized contract
// ---------------------------------------------------------------------------

let ctxBundle = null;
let ctxBundleError = null;
try {
  const { rolldown } = await import('rolldown');
  const dir = join(root, '.tmp', 't01-selectors-bundle');
  mkdirSync(dir, { recursive: true });
  const abs = (p) => join(root, p).split(sep).join('/');
  const entry = join(dir, 'entry.mjs');
  writeFileSync(entry, [
    `export { UIProvider } from '${abs('src/context/UIContext.jsx')}';`,
    `export { ProvidersProvider } from '${abs('src/context/ProvidersContext.jsx')}';`,
    `export { HistoryProvider, useHistory, resultOverrideKey } from '${abs('src/context/HistoryContext.jsx')}';`
  ].join('\n'));
  const bundle = await rolldown({
    input: entry,
    external: [/^react(-dom)?(\/|$)/],
    resolve: { extensions: ['.jsx', '.js', '.mjs'] },
    moduleTypes: { '.jsx': 'jsx' },
    transform: { jsx: { runtime: 'automatic' } }
  });
  const { output } = await bundle.generate({ format: 'esm', exports: 'named', codeSplitting: false });
  const bundlePath = join(dir, 'ctx-bundle.mjs');
  writeFileSync(bundlePath, output[0].code);
  await bundle.close();
  ctxBundle = await import(pathToFileURL(bundlePath).href);
} catch (err) {
  ctxBundleError = err;
}

test('Runtime: the mounted HistoryProvider serves override-aware selectors meeting the PRE contract', async () => {
  assert.ok(!ctxBundleError, `the context bundle must build under rolldown: ${ctxBundleError?.stack || ctxBundleError}`);
  const { UIProvider, ProvidersProvider, HistoryProvider, useHistory, resultOverrideKey } = ctxBundle;
  const { JSDOM } = await import('jsdom');
  const React = (await import('react')).default;
  const { act } = await import('react');
  const { createRoot } = await import('react-dom/client');

  localStorage.clear();
  installFakeIndexedDB();
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://127.0.0.1:4173/' });
  for (const k of ['window', 'document', 'HTMLElement', 'HTMLIFrameElement', 'Node', 'Element', 'getComputedStyle', 'customElements']) {
    globalThis[k] = dom.window[k];
  }
  Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  const sink = {};
  /* oxlint-disable react/immutability -- node:test harness sink: captured outside a real React tree */
  function Probe() {
    sink.history = useHistory();
    return null;
  }
  /* oxlint-enable react/immutability */
  await act(async () => {
    const mountRoot = createRoot(document.getElementById('root'));
    mountRoot.render(
      React.createElement(UIProvider, null,
        React.createElement(ProvidersProvider, null,
          React.createElement(HistoryProvider, null,
            React.createElement(Probe)
          )
        )
      )
    );
    await new Promise((r) => setTimeout(r, 120));
  });

  assert.equal(typeof sink.history.effectiveStatus, 'function', 'useHistory() exposes effectiveStatus as a context value');
  assert.equal(typeof sink.history.effectiveDetails, 'function', 'useHistory() exposes effectiveDetails as a context value');
  assert.equal(typeof sink.history.setOverrides, 'function', 'the overrides state stays settable through the provider');

  await act(async () => {
    sink.history.setOverrides({
      'audit-1-t1-TC1': { verdict: 'VULNERABLE', reason: 'Reviewed' },
      '2026-01-02T03:04:05.000Z-t2-TC2': { verdict: 'SECURE', reason: '' },
    });
  });
  // setOverrides re-renders the provider; read the FRESH context values.
  let { effectiveStatus, effectiveDetails } = sink.history;

  // 1. Override wins over the raw status (keyed by auditId).
  const r1 = { auditId: 'audit-1', timestamp: 'ts-1', targetUid: 't1', testId: 'TC1', status: 'SECURE', model: 'm1' };
  assert.equal(effectiveStatus(r1), 'VULNERABLE', 'override replaces a SECURE verdict');
  const d1 = effectiveDetails(r1);
  assert.deepEqual(d1, { ...r1, status: 'VULNERABLE', overrideReason: 'Reviewed' }, 'effectiveDetails returns the effective verdict and human reason without changing original evidence');
  assert.notEqual(d1, r1, 'effectiveDetails returns a NEW object when an override applies');
  assert.equal(r1.status, 'SECURE', 'the original record is never mutated');

  // 2. Key template: falsy auditId falls back to the timestamp.
  const r2 = { auditId: '', timestamp: '2026-01-02T03:04:05.000Z', targetUid: 't2', testId: 'TC2', status: 'VULNERABLE' };
  assert.equal(resultOverrideKey(r2), '2026-01-02T03:04:05.000Z-t2-TC2', 'key template is auditId||timestamp + targetUid + testId');
  assert.equal(effectiveStatus(r2), 'SECURE', 'timestamp-fallback key resolves the override');

  // 3. An absent override leaves a technical result unscored.
  const r3 = { auditId: 'audit-3', targetUid: 't3', testId: 'TC3', status: 'ERROR' };
  assert.equal(effectiveStatus(r3), 'ERROR', 'falsy override value falls back to the raw status');

  // 4. No override: raw status passes through and effectiveDetails keeps identity.
  const r4 = { auditId: 'audit-4', targetUid: 't4', testId: 'TC4', status: 'SECURE' };
  assert.equal(effectiveStatus(r4), 'SECURE', 'no override → raw status');
  assert.equal(effectiveDetails(r4), r4, 'no override → the SAME record reference (no copy)');

  // 5. Falsy passthrough of null/undefined/false.
  assert.equal(effectiveStatus(null), null, 'effectiveStatus(null) === null');
  assert.equal(effectiveStatus(undefined), undefined, 'effectiveStatus(undefined) === undefined');
  assert.equal(effectiveStatus(false), false, 'effectiveStatus(false) === false');
  assert.throws(() => effectiveDetails(null), TypeError, 'effectiveDetails(null) throws — byte-compat anchor (no null guard was added)');

  // 6. The provider value re-derives when overrides change (live closure, not a snapshot).
  await act(async () => {
    sink.history.setOverrides({ ...sink.history.overrides, 'audit-1-t1-TC1': { verdict: 'SECURE', reason: '' } });
  });
  ({ effectiveStatus, effectiveDetails } = sink.history);
  assert.equal(effectiveStatus(r1), 'SECURE', 'flipping the override flips the served verdict');
  assert.equal(effectiveDetails(r1).status, 'SECURE', 'effectiveDetails follows the flipped override');

  await act(async () => {
    sink.history.setOverrides({});
  });
  ({ effectiveStatus } = sink.history);
  assert.equal(effectiveStatus(r1), 'SECURE', 'clearing overrides restores the raw verdict');
});
