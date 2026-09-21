// Contract: src/hooks/useAuditDetail.js owns the audit detail glue — the
// selectedAudit/expandedDetailIds state and the five handlers
// handleResultOverride, handleDeleteAudit, clearHistory, toggleExpandedDetail
// and printRunReport — with the bodies byte-identical to their source
// (byte-pinned below). App.jsx consumes the hook through a nine-name
// destructure, sheds the moved bodies and the now-unused clearAuditHistory
// import, and keeps the DashboardView / RunnerView / AuditDetailModal wiring
// byte-identical. setDemoMode, expandedCell, log() and resetAllData stay
// App-side.
//
// Source-text level because Node cannot import JSX/extensionless specifiers
// under bare node:test (see tests/judge-merge.unit.test.mjs, the sibling hook
// suites). Regions are located by content, never by line numbers. Fully
// hermetic: no server, no network, no dev server.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const HOOK_PATH = 'src/hooks/useAuditDetail.js';
const APP_PATH = 'src/App.jsx';
const MODAL_PATH = 'src/components/modals/AuditDetailModal.jsx';

const sourceOf = (relPath) => readFileSync(join(root, relPath), 'utf8').replace(/\r\n/g, '\n');
const readIfExists = (relPath) => { try { return sourceOf(relPath); } catch { return ''; } };
const hook = readIfExists(HOOK_PATH);
const app = sourceOf(APP_PATH);
let auditModal = '';
try { auditModal = sourceOf(MODAL_PATH); } catch { /* modal absent */ }

// --- byte pins (exact source, hook-side) ------------------------------------

const EXPECTED_HANDLE_RESULT_OVERRIDE = [
  '  const handleResultOverride = async (r, status) => {',
  "    if (vaultLocked) { addToast('Unlock your API keys to change verdict overrides.'); return; }",
  '    if (status === null) { await setResultOverride(r, null); return; }',
  '    const choice = await new Promise(resolve => setConfirmState({',
  "      type: 'override',",
  '      message: `Override verdict to ${status}`,',
  "      inputValue: effectiveDetails(r).overrideReason || '',",
  '      onSave: reason => setResultOverride(r, status, reason),',
  '      resolve,',
  '    }));',
  "    if (choice?.action === 'improve') await openMergeWithFeedback(r, choice.reason);",
  '  };',
].join('\n');

const EXPECTED_HANDLE_DELETE_AUDIT = [
  '  const handleDeleteAudit = async (id) => {',
  '    if (!(await deleteAudit(id))) return;',
  '    if (selectedAudit && selectedAudit.id === id) setSelectedAudit(null);',
  '  };',
].join('\n');

const EXPECTED_CLEAR_HISTORY = [
  '  const clearHistory = async () => {',
  "    if (await askConfirm('Delete ALL audit history?\\n\\nThis permanently removes every stored run (prompts, responses, verdicts, overrides) from this browser and recomputes the dashboard from an empty history.')) {",
  '      if (!(await replaceAuditHistory([]))) return;',
  '      clearAuditHistory().catch(err => addToast(`Could not clear detailed audit history: ${redactSensitiveText(err.message)}`));',
  '      setOverrides({});',
  '      try {',
  "        localStorage.setItem('atlas_result_overrides', '{}');",
  '      } catch (err) {',
  '        addToast(`History cleared, but override cleanup failed: ${redactSensitiveText(err?.message || err)}`);',
  '      }',
  '      setSelectedAudit(null);',
  "      addToast('Audit history cleared.');",
  '    }',
  '  };',
].join('\n');

const EXPECTED_TOGGLE_EXPANDED_DETAIL = [
  '  const toggleExpandedDetail = (key) => setExpandedDetailIds(prev => {',
  '    const next = new Set(prev);',
  '    if (next.has(key)) next.delete(key);',
  '    else next.add(key);',
  '    return next;',
  '  });',
].join('\n');

const EXPECTED_PRINT_RUN_REPORT = [
  '  const printRunReport = (results, { title, subtitle, meta } = {}) => {',
  '    if (vaultLocked) {',
  "      addToast('Unlock your API keys to generate reports.');",
  '      return;',
  '    }',
  '    if (!vaultSupported()) {',
  "      addToast('Reports require IndexedDB support (secure context).');",
  '      return;',
  '    }',
  '    if (!results || results.length === 0) {',
  '      addToast(\'No results to report yet.\');',
  '      return;',
  '    }',
  '    openPrintableReport(window, buildRunReportBody({ results: results.map(effectiveDetails), title, subtitle, meta, providerLabel }), { addToast });',
  '  };',
].join('\n');

