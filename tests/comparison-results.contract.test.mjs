// Contract: the comparison-results surface of the Auditor
// Runner — the empty state, the payload × model matrix with its
// failed/inconclusive/succeeded groupings, the per-model summaries, the
// Download Report wiring and the expanded-cell detail with the manual verdict
// override UI — renders from a MEMOIZED
// src/components/runner/ComparisonResults.jsx, so config-panel interactions
// (typing in the payload filters, opening selects) stay isolated from the
// results tree while idle, while override set/unset keeps persisting through
// HistoryContext.
//
// The surface is composed by the RunnerView region; the region keeps only its
// mount point.
//
// Several pins read across a union of possible homes because the orchestration
// is split across several modules: the `r.status === 'ERROR' || r.status === 'EMPTY'`
// technical-skip branch may live in the App, the judge service or the judge
// hook; the audit-detail statusColor map and handleResultOverride may live in
// the App, the audit-detail hook or the audit-detail modal; and the guided-tour
// copy may live in the App or the tour-steps factory. The tolerant reads
// degrade to the App alone when a collaborator module is absent, so the four
// badge-ladder literals still resolve across each pair — no literal dropped or
// duplicated and no body rewritten when the orchestration splits.
//
// Source-text level because Node cannot import JSX/extensionless specifiers
// under bare node:test (repo convention: see tests/runner-view.contract.test.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const COMP_PATH = 'src/components/runner/ComparisonResults.jsx';
const VIEW_PATH = 'src/components/views/RunnerView.jsx';
const APP_PATH = 'src/App.jsx';
const REEVALUATION_PATH = 'src/utils/judge-reevaluation.js';

const readSource = (relPath) => readFileSync(join(root, relPath), 'utf8').replace(/\r\n/g, '\n');
let app = '', view = '', comp = '', reevaluation = '', tour = '', auditModal = '', comparisonTable = '';
let auditHook = '';
try {
  app = readSource(APP_PATH);
  view = readSource(VIEW_PATH);
  comp = readSource(COMP_PATH);
  reevaluation = readSource(REEVALUATION_PATH);
  // The guided-tour step definitions may live in the pure factory module
  // src/utils/tour-steps.js; when that module is absent `tour` stays ''.
  tour = readSource('src/utils/tour-steps.js');
  // The audit-detail modal may carry the statusColor 'EMPTY' literal; absent
  // modules leave `auditModal` ''.
  try { auditModal = readSource('src/components/modals/AuditDetailModal.jsx'); } catch { /* module absent — tolerant read */ }
  // src/hooks/useAuditDetail.js may own the audit-detail orchestration; absent
  // modules leave `auditHook` ''.
  try { auditHook = readSource('src/hooks/useAuditDetail.js'); } catch { /* module absent — tolerant read */ }
  try { comparisonTable = readSource('src/utils/comparison-table.js'); } catch { /* module absent — tolerant read */ }
} catch { /* missing files fail their first assertion */ }

const norm = (text) => text.replace(/\s+/g, ' ').trim();
const countIn = (source, needle) => source.split(needle).length - 1;

// App-side tour copy resolves across App.jsx ∪ src/utils/tour-steps.js (either
// home may own it; the factory module may be absent).
const appTour = app + '\n' + tour;
// The audit-detail orchestration resolves across App ∪
// src/hooks/useAuditDetail.js (tolerant — the hook may be absent).
const appAudit = app + '\n' + auditHook;

// Ordered-substring helper over a normalized body: pins presence AND order.
const ordered = (rawBody, label, needles) => {
  const body = norm(rawBody);
  let cursor = -1;
  for (const rawNeedle of needles) {
    const needle = norm(rawNeedle);
    const at = body.indexOf(needle, cursor + 1);
    assert.ok(at > cursor, `${label}: expected ${JSON.stringify(needle)} after offset ${cursor} (ordering pin)`);
    cursor = at;
  }
  return cursor;
};

// The <ComparisonResults … /> wiring block inside RunnerView.jsx (from the
// opening tag to the first self-closing `/>`), to prove the view passes
// only referentially stable props (memo-bailout-safe wiring).
function mountBlock() {
  const start = view.indexOf('<ComparisonResults');
  assert.ok(start >= 0, 'RunnerView.jsx mounts <ComparisonResults … />');
  const end = view.indexOf('/>', start);
  assert.ok(end > start, 'the <ComparisonResults mount is self-closed');
  return view.slice(start, end + 2);
}

