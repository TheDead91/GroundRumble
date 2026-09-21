
// Contract: the real DashboardView. The sandbox banner, the four scorecards
// (data-tour="dash-overall"), the "Resilience Score by Model" table with
// dashSort controls and per-tactic ATLAS columns, and the "Audit Logs History"
// table (data-testid="history-row") render from
// src/components/views/DashboardView.jsx consuming useHistory(),
// useProviders(), useSettings() and useUI() directly, while the App-owned
// orchestration (printRunReport, handleDeleteAudit, clearHistory,
// effectiveDetails, selectedAudit/expandedDetailIds state) is wired into the
// view.
//
// The audit-detail glue (printRunReport/handleDeleteAudit/clearHistory +
// selectedAudit/expandedDetailIds state) may live in
// src/hooks/useAuditDetail.js. The engineHomes() set enumerates
// src/hooks/*.js, so homeOf/countInUnion below resolve the owning source in
// either location with identical bodies and exactly-once counts — no
// assertion weakened.
//
// Source-text level because Node cannot import JSX/extensionless specifiers
// under bare node:test (see tests/tests-view.contract.test.mjs,
// tests/audit-engine.contract.test.mjs, tests/source-intake.contract.test.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP_PATH = 'src/App.jsx';
const VIEW_PATH = 'src/components/views/DashboardView.jsx';

const readSource = (relPath) => readFileSync(join(root, relPath), 'utf8').replace(/\r\n/g, '\n');
let app = '', view = '', tour = '', auditModal = '';
try {
  app = readSource(APP_PATH);
  view = readSource(VIEW_PATH);
  // The guided-tour step definitions live in the pure factory module
  // src/utils/tour-steps.js; read tolerantly so `tour` stays '' when absent.
  tour = readSource('src/utils/tour-steps.js');
  // The audit-detail modal carries the audit-report printRunReport call site;
  // read tolerantly so `auditModal` stays '' when the modal is absent.
  try { auditModal = readSource('src/components/modals/AuditDetailModal.jsx'); } catch { /* modal absent */ }
} catch { /* missing files fail their first assertion */ }

// Engine homes ("one home, not duplicated"): App.jsx, DashboardView.jsx, or
// any src/utils/*.js / src/hooks/*.js module.
function engineHomes() {
  const sources = [[APP_PATH, app], [VIEW_PATH, view]];
  for (const dir of ['src/utils', 'src/hooks']) {
    try {
      for (const f of readdirSync(join(root, dir))) {
        if (f.endsWith('.js')) sources.push([`${dir}/${f}`, readSource(`${dir}/${f}`)]);
      }
    } catch { /* directory absent */ }
  }
  return sources;
}
const union = () => engineHomes().map(([, s]) => s).join('\n');
const countInUnion = (needle) => union().split(needle).length - 1;
const homeOf = (needle) => engineHomes().find(([, s]) => s.includes(needle))?.[0] || null;

const norm = (text) => text.replace(/\s+/g, ' ').trim();
const countIn = (source, needle) => source.split(needle).length - 1;
const pair = app + '\n' + view;
// App-side tour copy resolves across App.jsx ∪ src/utils/tour-steps.js (the
// factory module owns it; the file may be absent).
const appTour = app + '\n' + tour;

// The <DashboardView … /> wiring block inside App.jsx (from the opening tag to
// the first self-closing `/>`), used to prove App passes its App-owned
// handlers and state down to the view.
function wiringBlock() {
  const start = app.indexOf('<DashboardView');
  assert.ok(start >= 0, 'App.jsx mounts <DashboardView … />');
  const end = app.indexOf('/>', start);
  assert.ok(end > start, 'the <DashboardView mount is self-closed');
  return app.slice(start, end + 2);
}
// A name reaches the view through App's wiring block ('wired'), a local
// definition inside the view component ('local', 2-space component-body
// indent), or any reference inside the view ('referenced', e.g. an import
// from a stats helper module).
const reachesView = (name) => {
  if (new RegExp(`^  const ${name} = `, 'm').test(view)) return 'local';
  try { if (wiringBlock().includes(name)) return 'wired'; } catch { /* no mount */ }
  if (view.includes(name)) return 'referenced';
  return null;
};

// Ordered-substring helper over a normalized body: pins presence AND order.
const ordered = (body, label, needles) => {
  let cursor = -1;
  for (const needle of needles) {
    const at = body.indexOf(needle, cursor + 1);
    assert.ok(at > cursor, `${label}: expected ${JSON.stringify(needle)} after offset ${cursor} (ordering pin)`);
    cursor = at;
  }
  return cursor;
};