const EXPECTED_STATE = [
  '  const [selectedAudit, setSelectedAudit] = useState(null); // historical audit record opened in the detail modal',
  '  const [expandedDetailIds, setExpandedDetailIds] = useState(() => new Set());',
].join('\n');

// Extracts a handler/const body at the body indent (2 spaces): from its
// `  const NAME = ` declaration through the closing `  };` / `  });`.
function extractConst(source, name) {
  const re = new RegExp(`^  const ${name} = `, 'm');
  const m = re.exec(source);
  assert.ok(m, `member ${name} not found at the 2-space body indent`);
  const lines = source.slice(m.index).split('\n');
  const first = lines[0];
  if (/;\s*$/.test(first)) return first;
  const buf = [first];
  const nextDecl = /^  (const \w+ = |useEffect\(|function )/;
  for (let i = 1; i < lines.length; i++) {
    if (i > 1 && nextDecl.test(lines[i])) assert.fail(`member ${name} never closed before the next declaration`);
    buf.push(lines[i]);
    if (lines[i] === '  };' || lines[i] === '  });') return buf.join('\n');
  }
  assert.fail(`member ${name} has no closing line`);
}

// Walks src/ and reports every file containing a needle (declaration sites).
const declarationSites = (needle) => {
  const sites = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const absPath = join(dir, entry.name);
      if (entry.isDirectory()) { walk(absPath); continue; }
      if (!/\.(js|jsx)$/.test(entry.name)) continue;
      const count = readFileSync(absPath, 'utf8').replace(/\r\n/g, '\n').split(needle).length - 1;
      if (count > 0) sites.push({ relPath: absPath.slice(root.length + 1), count });
    }
  };
  walk(join(root, 'src'));
  return sites;
};

const expectSingleSite = (needle, relPath, label) => {
  const sites = declarationSites(needle);
  assert.deepEqual(
    sites.map((s) => `${s.relPath} (${s.count}x)`),
    [`${relPath} (1x)`],
    `${label} must live exactly once, in ${relPath}`
  );
};

const norm = (text) => text.replace(/\s+/g, ' ').trim();

// The <DashboardView … /> wiring block inside App.jsx.
function dashboardWiringBlock() {
  const start = app.indexOf('<DashboardView');
  assert.ok(start >= 0, 'App.jsx mounts <DashboardView … />');
  const end = app.indexOf('/>', start);
  assert.ok(end > start, 'the <DashboardView mount is self-closed');
  return app.slice(start, end + 2);
}

// The <AuditDetailModal … /> wiring block inside App.jsx.
function modalWiringBlock() {
  const start = app.indexOf('<AuditDetailModal');
  assert.ok(start >= 0, 'App.jsx mounts <AuditDetailModal');
  const end = app.indexOf('/>', start);
  assert.ok(end > start, 'the <AuditDetailModal mount is self-closed');
  return app.slice(start, end + 2);
}

// The <RunnerView … /> wiring block: from the open tag to the standalone
// self-close that follows the handleResultOverride wire.
function runnerWiringBlock() {
  const start = app.indexOf('<RunnerView');
  assert.ok(start >= 0, 'App.jsx mounts <RunnerView');
  const tail = app.slice(start);
  const wire = tail.indexOf('handleResultOverride={handleResultOverride}');
  assert.ok(wire >= 0, 'RunnerView receives handleResultOverride as a prop');
  const close = /^\s*\/>\s*$/m.exec(tail.slice(wire));
  assert.ok(close, 'the <RunnerView mount self-closes after the handleResultOverride wire');
  return tail.slice(0, wire + close.index + close[0].length);
}

// --- the hook owns the audit-detail state and the five handlers --------------