// ---------------------------------------------------------------------------
// The results surface renders from the context-fed component
// ---------------------------------------------------------------------------

test('ComparisonResults.jsx is the real extracted component — named export, memo default export, all results markers', () => {
  assert.match(comp, /export function ComparisonResults\(/, 'ComparisonResults is exported (the extracted component)');
  assert.match(comp, /export default memo\(ComparisonResults\);/, 'the default export is the memoized component');
  for (const marker of [
    'data-tour="results-table"',
    'data-tour="expanded-result"',
    'data-testid={`result-row-${testId}`}',
    'data-testid={`model-summary-${t.uid}`}',
    'data-testid="run-report"',
    'Failed Attack Payloads',
    'Inconclusive (errors / empty)',
    'Succeeded Attack Payloads',
    'No results yet. Run a Comparison Audit to see the payload × model matrix here.',
    '<h3 style={{ fontSize: \'1.2rem\', fontWeight: 800 }}>Comparison Results</h3>',
    '{testIds.length} tests × {targets.length} models',
    'Click a verdict cell to inspect the full prompt, response, and evaluation reasoning. Click the column headers to sort.'
  ]) {
    assert.ok(comp.includes(marker), `the component renders ${marker}`);
  }
  assert.ok(comp.split('\n').length > 300, `the component carries the moved region; got ${comp.split('\n').length} lines`);
});

test('The results region leaves RunnerView.jsx and exists exactly once across view + component (App stays clean)', () => {
  // Region-EXCLUSIVE markers: they leave RunnerView.jsx entirely and exist
  // exactly once across view + component; App keeps none of them.
  for (const marker of [
    '{/* Comparison Results */}',
    'No results yet. Run a Comparison Audit to see the payload × model matrix here.',
    'data-testid={`result-row-${testId}`}',
    'data-testid={`model-summary-${t.uid}`}',
    'data-testid="run-report"',
    'Failed Attack Payloads',
    'Inconclusive (errors / empty)',
    'Succeeded Attack Payloads',
    'No vulnerable results recorded.',
    'No succeeded payloads.',
    'Click a verdict cell to inspect the full prompt, response, and evaluation reasoning. Click the column headers to sort.',
    "subtitle: 'Auditor Runner — Comparison Run'",
    'Auditor Evaluation Reasoning:',
    'Vault locked — unlock your API keys to inspect prompts, responses, and reasoning.',
    '<h3 style={{ fontSize: \'1.2rem\', fontWeight: 800 }}>Comparison Results</h3>'
  ]) {
    assert.ok(!view.includes(marker), `region marker left RunnerView.jsx: ${marker}`);
    assert.equal(countIn(comp, marker), 1, `moved copy exists exactly once in the component: ${marker}`);
    assert.ok(!app.includes(marker), `App keeps none of the region: ${marker}`);
  }
  // Tour-anchored markers: the onboarding tour (App-side) targets them with
  // bracket selectors, so App keeps exactly its tour copy while the real
  // anchor JSX lives in the component.
  assert.equal(countIn(comp, 'data-tour="results-table"'), 1, 'the component carries the results-table anchor');
  assert.equal(countIn(appTour, 'data-tour="results-table"'), 1, 'App keeps exactly its tour copy (App-side pre-T10, src/utils/tour-steps.js after)');
  assert.equal(countIn(view, 'data-tour="results-table"'), 0, 'the view no longer renders the anchor');
  assert.equal(countIn(comp, 'data-tour="expanded-result"'), 2, 'the component carries the anchor + its scroll-effect selector');
  assert.equal(countIn(appTour, 'data-tour="expanded-result"'), 1, 'App keeps exactly its tour copy (App-side pre-T10, src/utils/tour-steps.js after)');
  assert.equal(countIn(view, 'data-tour="expanded-result"'), 0, 'the view no longer carries the anchor or the effect');
  assert.ok(!view.includes('per-model summary') && !view.includes('Comparison Results</h3>'), 'no stale headline fragments stay view-side');
});

test('RunnerView mounts <ComparisonResults /> with exactly five bare-identifier props (memo-bailout-safe wiring)', () => {
  assert.match(view, /import ComparisonResults from '\.\.\/runner\/ComparisonResults';/, 'the view imports the extracted component');
  const mount = mountBlock();
  for (const name of ['targets', 'expandedCell', 'setExpandedCell', 'handleResultOverride', 'printRunReport']) {
    assert.ok(mount.includes(`${name}={${name}}`), `the view wires ${name}={${name}} (bare, referentially stable)`);
  }
  // EVERY prop must be a bare identifier binding: an inline lambda or object
  // literal would be a fresh reference per view render and would defeat the
  // memo bail-out (the re-render isolation contract).
  const props = mount.match(/[a-zA-Z]+=\{[^}]*\}/g) || [];
  assert.ok(props.length >= 5, `the mount wires ${props.length} props`);
  for (const prop of props) {
    assert.match(prop, /^[a-zA-Z]+=\{[a-zA-Z]+\}$/, `prop ${prop} must be a bare identifier={identifier} binding — no inline closures/object literals`);
  }
  // The mount is unconditional: the empty state lives INSIDE the component
  // (the view does not gate the results surface on results/running).
  assert.ok(!/\{results\.length > 0 && \(\s*<ComparisonResults/.test(norm(view)), 'the view mounts the component unconditionally (no results gate outside)');
  // The component root is a FRAGMENT: no wrapper element may sit between the
  // view's flex column and the results cards, or the 32px gap between the
  // run-controls card and the results card collapses (layout regression).
  assert.match(norm(comp), /return \(\s*<>\s*\{\/\* Comparison Results \*\/\}/,
    'the component returns a fragment rooted at the moved region (no extra wrapper div)');
});

test('Context consumption split — the component reads results/stats via contexts; the view keeps the config/console surfaces', () => {
  const auditBlock = /const \{([\s\S]*?)\} = useAudit\(\);/.exec(comp);
  assert.ok(auditBlock, 'the component destructures useAudit()');
  for (const name of ['running', 'results']) {
    assert.match(auditBlock[1], new RegExp(`\\b${name}\\b`), `the component takes ${name} from AuditContext (results/stats via context, not App-wide reads)`);
  }
  const historyBlock = /const \{([\s\S]*?)\} = useHistory\(\);/.exec(comp);
  assert.ok(historyBlock, 'the component destructures useHistory()');
  assert.match(historyBlock[1], /\boverrides\b/, 'the component takes overrides from HistoryContext');
  assert.match(comp, /import \{ useHistory, resultOverrideKey \} from '\.\.\/\.\.\/context\/HistoryContext';/,
    'resultOverrideKey comes from the shared HistoryContext module (same depth as the views dir)');
  const testsBlock = /const \{([\s\S]*?)\} = useTests\(\);/.exec(comp);
  assert.ok(testsBlock, 'the component destructures useTests()');
  assert.match(testsBlock[1], /\ballTests\b/, 'the component takes allTests from TestsContext (row names/techniques)');
  const providersBlock = /const \{([\s\S]*?)\} = useProviders\(\);/.exec(comp);
  assert.ok(providersBlock, 'the component destructures useProviders()');
  for (const name of ['vaultLocked', 'vaultPassphraseSet', 'providerLabel', 'modelTargetLabel']) {
    assert.match(providersBlock[1], new RegExp(`\\b${name}\\b`), `the component takes ${name} from ProvidersContext`);
  }
  // The view keeps the config/console surfaces and drops the results surface.
  const viewAuditBlock = /const \{([\s\S]*?)\} = useAudit\(\);/.exec(view);
  assert.ok(viewAuditBlock, 'the view still destructures useAudit()');
  for (const name of ['running', 'stopping', 'progress', 'consoleLogs', 'currentTestName']) {
    assert.match(viewAuditBlock[1], new RegExp(`\\b${name}\\b`), `the view keeps ${name} from AuditContext (run controls + console)`);
  }
  assert.doesNotMatch(viewAuditBlock[1], /\bresults\b/, 'the view no longer consumes results (the component does)');
  assert.ok(!view.includes('useHistory'), 'the view drops HistoryContext entirely (overrides/results reads moved)');
  assert.ok(!view.includes('resultOverrideKey'), 'the view drops resultOverrideKey (the override buttons moved)');
  const viewProvidersBlock = /const \{([\s\S]*?)\} = useProviders\(\);/.exec(view);
  assert.ok(viewProvidersBlock, 'the view still destructures useProviders()');
  assert.match(viewProvidersBlock[1], /\bproviderLabel\b/, 'the view keeps providerLabel (lineup list)');
  assert.doesNotMatch(viewProvidersBlock[1], /\bmodelTargetLabel\b/, 'the view drops modelTargetLabel (report meta + expanded cell moved)');
  const viewTestsBlock = /const \{([\s\S]*?)\} = useTests\(\);/.exec(view);
  assert.ok(viewTestsBlock, 'the view still destructures useTests()');
  for (const name of ['allTests', 'selectedTests', 'presets', 'applyPreset', 'saveCurrentAsPreset', 'presetFeedback', 'testFilterOptions', 'evalMode', 'setEvalMode']) {
    assert.match(viewTestsBlock[1], new RegExp(`\\b${name}\\b`), `the view keeps ${name} from TestsContext (payload selector + eval buttons)`);
  }
});

// ---------------------------------------------------------------------------
// Memoization + re-render isolation
// ---------------------------------------------------------------------------

test('The component is wrapped for memoization and the results-UI state moved with the region', () => {
  assert.match(comp, /export default memo\(ComparisonResults\);/, 'the component is wrapped for memoization (React.memo)');
  const react = /import React, \{([^}]*)\} from 'react';/.exec(comp);
  assert.ok(react, 'the component imports React hooks');
  for (const hook of ['useState', 'useEffect', 'memo']) {
    assert.match(react[1], new RegExp(`\\b${hook}\\b`), `React import carries ${hook}`);
  }
  // The five results-UI atoms live in the component (exact bodies).
  for (const decl of [
    "const [sortKey, setSortKey] = useState('name');",
    "const [sortDir, setSortDir] = useState('asc');",
    'const [showFailedGroup, setShowFailedGroup] = useState(true);',
    'const [showInconclusiveGroup, setShowInconclusiveGroup] = useState(false);',
    'const [showSucceededGroup, setShowSucceededGroup] = useState(false);'
  ]) {
    assert.ok(comp.includes(decl), `the component owns ${decl}`);
    assert.ok(!view.includes(decl), `the view lost ${decl}`);
  }
  assert.equal(countIn(comp, 'useState('), 5, `exactly five useState atoms in the component; got ${countIn(comp, 'useState(')}`);
  assert.equal(countIn(view, 'useState('), 2, `exactly two useState atoms stay view-side (payload filters); got ${countIn(view, 'useState(')}`);
  assert.ok(view.includes("const [payloadFilterQ, setPayloadFilterQ] = useState('');"), 'payloadFilterQ stays view-side');
  assert.ok(view.includes("const [payloadFilterTechnique, setPayloadFilterTechnique] = useState('all');"), 'payloadFilterTechnique stays view-side');
  assert.ok(view.includes('const consoleScrollRef = useRef(null);'), 'the console scroll ref stays view-side');
  ordered(view, 'view.console auto-scroll effect', [
    'if (consoleScrollRef.current) {',
    'consoleScrollRef.current.scrollTop = consoleScrollRef.current.scrollHeight;',
    '}, [consoleLogs]);'
  ]);
  // The component must not reach into the config panel: isolation holds in
  // BOTH directions (config interactions cannot re-render the results tree
  // through hidden state reads either).
  for (const forbidden of ['payloadFilterQ', 'payloadFilterTechnique', 'toggleTest', 'selectAllTests', 'addTarget', 'removeTarget', 'setEvalMode', 'setTerminalOpen', 'terminalOpen', 'consoleLogs']) {
    assert.ok(!comp.includes(forbidden), `the component never references ${forbidden} (config/console isolation)`);
  }
});

test('The grid derivation (weights, rows, comparator, groupings, sort) moved verbatim into the component', () => {
  if (comparisonTable) {
    for (const name of ['buildComparisonRows', 'classifyComparisonRows', 'selectWorstResult', 'sortComparisonRows', 'summarizeModelResults']) {
      assert.match(comparisonTable, new RegExp(`export (?:const |function )${name}\\b`), `the pure model exports ${name}`);
      assert.ok(comp.includes(name), `the component adopts ${name}`);
    }
  } else {
    ordered(comp, 'baseline comparison decisions', [
      "const statusWeight = (s) => s === 'VULNERABLE' ? 0 : s === 'SECURE' ? 1 : 2;",
      'const testIds = [...new Set(results.map(r => r.testId))];',
      'const cellRes = targets.map(t => results.find(r => r.testId === testId && r.targetUid === t.uid));',
      'const worst = Math.min(...cellRes.map(r => (r ? statusWeight(eff(r)) : 3)));',
      'const failedRows = rows.filter(r => r.vulnCount > 0).sort(cmp);',
      "!r.cellRes.some(c => c && ['ERROR', 'EMPTY', 'INCONCLUSIVE'].includes(effectiveStatus(c))) && r.cellRes.some(Boolean)",
      'const modelResults = results.map(effectiveDetails).filter(r => r.targetUid === t.uid);',
      'const score = valid > 0 ? Math.round((secure / valid) * 100) : null;',
    ]);
  }
  ordered(comp, 'component summary rendering', ['data-testid={`model-summary-${t.uid}`}', "{score === null ? '—' : `${score}%`}"]);
  assert.ok(
    comp.includes('const score = valid > 0 ? Math.round((secure / valid) * 100) : null;')
      || comp.includes('summarizeVerdicts(modelResults)')
      || comp.includes('summarizeModelResults(results, t.uid, effectiveDetails)'),
    'model summary is baseline-inline or delegated to an extracted summary utility',
  );
  ordered(comp, 'component.groups', [
    "groupHeader('Failed Attack Payloads', failedRows.length, showFailedGroup, '239, 68, 68', () => setShowFailedGroup(prev => !prev))",
    'No vulnerable results recorded.',
    "groupHeader('Inconclusive (errors / empty)', inconclusiveRows.length, showInconclusiveGroup, '245, 158, 11', () => setShowInconclusiveGroup(prev => !prev))",
    "groupHeader('Succeeded Attack Payloads', succeededRows.length, showSucceededGroup, '34, 197, 94', () => setShowSucceededGroup(prev => !prev))",
    'No succeeded payloads.'
  ]);
  ordered(comp, 'component.report', [
    'data-testid="run-report"',
    "title: 'GroundRumble Security Audit Report',",
    "subtitle: 'Auditor Runner — Comparison Run',",
    'meta: [`Targets: ${targets.map(t => modelTargetLabel(t.provider, t.model)).join(\' · \')}`]',
    'disabled={vaultLocked && (vaultPassphraseSet ?? false)}',
    'Download Report'
  ]);
  // The badge ladder is byte-identical in both places it is used (worst-cell
  // column + cell buttons).
  const badgeLadder = "return s === 'SECURE' ? (\n                                <span className=\"badge badge-secure\"><ShieldCheck size={12} /> SECURE</span>\n                              ) : s === 'VULNERABLE' ? (\n                                <span className=\"badge badge-vulnerable\"><ShieldAlert size={12} /> VULNERABLE</span>\n                              ) : s === 'EMPTY' ? (\n                                <span className=\"badge badge-secondary\"><Info size={12} /> EMPTY</span>\n                              ) : s === 'INCONCLUSIVE' ? (\n                                <span className=\"badge badge-warning\"><HelpCircle size={12} /> INCONCLUSIVE</span>\n                              ) : (";
  assert.equal(countIn(norm(comp), norm(badgeLadder)), 2, 'the 12px badge ladder appears exactly twice (worst-cell + cell button), verbatim');
});

test('Expanding a cell cannot remount the grid — stable keys, in-place cell updates, no expandedCell-keyed trees', () => {
  // Rows and cells keep their stable identity keys: React reconciles the
  // expanded-cell change as in-place prop updates (border/background swap on
  // the active button), never a remount of the table.
  assert.ok(comp.includes('data-testid={`result-row-${testId}`}'), 'rows keep their stable testid');
  assert.ok(comp.includes('<tr key={testId}'), 'rows are keyed by testId');
  assert.ok(comp.includes('<td key={t.uid}'), 'cells are keyed by target uid');
  assert.doesNotMatch(comp, /key=\{[^}]*expandedCell/, 'no key derives from expandedCell (a key flip would remount the row)');
  assert.ok(comp.includes('onClick={() => setExpandedCell(active ? null : { testId, targetUid: t.uid })}'), 'the cell toggle keeps its exact baseline binding');
  assert.ok(comp.includes("borderColor: active ? 'var(--color-primary)' : 'transparent'"), 'the active-cell highlight stays an in-place style update');
  // The detail panel renders from the SAME component tree (no remount-style
  // conditional sibling swap keyed on expandedCell).
  ordered(comp, 'detail mounting', [
    '{expandedCell && (() => {',
    'const res = results.find(r => r.testId === expandedCell.testId && r.targetUid === expandedCell.targetUid);',
    'if (!res) return null;'
  ]);
});

// ---------------------------------------------------------------------------
// Override persistence through HistoryContext + expanded-cell behaviors
// ---------------------------------------------------------------------------

test('Override set/unset persists through HistoryContext exactly as before (verbatim override wiring)', () => {
  assert.match(comp, /const \{ overrides, effectiveStatus, effectiveDetails \} = useHistory\(\);/,
    'the component consumes the override-aware selectors from HistoryContext (single definition site, T01)');
  ordered(comp, 'component.override row', [
    'Override verdict:',
    "onClick={() => handleResultOverride(res, 'SECURE')}",
    "overrides[resultOverrideKey(res)]?.verdict === 'SECURE' ? 'var(--color-secure)' : undefined",
    "onClick={() => handleResultOverride(res, 'VULNERABLE')}",
    "overrides[resultOverrideKey(res)]?.verdict === 'VULNERABLE' ? 'var(--color-vulnerable)' : undefined",
    "onClick={() => handleResultOverride(res, 'INCONCLUSIVE')}",
    "overrides[resultOverrideKey(res)]?.verdict === 'INCONCLUSIVE' ? 'var(--color-warning)' : undefined",
    'overrides[resultOverrideKey(res)] && (',
    "onClick={() => handleResultOverride(res, null)} className=\"btn-secondary\" style={{ fontSize: '0.7rem', padding: '4px 10px' }}>Clear override</button>"
  ]);
  // The override-aware selectors are owned by HistoryContext; App consumes
  // them from useHistory(). The override handler is owned exactly once across
  // the App ∪ useAuditDetail union (either home may define it).
  assert.match(app, /effectiveStatus,\n    effectiveDetails,\n  \} = useHistory\(\)/, 'App consumes the override-aware selectors from HistoryContext (the engine hook consumes them)');
  assert.match(appAudit, /^  const handleResultOverride = async \(r, status\) => \{/m, 'handleResultOverride is defined exactly once — App today; src/hooks/useAuditDetail.js after T06 — and is wired down as a prop');
});

test('Expanded-cell detail behaviors unchanged (scroll-into-view, vault notice, inspection boxes)', () => {
  ordered(comp, 'component.expanded effect', [
    'if (expandedCell) {',
    "const el = document.querySelector('[data-tour=\"expanded-result\"]');",
    "if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });",
    '}, [expandedCell]);'
  ]);
  ordered(comp, 'component.expanded cell', [
    'const effStatus = effectiveStatus(res);',
    'const isSecure = effStatus === \'SECURE\';',
    'const isError = effStatus === \'ERROR\';',
    'const isEmpty = effStatus === \'EMPTY\';',
    'const isInconclusive = effStatus === \'INCONCLUSIVE\';',
    'data-tour="expanded-result"',
    "borderLeft: `4px solid ${isEmpty ? 'var(--color-secondary)' : (isError || isInconclusive) ? 'var(--color-warning)' : isSecure ? 'var(--color-secure)' : 'var(--color-vulnerable)'}`",
    '{res.testName}',
    'Tactic: {res.tactic} | Model: {modelTargetLabel(res.provider, res.model)}',
    'onClick={() => setExpandedCell(null)}',
    '<X size={14} />'
  ]);
  ordered(comp, 'component.inspection + vault', [
    '{vaultLocked ? (',
    '<Lock size={16} color="var(--color-secondary)" />',
    'Vault locked — unlock your API keys to inspect prompts, responses, and reasoning.',
    'Model System Settings Context',
    '{res.systemPrompt}',
    'Attacker Payload Input',
    '{res.userPrompt}',
    'Model Response Output',
    "{res.response}",
    'Auditor Evaluation Reasoning:',
    '{res.reasoning}'
  ]);
});

// ---------------------------------------------------------------------------
// Shrink gates + engine-hook continuity
// ---------------------------------------------------------------------------

test('Shrink gates — RunnerView.jsx loses the region, the component carries it, App.jsx untouched', () => {
  const appLines = app.split('\n').length;
  const viewLines = view.split('\n').length;
  const compLines = comp.split('\n').length;
  assert.ok(viewLines < 600, `RunnerView.jsx shrank below 600 lines (baseline 821); got ${viewLines}`);
  assert.ok(compLines > 300, `ComparisonResults.jsx carries the moved region (baseline region 339); got ${compLines}`);
  assert.ok(appLines < 5700, `App.jsx stays at its T12 size (baseline ${appLines}); got ${appLines}`);
  // The results declarations are not in the view…
  for (const decl of [
    'const [sortKey, setSortKey]',
    'const [sortDir, setSortDir]',
    'const [showFailedGroup, setShowFailedGroup]',
    'const [showInconclusiveGroup, setShowInconclusiveGroup]',
    'const [showSucceededGroup, setShowSucceededGroup]',
    'const effectiveStatus = (r) => (r ? (overrides[resultOverrideKey(r)] || r.status) : r);',
    'const effectiveDetails = (d) => {'
  ]) {
    assert.ok(!view.includes(decl), `the view lost the moved declaration: ${decl.slice(0, 60)}…`);
  }
  assert.ok(!view.includes("document.querySelector('[data-tour=\"expanded-result\"]')"), 'the expanded-cell scroll effect left the view');
  // …App never imports the component (RunnerView does)…
  assert.ok(!app.includes('components/runner/ComparisonResults'), 'App does not import ComparisonResults (the view owns the mount)');
  assert.match(app, /import RunnerView from '\.\/components\/views\/RunnerView';/, 'App still mounts the view');
  // …and the view keeps every staying surface.
  for (const marker of ['data-tour="runner-lineup"', 'data-tour="add-target"', 'data-tour="payload-selection"', 'data-tour="preset-select"', 'data-tour="run-audit"', 'data-tour="show-console"', 'data-testid="audit-run"', 'data-testid="audit-stop"']) {
    assert.ok(view.includes(marker), `the view keeps its staying surface: ${marker}`);
  }
});

test('The T04 engine-hook wiring stays intact App-side (override derivations + expandedCell flow unchanged)', () => {
  const auditRunBlock = /const \{([\s\S]*?)\n  \} = useAuditRun\(\{([\s\S]*?)\n  \}\);/.exec(app);
  assert.ok(auditRunBlock, 'App still binds the T04 engine hook');
  for (const param of ['targets', 'selectedTests', 'evalMode', 'setExpandedCell', 'effectiveStatus', 'effectiveDetails', 'useDemoMode', 'judgeConfig', 'providers']) {
    assert.match(auditRunBlock[2], new RegExp(`\\b${param}\\b`), `the engine hook still receives ${param}`);
  }
  assert.ok(app.includes('const [expandedCell, setExpandedCell] = useState(null);'), 'expandedCell stays App-owned (the engine hook receives setExpandedCell)');
  assert.ok(app.includes('runAudit: runSecurityAudit,\n    stopAudit: stopSecurityAudit,'), 'the run/stop aliases stay intact');
  // The overridden statuses still feed the history badge ladders — the four
  // literals resolve across the App ∪ modal union.
  for (const status of ['VULNERABLE', 'SECURE', 'EMPTY', 'INCONCLUSIVE']) {
    assert.match(app + '\n' + auditModal, new RegExp(`'${status}'`), `${status} remains a status literal the UI knows`);
  }
  // Technical-result filtering is owned by the reevaluation service.
  assert.match(reevaluation, /if \(detail\.status === 'ERROR' \|\| detail\.status === 'EMPTY'\)/, 'the technical-skip branch moved to the service');
});