// Extracts a component-level handler (2-space indent): from its declaration
// line to the handler-closing `  };` line, so trailing comments are excluded.
function regionOf(source, name) {
  const re = new RegExp(`^  const ${name} = `, 'm');
  const m = re.exec(source);
  assert.ok(m, `declaration of ${name} not found at the component-body indent`);
  const lines = source.slice(m.index).split('\n');
  const buf = [lines[0]];
  for (let i = 1; i < lines.length; i++) {
    buf.push(lines[i]);
    if (lines[i] === '  };' || lines[i] === '  });') return buf.join('\n');
  }
  assert.fail(`handler ${name} has no closing line`);
}
const bodyOf = (source, name) => norm(regionOf(source, name));

// ---------------------------------------------------------------------------
// The view is real, mounted, context-consuming; the region lives in the view
// ---------------------------------------------------------------------------

test('DashboardView.jsx is the real view — named + default export, real cards, placeholder gone', () => {
  assert.match(view, /export function DashboardView\(/, 'DashboardView is exported (parameterless stub export replaced)');
  assert.match(view, /export default DashboardView;/, 'the default export stays for direct App composition');
  for (const marker of ['data-tour="dash-overall"', 'data-tour="resilience-by-model"', 'data-tour="audit-history"']) {
    assert.ok(view.includes(marker), `the view renders ${marker}`);
  }
  for (const stubMarker of [
    'Shows overall resilience score, per-model scores, recent audits, charts',
    'Security Dashboard</h1>',
    'Run audits to see per-model resilience scores',
    'Resilience by Model</h2>',
    'No audit history yet. Run your first audit in the <strong>Auditor Runner</strong> tab.',
    'Showing latest 5',
    "origin === 'Preset'"
  ]) {
    assert.ok(!view.includes(stubMarker), `stub placeholder text is gone: ${stubMarker}`);
  }
  assert.ok(!/return null;\s*\/\/ Compute overall resilience score\s*const overallScore = useMemo/.test(norm(view)), 'the stub\'s hook-after-early-return pattern is gone');
  assert.equal(countIn(view, 'useState('), 2, `the view owns exactly the two dashSort useState hooks; got ${countIn(view, 'useState(')}`);
  assert.ok(view.includes("const [dashSortKey, setDashSortKey] = useState('model');"), 'dashSortKey state is view-owned');
  assert.ok(view.includes("const [dashSortDir, setDashSortDir] = useState('asc');"), 'dashSortDir state is view-owned');
  assert.ok(view.split('\n').length > 300, `the view carries the moved region + engine (baseline stub was 214 lines); got ${view.split('\n').length}`);
});

test('App mounts <DashboardView and the dashboard-region markers leave App.jsx', () => {
  const wire = wiringBlock();
  assert.ok(wire.length > 10, 'the mount is wired with props');
  // Card-level anchors use the JSX form: the App-owned tour config keeps
  // bracketed target strings ('[data-tour="dash-overall"]') and title copies
  // ('Resilience Score by Model'), which are distinct byte patterns.
  for (const marker of [
    'className="glass-card" data-tour="dash-overall"',
    'className="glass-card" data-tour="resilience-by-model"',
    'className="glass-card" data-tour="audit-history"',
    'OVERALL SECURITY',
    'TOTAL AUDITS RUN',
    'VULNERABLE MODELS',
    'MODELS TESTED',
    'The most recent audit ran in <b>Sandbox mode</b>',
    '<h3 style={{ fontSize: \'1.1rem\', fontWeight: 700 }}>Resilience Score by Model</h3>',
    'No audits run yet. Open the Auditor Runner and run a comparison audit to populate stats.',
    '<h3 style={{ fontSize: \'1.1rem\', fontWeight: 700 }}>Audit Logs History</h3>',
    'No historical scans available.',
    'data-testid="history-row"',
    'Models with at least 1 failed test',
    'Per-model resilience split by MITRE ATLAS tactic. Click a column header to sort. Download a full printable report (PDF) for any model.'
  ]) {
    assert.ok(!app.includes(marker), `region marker left App.jsx: ${marker}`);
    assert.equal(countIn(pair, marker), 1, `moved copy exists exactly once across App + view: ${marker}`);
  }
  assert.ok(appTour.includes("target: '[data-tour=\"dash-overall\"]'"), 'the tour step keeps its target (App-side pre-T10, src/utils/tour-steps.js after)');
  assert.match(app, /import DashboardView from '\.\/components\/views\/DashboardView';|import \{ DashboardView \} from '\.\/components\/views\/DashboardView';|const DashboardView = lazy\(/, 'App imports (or lazy-loads) the view component');
  assert.equal(countIn(pair + '\n' + tour, 'Security Dashboard'), 2, 'the App header title + tour body keep their two copies across App + view + the tour module; the stub h1 does not survive anywhere');
});

test('The view consumes useHistory(), useProviders() and useSettings() directly (no prop drilling of context state)', () => {
  const historyBlock = /const \{([\s\S]*?)\} = useHistory\(\);/.exec(view);
  const providersBlock = /const \{([\s\S]*?)\} = useProviders\(\);/.exec(view);
  const settingsBlock = /const \{([\s\S]*?)\} = useSettings\(\);/.exec(view);
  assert.ok(historyBlock, 'the view destructures useHistory()');
  assert.ok(providersBlock, 'the view destructures useProviders()');
  assert.ok(settingsBlock, 'the view destructures useSettings()');
  for (const name of ['history']) {
    assert.match(historyBlock[1], new RegExp(`\\b${name}\\b`), `the view takes ${name} from HistoryContext`);
  }
  if (/^  const effectiveDetails = /m.test(view)) {
    // View-local override-aware re-derivation: the view needs the raw overrides.
    assert.match(historyBlock[1], /\boverrides\b/, 'the view takes overrides from HistoryContext (local effectiveDetails)');
  }
  for (const name of ['providerLabel', 'modelTargetLabel', 'vaultLocked', 'vaultPassphraseSet']) {
    assert.match(providersBlock[1], new RegExp(`\\b${name}\\b`), `the view takes ${name} from ProvidersContext`);
  }
  assert.match(settingsBlock[1], /\batlasMatrix\b/, 'the view takes atlasMatrix from SettingsContext');
  const uiBlock = /const \{([\s\S]*?)\} = useUI\(\);/.exec(view);
  if (uiBlock) assert.match(uiBlock[1], /\baddToast\b/, 'if the view consumes useUI it is for toasts (printModelReport)');
  assert.ok(view.includes("from '../../context/HistoryContext'"), 'the view imports HistoryContext');
  assert.ok(view.includes("from '../../context/ProvidersContext'"), 'the view imports ProvidersContext');
  assert.ok(view.includes("from '../../context/SettingsContext'"), 'the view imports SettingsContext');
  assert.doesNotMatch(view, /from '\.\.\/\.\.\/context\/TestsContext'/, 'the view no longer consumes TestsContext (the real dashboard shows no test-catalog stats)');
});

test('View module imports — T01 report-builder and the lucide icon set', () => {
  const reportImport = /import \{([^}]*)\} from '\.\.\/\.\.\/utils\/report-builder(\.js)?';/.exec(view);
  assert.ok(reportImport, 'the view imports from utils/report-builder (T01 module)');
  assert.match(reportImport[1], /\bbuildModelReportBody\b/, 'buildModelReportBody for the per-model printable report');
  assert.match(reportImport[1], /\bopenPrintableReport\b/, 'openPrintableReport to open the report window');
  const lucide = /import \{([^}]*)\} from 'lucide-react';/.exec(view);
  assert.ok(lucide, 'the view imports its icons from lucide-react');
  for (const icon of ['AlertTriangle', 'Shield', 'History', 'Check', 'Info', 'Download', 'Eye', 'Trash2']) {
    assert.match(lucide[1], new RegExp(`\\b${icon}\\b`), `icon ${icon} imported`);
  }
});