test('useAuditDetail exists with the declared deps bag and helper imports', () => {
  assert.ok(hook, 'src/hooks/useAuditDetail.js exists (T06 extraction landed)');
  const sigStart = hook.indexOf('export function useAuditDetail({');
  const sigEnd = hook.indexOf('}) {', sigStart);
  assert.ok(sigEnd > sigStart, 'the hook is `export function useAuditDetail({ … }) {');
  const sig = norm(hook.slice(sigStart, sigEnd));
  const DEPS = ['deleteAudit', 'replaceAuditHistory', 'setResultOverride', 'setOverrides', 'effectiveDetails', 'vaultLocked', 'vaultSupported', 'openPrintableReport', 'buildRunReportBody', 'providerLabel', 'askConfirm', 'addToast', 'openMergeWithFeedback'];
  const inner = sig.slice(sig.indexOf('{') + 1);
  const names = inner.split(',').map((t) => t.trim()).filter(Boolean);
  assert.deepEqual(names, DEPS, `the deps bag is exactly { ${DEPS.join(', ')} }`);
  assert.ok(/^import \{ useState \} from 'react';$/m.test(hook), 'the hook imports useState (it owns the state)');
  assert.ok(/^import \{ clearAuditHistory \} from '\.\.\/utils\/vault';$/m.test(hook), 'the hook imports clearAuditHistory from the vault utils');
  assert.ok(/^import \{ redactSensitiveText \} from '\.\.\/utils\/redact';$/m.test(hook), 'the hook imports redactSensitiveText for the toast copy');
});

test('the audit-detail state is hook-owned with the exact useState shapes', () => {
  const block = hook.match(/^  const \[selectedAudit, setSelectedAudit\][^\n]*\n^  const \[expandedDetailIds, setExpandedDetailIds\][^\n]*$/m);
  assert.ok(block, 'the two state declarations are adjacent at the hook-body indent');
  assert.equal(block[0], EXPECTED_STATE, 'the state pair drifted from the byte pin');
  assert.ok(!app.includes('const [selectedAudit, setSelectedAudit]'), 'App no longer declares selectedAudit');
  assert.ok(!app.includes('const [expandedDetailIds, setExpandedDetailIds]'), 'App no longer declares expandedDetailIds');
});

test('override orchestration stays hook-side with pending dialog and explicit AI delegation', () => {
  const body = extractConst(hook, 'handleResultOverride');
  assert.equal(body, EXPECTED_HANDLE_RESULT_OVERRIDE, 'handleResultOverride drifted from the byte pin');
  const o = norm(body);
  assert.ok(o.includes('onSave: reason => setResultOverride(r, status, reason)'), 'only dialog acceptance commits the pending choice');
  assert.ok(o.includes('if (status === null)'), 'clearing still bypasses the feedback loop');
  assert.ok(o.includes("if (choice?.action === 'improve') await openMergeWithFeedback(r, choice.reason);"), 'AI requires the explicit action');
});

test('handleDeleteAudit body is byte-identical hook-side', () => {
  const body = extractConst(hook, 'handleDeleteAudit');
  assert.equal(body, EXPECTED_HANDLE_DELETE_AUDIT, 'handleDeleteAudit drifted from the byte pin');
  assert.ok(norm(body).includes('if (selectedAudit && selectedAudit.id === id) setSelectedAudit(null);'), 'deleting the open record also closes the detail panel');
});

test('clearHistory body is byte-identical hook-side — confirm → replace → vault clear → state → storage order', () => {
  const body = extractConst(hook, 'clearHistory');
  assert.equal(body, EXPECTED_CLEAR_HISTORY, 'clearHistory drifted from the byte pin');
  const b = body;
  const confirm = b.indexOf('Delete ALL audit history?');
  const replace = b.indexOf('if (!(await replaceAuditHistory([]))) return;');
  const vaultClear = b.indexOf('clearAuditHistory().catch(err => addToast(`Could not clear detailed audit history: ${redactSensitiveText(err.message)}`));');
  const stateWipe = b.indexOf('setOverrides({});');
  const lsWipe = b.indexOf("localStorage.setItem('atlas_result_overrides', '{}');");
  const panelClose = b.indexOf('setSelectedAudit(null);');
  const success = b.indexOf("addToast('Audit history cleared.');");
  assert.ok(confirm >= 0 && replace > confirm, 'confirm precedes any mutation');
  assert.ok(vaultClear > replace && stateWipe > vaultClear && lsWipe > stateWipe, 'order: replace([]) → vault clear → overrides wipe → storage wipe');
  assert.ok(panelClose > lsWipe && success > panelClose, 'the detail panel closes and the success toast lands after the storage wipe');
});