// ---------------------------------------------------------------------------
// The stats/sort engine has exactly one home — never duplicated
// ---------------------------------------------------------------------------

test('The stats/sort engine has exactly one home — every symbol defined once across App+view+utils/hooks and referenced by the view', () => {
  for (const name of [
    'modelKeyFor', 'allModelKeys', 'sandboxModelKeys', 'isSandboxModel',
    'modelsTestedCount', 'vulnerableModelKeys', 'vulnerableModelsCount',
    'perModelOverall', 'perModelTacticStats', 'tacticIdByName', 'dashTacticColumns',
    'dashSortIndicator', 'clickDashSort', 'modelNameFor', 'modelProviderFor',
    'tacticScoreFor', 'overallScoreFor', 'sortedModelKeys',
    'allHistoricalResults', 'overallSecurityScore', 'totalAuditsCount',
    'totalTestsRunCount', 'historicalSecureCount', 'historicalVulnerableCount',
    'hasEvaluatedTests'
  ]) {
    const defs = engineHomes().filter(([, s]) => new RegExp(`\\bconst ${name} = `, 'm').test(s)).length;
    assert.ok(defs <= 1, `${name} is defined at most once across App+view+utils/hooks; got ${defs}`);
    assert.ok(reachesView(name) !== null, `${name} reaches the view (local, wired, or imported)`);
  }
});