test('toggleExpandedDetail body is byte-identical hook-side', () => {
  const body = extractConst(hook, 'toggleExpandedDetail');
  assert.equal(body, EXPECTED_TOGGLE_EXPANDED_DETAIL, 'toggleExpandedDetail drifted from the byte pin');
  const b = body;
  assert.ok(b.includes('const next = new Set(prev);'), 'the toggle copies the Set before mutating');
  assert.ok(b.indexOf('next.delete(key)') < b.indexOf('next.add(key)'), 'the toggle deletes present keys and adds absent ones');
});

test('printRunReport body is byte-identical hook-side (vault gate, IndexedDB gate, empty gate, builder call)', () => {
  const body = extractConst(hook, 'printRunReport');
  assert.equal(body, EXPECTED_PRINT_RUN_REPORT, 'printRunReport drifted from the byte pin');
  const b = body;
  const vaultGate = b.indexOf('Unlock your API keys to generate reports.');
  const idbGate = b.indexOf('Reports require IndexedDB support (secure context).');
  const emptyGate = b.indexOf('No results to report yet.');
  const build = b.indexOf('openPrintableReport(window, buildRunReportBody({ results: results.map(effectiveDetails), title, subtitle, meta, providerLabel }), { addToast });');
  assert.ok(vaultGate >= 0 && idbGate > vaultGate && emptyGate > idbGate, 'gate order: locked vault → IndexedDB support → empty results');
  assert.ok(build > emptyGate, 'the builder runs only after every gate passes');
});

test('the shared helpers are read through the declared deps, never re-declared', () => {
  const o = norm(hook);
  assert.ok(o.includes('const reply') === false, 'no stray local reply binding');
  for (const dep of ['deleteAudit', 'replaceAuditHistory', 'setResultOverride', 'setOverrides', 'effectiveDetails', 'vaultLocked', 'vaultSupported', 'openPrintableReport', 'buildRunReportBody', 'providerLabel', 'askConfirm', 'askInput', 'addToast', 'openMergeWithFeedback', 'clearAuditHistory']) {
    assert.ok(!new RegExp(`^  const ${dep} = `, 'm').test(hook), `${dep} must arrive via the deps bag or a module import, not a local re-declaration`);
  }
});

test('the hook returns the nine names App destructures', () => {
  assert.ok(norm(hook).includes('return { selectedAudit, setSelectedAudit, expandedDetailIds, setExpandedDetailIds, toggleExpandedDetail, handleDeleteAudit, handleResultOverride, printRunReport, clearHistory };'),
    'the hook returns { selectedAudit, setSelectedAudit, expandedDetailIds, setExpandedDetailIds, toggleExpandedDetail, handleDeleteAudit, handleResultOverride, printRunReport, clearHistory }');
});

// --- App consumes the hook, sheds the moved bodies, keeps the wiring ---------

test('App destructures the nine names from useAuditDetail with the declared deps bag', () => {
  const expected = `const { selectedAudit, setSelectedAudit, expandedDetailIds, setExpandedDetailIds, toggleExpandedDetail, handleDeleteAudit, handleResultOverride, printRunReport, clearHistory } = useAuditDetail({ deleteAudit, replaceAuditHistory, setResultOverride, setOverrides, effectiveDetails, vaultLocked, vaultSupported, openPrintableReport, buildRunReportBody, providerLabel, askConfirm, askInput, addToast, openMergeWithFeedback });`;
  assert.match(norm(app), new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\ /g, '\\s+')),
    'App consumes the hook through the nine-name shape with the 14-name deps bag');
});

test('App sheds the moved bodies', () => {
  for (const moved of [
    'const handleResultOverride =',
    'const handleDeleteAudit =',
    'const clearHistory =',
    'const toggleExpandedDetail =',
    'const printRunReport =',
    'const [selectedAudit, setSelectedAudit]',
    'const [expandedDetailIds, setExpandedDetailIds]',
  ]) {
    assert.ok(!app.includes(moved), `App no longer declares ${moved.slice(6)} (hook-side since T06)`);
  }
});

test('App sheds the now-unused clearAuditHistory but keeps vaultSupported and the report-builder pair', () => {
  const vaultImport = app.split('\n').find((l) => l.startsWith('import ') && l.includes("from './utils/vault';"));
  assert.ok(vaultImport, 'App keeps a vault import');
  // The provider-side vault-write pair may leave App's import (usages live in
  // HistoryContext/ProvidersContext/useBackupFlow); each shed name must stay
  // imported by at least one sanctioned owner. vaultSupported and
  // saveSourceUrls stay bound App-side.
  const ownerSrcs = ['src/context/HistoryContext.jsx', 'src/context/ProvidersContext.jsx', 'src/hooks/useBackupFlow.js']
    .map((rel) => { try { return readFileSync(join(root, rel), 'utf8'); } catch { return ''; } })
    .filter(Boolean);
  for (const kept of ['vaultSupported', 'saveSourceUrls']) {
    assert.ok(vaultImport.includes(kept), `App keeps ${kept} on the vault import`);
  }
  for (const moved of ['loadAuditHistory', 'saveAuditHistory']) {
    if (!vaultImport.includes(moved)) {
      assert.ok(ownerSrcs.some((s) => s.includes(moved)), `${moved} left the App vault import — a sanctioned provider-side owner must carry it (T07`);
    }
  }
  assert.ok(!vaultImport.includes('clearAuditHistory'), 'App sheds clearAuditHistory (hook-side via ../utils/vault)');
  assert.ok(app.includes("import { openPrintableReport, buildRunReportBody } from './utils/report-builder';"),
    'App keeps the report-builder import (the pair travels through the deps bag)');
});

test('the DashboardView wiring of the detail-panel props is byte-identical', () => {
  for (const prop of [
    'setSelectedAudit={setSelectedAudit}',
    'setExpandedDetailIds={setExpandedDetailIds}',
    'clearHistory={clearHistory}',
    'printRunReport={printRunReport}',
    'handleDeleteAudit={handleDeleteAudit}',
  ]) {
    assert.ok(dashboardWiringBlock().includes(prop), `DashboardView still wires ${prop}`);
  }
});

test('the AuditDetailModal wiring is byte-identical', () => {
  if (!auditModal) { assert.ok(true, 'no modal at the pre-T02 baseline'); return; }
  for (const prop of [
    'selectedAudit={selectedAudit}',
    'expandedDetailIds={expandedDetailIds}',
    'onToggleDetail={toggleExpandedDetail}',
    'onDelete={handleDeleteAudit}',
    'onPrintReport={printRunReport}',
    'onResultOverride={handleResultOverride}',
  ]) {
    assert.ok(modalWiringBlock().includes(prop), `AuditDetailModal still wires ${prop}`);
  }
});

test('the RunnerView wiring is byte-identical', () => {
  const wire = runnerWiringBlock();
  assert.ok(wire.includes('printRunReport={printRunReport}'), 'RunnerView still wires printRunReport');
  assert.ok(wire.includes('handleResultOverride={handleResultOverride}'), 'RunnerView still wires handleResultOverride');
});

test('setDemoMode stays App-side (neither hook-owned nor re-derived)', () => {
  assert.ok(app.includes('const setDemoMode = (v) => {'), 'setDemoMode remains an App-side function');
  assert.ok(!hook.includes('const setDemoMode ='), 'the hook does not redefine setDemoMode');
});

// --- the bodies are pinned exactly once tree-wide ----------------------------

test('the audit-glue bodies are defined exactly once tree-wide, in the hook', () => {
  expectSingleSite('const handleResultOverride =', HOOK_PATH, 'handleResultOverride');
  expectSingleSite('const handleDeleteAudit =', HOOK_PATH, 'handleDeleteAudit');
  expectSingleSite('const clearHistory =', HOOK_PATH, 'clearHistory');
  expectSingleSite('const toggleExpandedDetail =', HOOK_PATH, 'toggleExpandedDetail');
  expectSingleSite('const printRunReport =', HOOK_PATH, 'printRunReport');
  expectSingleSite('const [selectedAudit, setSelectedAudit]', HOOK_PATH, 'the selectedAudit state');
  expectSingleSite('const [expandedDetailIds, setExpandedDetailIds]', HOOK_PATH, 'the expandedDetailIds state');
});