test('Score-math formulas are never duplicated across App+view (pre-existing report-builder copies excluded)', () => {
  for (const formula of [
    'Math.round((o.secure / o.total) * 100)',
    'Math.round((s.secure / s.total) * 100)',
    "if (r.status === 'ERROR' || r.status === 'EMPTY' || r.status === 'INCONCLUSIVE') return;",
    'const modelKeyFor = (r) => `${r.provider}::${r.model}`;',
    'return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);',
    '[...new Set(allHistoricalResults.map(modelKeyFor))]',
    "[...new Set(allHistoricalResults.filter(r => r.status === 'VULNERABLE').map(modelKeyFor))]",
    'if (h.isDemo) (h.details || []).forEach(r => sandboxModelKeys.add(modelKeyFor(r)));',
    "const dashSortIndicator = (key) => dashSortKey === key ? (dashSortDir === 'asc' ? ' ↑' : ' ↓') : '';",
    "if (dashSortKey === key) setDashSortDir(prev => prev === 'asc' ? 'desc' : 'asc');"
  ]) {
    const inPair = countIn(pair, formula);
    assert.ok(inPair <= 1, `formula duplicated across App+view (${inPair} copies): ${formula}`);
    assert.ok(countInUnion(formula) >= 1, `formula lost from every engine home: ${formula}`);
  }
  const legacySummaries = view.includes('Math.round((historicalSecureCount / totalTestsRunCount) * 100)')
    && view.includes('Math.round((recSecure / validTests) * 100)');
  const centralizedSummaries = view.includes('summarizeVerdicts(allHistoricalResults)')
    && view.includes('summarizeVerdicts(det)');
  assert.ok(legacySummaries || centralizedSummaries, 'dashboard summaries are baseline-inline or delegated together to summarizeVerdicts');
  assert.ok(!app.includes('const [dashSortKey, setDashSortKey]'), 'dashSort state left App.jsx');
  assert.equal(countIn(pair, "const [dashSortKey, setDashSortKey] = useState('model');"), 1, 'dashSortKey declared exactly once across App+view');
});

test('PrintModelReport — one definition, T01 report-builder call, vault gate; the view binds it', () => {
  const home = homeOf('const printModelReport = ');
  assert.ok(home, 'printModelReport is defined in exactly one engine home');
  const homeSrc = engineHomes().find(([p]) => p === home)[1];
  const body = bodyOf(homeSrc, 'printModelReport');
  ordered(body, `${home}.printModelReport`, [
    'const printModelReport = (modelKey) => {',
    'if (vaultLocked) {',
    "addToast('Unlock your API keys to generate reports.');",
    "const [provider, ...modelParts] = modelKey.split('::');",
    "const model = modelParts.join('::');",
    'const modelResults = allHistoricalResults.filter(r => modelKeyFor(r) === modelKey);',
    'openPrintableReport(window, buildModelReportBody({ model, provider, modelResults, tacticStats: perModelTacticStats[modelKey] || {}, providerLabel }), { addToast });'
  ]);
  assert.ok(reachesView('printModelReport') !== null, 'printModelReport reaches the view');
  assert.ok(view.includes('onClick={() => printModelReport(mk)} disabled={vaultLocked && (vaultPassphraseSet ?? false)}'), 'the per-model report button renders from the view with its vault gate');
});

test('App ∪ useAuditDetail owns the orchestrators — exact bodies, wired into the view', () => {
  const homeSrc = (needle) => {
    const h = engineHomes().find(([, s]) => s.includes(needle));
    assert.ok(h, `${needle} resolves to an engine home (App.jsx, hooks or utils)`);
    return h[1];
  };
  for (const name of ['printRunReport', 'handleDeleteAudit', 'clearHistory']) {
    assert.ok(homeOf(`const ${name} = `), `${name} stays defined exactly once (App.jsx today; src/hooks/useAuditDetail.js after T06)`);
    assert.equal(countInUnion(`const ${name} = `), 1, `${name} is not duplicated across the engine homes`);
    assert.equal(reachesView(name), 'wired', `${name} is wired into <DashboardView as a prop`);
    assert.doesNotMatch(view, new RegExp(`^  const ${name} = `, 'm'), `${name} is NOT redefined inside the view`);
  }
  const body = bodyOf(homeSrc('const printRunReport = '), 'printRunReport');
  ordered(body, `${homeOf('const printRunReport = ')}.printRunReport`, [
    'const printRunReport = (results, { title, subtitle, meta } = {}) => {',
    'if (vaultLocked) {',
    "addToast('Unlock your API keys to generate reports.');",
    'if (!vaultSupported()) {',
    "addToast('Reports require IndexedDB support (secure context).');",
    'if (!results || results.length === 0) {',
    "addToast('No results to report yet.');",
    'openPrintableReport(window, buildRunReportBody({ results: results.map(effectiveDetails), title, subtitle, meta, providerLabel }), { addToast });'
  ]);
  const del = bodyOf(homeSrc('const handleDeleteAudit = '), 'handleDeleteAudit');
  ordered(del, `${homeOf('const handleDeleteAudit = ')}.handleDeleteAudit`, [
    'const handleDeleteAudit = async (id) => {',
    'if (!(await deleteAudit(id))) return;',
    'if (selectedAudit && selectedAudit.id === id) setSelectedAudit(null);'
  ]);
  assert.ok(app.includes("import { openPrintableReport, buildRunReportBody } from './utils/report-builder';") || app.includes("import { openPrintableReport, buildModelReportBody, buildRunReportBody } from './utils/report-builder';"), 'App keeps its report-builder import (the pair travels through the hook\'s deps bag)');
});

test('Override-aware verdicts reach the view — wired effectiveDetails or a view-local re-derivation, never a lossy copy', () => {
  assert.match(app, /effectiveDetails,\n  \} = useHistory\(\)/, 'App keeps effectiveDetails (consumed from HistoryContext after the T01 consolidation; other regions still consume it)');
  const reach = reachesView('effectiveDetails');
  assert.ok(reach === 'wired' || reach === 'local', `effectiveDetails reaches the view (wired or local); got ${reach}`);
  if (reach === 'local') {
    assert.match(view, /\bresultOverrideKey\b/, 'the view-local copy is override-aware (uses resultOverrideKey)');
    assert.match(view, /import \{[^}]*resultOverrideKey[^}]*\} from '\.\.\/\.\.\/context\/HistoryContext(\.jsx)?';/, 'the view imports resultOverrideKey from HistoryContext');
  }
});

test('Detail-panel state is owned once by the App ∪ useAuditDetail home; the view only reads the wiring', () => {
  assert.ok(homeOf('const [selectedAudit, setSelectedAudit]'), 'selectedAudit stays declared once (App.jsx today; src/hooks/useAuditDetail.js after T06)');
  assert.equal(countInUnion('const [selectedAudit, setSelectedAudit]'), 1, 'selectedAudit is declared exactly once');
  assert.ok(homeOf('const [expandedDetailIds, setExpandedDetailIds]'), 'expandedDetailIds stays declared once (App.jsx today; src/hooks/useAuditDetail.js after T06)');
  assert.equal(countInUnion('const [expandedDetailIds, setExpandedDetailIds]'), 1, 'expandedDetailIds is declared exactly once');
  assert.doesNotMatch(view, /const \[selectedAudit|const \[expandedDetailIds/, 'the view never declares detail-panel state');
  for (const name of ['setSelectedAudit', 'setExpandedDetailIds']) {
    assert.equal(reachesView(name), 'wired', `${name} is wired into <DashboardView as a prop`);
  }
  assert.ok(view.includes('onClick={() => { setExpandedDetailIds(new Set()); setSelectedAudit(record); }}'), 'the View-button binding (close expanded rows, open detail panel) renders from the view');
});

// ---------------------------------------------------------------------------
// Routes, empty states, pixel-equivalent copy
// ---------------------------------------------------------------------------

test('The empty states move unchanged into the view', () => {
  ordered(norm(view), 'view.empty states', [
    '{allModelKeys.length === 0 ? (',
    'No audits run yet. Open the Auditor Runner and run a comparison audit to populate stats.',
    '{history.length === 0 ? (',
    'No historical scans available.'
  ]);
  ordered(norm(view), 'view.sandbox banner', [
    '{history[0]?.isDemo && (',
    'The most recent audit ran in <b>Sandbox mode</b>',
    'model responses were <b>simulated</b>, not real API',
    'Turn off Sandbox in Settings to test live models.'
  ]);
});

test('The moved tables keep baseline cell/badge copy and the vault gates', () => {
  ordered(norm(view), 'view.resilience table', [
    'Resilience Score by Model',
    "<th onClick={() => clickDashSort('model')}",
    'Model{dashSortIndicator(\'model\')}',
    "<th onClick={() => clickDashSort('provider')}",
    'Provider{dashSortIndicator(\'provider\')}',
    '{dashTacticColumns.map(tname => {',
    "const fullId = id ? (id.startsWith('AML.') ? id : `AML.${id}`) : '';",
    "<th onClick={() => clickDashSort('overall')}",
    'Resilience{dashSortIndicator(\'overall\')}',
    '{sortedModelKeys.map(mk => (',
    'isSandboxModel(mk) && (',
    'SANDBOX',
    'const score = tacticScoreFor(mk, tname);'
  ]);
  // Document order inside the history card: header → Clear History → rows.
  ordered(norm(view), 'view.history rows', [
    '<h3 style={{ fontSize: \'1.1rem\', fontWeight: 700 }}>Audit Logs History</h3>',
    '<button onClick={clearHistory} disabled={vaultLocked && (vaultPassphraseSet ?? false)}',
    'data-testid="history-row"',
    '{modelList.join(\' · \')}',
    "{modelList?.length > 0 ? 'Multi' : providerLabel(record.provider)}",
    '{recVuln} failed',
    'errors/empty/inconclusive (excluded from score)',
    '<span className="badge badge-secure">Live API</span>',
    "{score}% Resilience",
    'onClick={() => printRunReport((record.details || []).map(effectiveDetails), {',
    "title: 'GroundRumble Security Audit Report',",
    'onClick={() => handleDeleteAudit(record.id)}'
  ]);
});

// ---------------------------------------------------------------------------
// Acceptance greps — dashboard markers render only in the view; gates
// ---------------------------------------------------------------------------

test('App.jsx loses the dashboard region + engine (shrink gate)', () => {
  const appLines = app.split('\n').length;
  const viewLines = view.split('\n').length;
  assert.ok(appLines < 6100, `App.jsx shrinks below 6100 lines (baseline 6358; region ≈ 288 + engine ≈ 100 lines out minus mount wiring); got ${appLines}`);
  assert.ok(viewLines > 300, `DashboardView.jsx grows past 300 lines with the moved region (baseline stub 214); got ${viewLines}`);
});

test('Acceptance greps — dashboard markers live only in the view; App keeps its other regions', () => {
  for (const marker of [
    'className="glass-card" data-tour="dash-overall"',
    "onClick={() => clickDashSort('model')}",
    'const [dashSortKey, setDashSortKey]',
    'data-testid="history-row"',
    'const modelResults = allHistoricalResults.filter(r => modelKeyFor(r) === modelKey);',
    'No historical scans available.'
  ]) {
    assert.ok(!app.includes(marker), `dashboard marker left App.jsx: ${marker}`);
    assert.ok(engineHomes().some(([p, s]) => p !== APP_PATH && s.includes(marker)), `dashboard marker lives outside App.jsx: ${marker}`);
  }
  assert.ok(app.includes("{activeTab === 'matrix' && ("), 'the matrix region is untouched in App.jsx');
  assert.ok(app.includes("{activeTab === 'runner' && ("), 'the runner region is untouched in App.jsx');
  assert.ok(app.includes("{activeTab === 'dashboard' && ("), 'the dashboard gate remains App-side, wrapping the mount');
  // The audit-detail modal carries App's audit-report call site
  // (`title: 'GroundRumble Security Audit Report'`); DashboardView keeps its
  // own call site (pinned view-side above). The union must not duplicate or
  // drop the site.
  assert.ok(
    app.includes("title: 'GroundRumble Security Audit Report',") || auditModal.includes("title: 'GroundRumble Security Audit Report',"),
    'App keeps its own printRunReport call sites (detail panel — App-side pre-T02, AuditDetailModal.jsx after the T02 extraction)'
  );
});
