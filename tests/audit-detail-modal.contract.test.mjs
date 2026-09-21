// Contract: the audit-detail modal — the
// auditDetails derivation via effectiveDetails, the secure/vulnerable
// resilience score, the modelTargetLabel list, the statusColor/detailKey
// helpers, the four override buttons calling handleResultOverride(d, …) and
// the print/delete/close header buttons — renders from
// src/components/modals/AuditDetailModal.jsx as a props-in/events-out
// component, while App owns selectedAudit/expandedDetailIds state, the
// App-owned handlers (handleResultOverride/handleDeleteAudit/printRunReport/
// the expanded-set toggle) and the tab shell.
//
// The detail state and five handlers may live in App or in
// src/hooks/useAuditDetail.js, so the kept-state/kept-handler pins below
// resolve against the App ∪ useAuditDetail union (the hook read is tolerant:
// when the hook is absent the union degrades to App alone). The union still
// holds each item exactly once; the thirteen-prop mount, the selectedAudit
// guard and the section comment are untouched.
//
// Source-text level because Node cannot import JSX/extensionless specifiers
// under bare node:test (repo convention: see tests/tests-view.contract.test.mjs,
// tests/matrix-view.contract.test.mjs). Hermetic: no dev server, no network,
// no browser, deterministic only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP_PATH = 'src/App.jsx';
const MODAL_PATH = 'src/components/modals/AuditDetailModal.jsx';

const readSource = (relPath) => readFileSync(join(root, relPath), 'utf8').replace(/\r\n/g, '\n');
let app = '', modal = '';
let auditHook = '';
try {
  app = readSource(APP_PATH);
  modal = readSource(MODAL_PATH);
  try { auditHook = readSource('src/hooks/useAuditDetail.js'); } catch { /* no audit hook */ }
} catch { /* missing files fail their first assertion */ }

const norm = (text) => text.replace(/\s+/g, ' ').trim();
const countIn = (source, needle) => source.split(needle).length - 1;
// The detail state + handlers resolve across App ∪ useAuditDetail.
const appAudit = app + '\n' + auditHook;
const lineCount = (source) => source.replace(/\n+$/, '').split('\n').length;
const body = norm(modal);

// Ordered-substring helper over a normalized region: pins presence AND order.
const ordered = (label, needles) => {
  let cursor = -1;
  for (const needle of needles) {
    const at = body.indexOf(needle, cursor + 1);
    assert.ok(at > cursor, `${label}: expected ${JSON.stringify(needle)} after offset ${cursor} (ordering pin)`);
    cursor = at;
  }
};

// ---------------------------------------------------------------------------
// the modal is real, props-in/events-out, gated module-side, no hooks
// ---------------------------------------------------------------------------

test('AuditDetailModal.jsx is the real modal — default export, real surface, no stub remnants', () => {
  assert.match(modal, /export default function AuditDetailModal\(\{/, 'the modal is exported as a props-bag component');
  for (const marker of ['Audit Details', 'GroundRumble Security Audit Report', 'Override verdict', 'zIndex: 115,', 'This audit record has no evaluation details.']) {
    assert.ok(modal.includes(marker), `the modal renders ${marker}`);
  }
  assert.ok(lineCount(modal) > 150, `the modal carries the moved region (the file is new); got ${lineCount(modal)}`);
  assert.doesNotMatch(modal, /AI Prompts view|Manage and test prompt templates/, 'no foreign stub copy');
});

test('The props-in contract is exactly the thirteen roadmap names — state stays App-side, handlers aliased', () => {
  const sig = /export default function AuditDetailModal\(\{([\s\S]*?)\}\) \{/.exec(modal);
  assert.ok(sig, 'the modal signature is a destructured props bag');
  const names = sig[1].split(',').map(s => s.trim()).filter(Boolean);
  assert.deepEqual(names, [
    'selectedAudit',
    'expandedDetailIds',
    'onToggleDetail',
    'onClose',
    'onDelete: handleDeleteAudit',
    'onPrintReport: printRunReport',
    'onResultOverride: handleResultOverride',
    'effectiveDetails',
    'modelTargetLabel',
    'overrides',
    'vaultLocked',
    'vaultPassphraseSet',
    'addToast',
  ], 'exactly the thirteen roadmap props, in order, with the three event-out aliases');
  assert.doesNotMatch(modal, /\buseState\b|\buseEffect\b|\buseRef\b|\buseMemo\b|\buseCallback\b/, 'the modal declares no hooks — state stays App-side');
  assert.doesNotMatch(modal, /useHistory\(|useProviders\(|useUI\(|useSettings\(|useTests\(/, 'the modal consumes no contexts — props only');
  assert.doesNotMatch(modal, /\bfetch\(|localStorage/, 'the modal does no I/O');
  assert.doesNotMatch(modal, /import .*App/, 'the modal never imports App');
});

test('The selectedAudit gate is module-side before the JSX; the moved imports are exact', () => {
  const gate = /if \(!selectedAudit\) return null;/;
  assert.ok(gate.test(modal), 'the modal gates on selectedAudit presence module-side');
  const gateAt = modal.search(gate);
  const returnAt = modal.lastIndexOf('return (');
  assert.ok(gateAt >= 0 && returnAt > gateAt, 'the gate precedes the JSX return');
  assert.equal(countIn(modal, 'if (!selectedAudit) return null;'), 1, 'exactly one module-side gate');
  assert.match(modal, /import \{ Download, Trash2, X, ChevronUp, ChevronDown \} from 'lucide-react';/, 'the lucide import carries exactly the five moved icons');
  assert.match(modal, /import \{ resultOverrideKey \} from '\.\.\/\.\.\/context\/HistoryContext';/, 'the modal imports the shared key template from HistoryContext (the t10/history-verdict-selectors union pin resolves modal-side)');
  assert.equal(countIn(modal, "from '../../context/HistoryContext';"), 1, 'exactly one HistoryContext import');
});

// ---------------------------------------------------------------------------
// the dialog region — byte-exact needles, presence AND order
// ---------------------------------------------------------------------------

test('The derivation keeps effectiveDetails mapping, score, and modelList across T07 centralization', () => {
  ordered('derivation boundaries', [
    'const auditDetails = (selectedAudit.details || []).map(effectiveDetails);',
    "const modelList = selectedAudit.targets?.map(t => modelTargetLabel(t.provider, t.model)) || [];",
  ]);
  const legacy = body.includes("const auditSecure = auditDetails.filter(d => d.status === 'SECURE').length;")
    && body.includes('const auditScore = auditValid > 0 ? Math.round((auditSecure / auditValid) * 100) : null;');
  const centralized = body.includes('summarizeVerdicts(auditDetails)');
  assert.ok(legacy || centralized, 'audit summary is either baseline-inline or delegated to summarizeVerdicts');
});

test('The statusColor/detailKey helpers moved verbatim; the expanded-set toggle is App-owned now', () => {
  assert.ok(body.includes("const statusColor = (s) => s === 'VULNERABLE' ? 'var(--color-vulnerable)' : s === 'SECURE' ? 'var(--color-secure)' : s === 'EMPTY' ? 'var(--text-muted)' : 'var(--color-warning)';"), 'statusColor maps the four verdict colors in exact order');
  assert.ok(body.includes('const detailKey = (d) => `${d.timestamp}-${d.targetUid}-${d.testId}`;'), 'detailKey composes timestamp-targetUid-testId');
  assert.equal(countIn(modal, 'const toggleDetail'), 0, 'the Set-toggle left the modal — App owns it (toggled via onToggleDetail)');
  assert.ok(body.includes('const next = new Set(prev);') === false, 'no Set-toggle body in the modal');
});

test('The header keeps the title, subtitle copy, print and delete buttons byte-exactly; close goes through onClose', () => {
  ordered('header', [
    '<h3 style={{ fontSize: \'1.15rem\', fontWeight: 800 }}>Audit Details</h3>',
    "'Full record of the selected historical run, including payloads and model responses.'",
    "'Summary record of the selected historical run. Detailed evidence is not stored in unencrypted history.'",
    '<button',
    'onClick={() => printRunReport(auditDetails, {',
    "title: 'GroundRumble Security Audit Report',",
    "subtitle: `${selectedAudit.isDemo ? 'Simulation' : 'Live API'} Audit — ${new Date(selectedAudit.timestamp).toLocaleString()}`,",
    'meta: [`Targets: ${modelList.length > 0 ? modelList.join(\' · \') : (selectedAudit.model || \'—\')}`]',
    'disabled={vaultLocked && (vaultPassphraseSet ?? false)}',
    '<Download size={14} style={{ marginRight: \'6px\' }} />',
    'Download Report',
  ]);
  assert.ok(body.includes("onClick={() => handleDeleteAudit(selectedAudit.id)} disabled={vaultLocked && (vaultPassphraseSet ?? false)} className=\"btn-secondary icon-btn\" data-tip=\"Delete\""), 'delete calls the aliased handleDeleteAudit with the vault gate and Delete tooltip');
  assert.ok(body.includes('<Trash2 size={14} />'), 'delete button icon');
  assert.equal(countIn(modal, 'onClick={onClose}'), 2, 'close (header X + footer Close) goes through onClose exactly twice');
  assert.ok(body.includes('<X size={14} />'), 'header close icon');
  assert.ok(body.includes('data-tip="Close"'), 'header close tooltip');
});

test('The summary metadata row and the resilience badge moved verbatim (70/40 thresholds)', () => {
  const sumStart = body.indexOf('{/* Summary metadata */}');
  const sumEnd = body.indexOf('{/* Evaluations list */}');
  assert.ok(sumStart > 0 && sumEnd > sumStart, 'precondition: the summary row sits between its section comments');
  const summary = body.slice(sumStart, sumEnd);
  ordered('summary labels', ['Date', 'Targets', 'Mode', 'Evaluations', 'Resilience']);
  assert.ok(summary.includes('{new Date(selectedAudit.timestamp).toLocaleString()}'), 'the Date value renders the audit timestamp');
  assert.ok(summary.includes("{modelList.length > 0 ? modelList.join(' · ') : (selectedAudit.model || '—')}"), 'the Targets value joins the model labels');
  assert.ok(summary.includes("{selectedAudit.isDemo ? 'Simulation' : 'Live API'}"), 'the Mode value distinguishes simulation vs live');
  assert.ok(summary.includes('{auditDetails.length}'), 'the Evaluations value is the derived count');
  assert.ok(body.includes('title="No valid (secure or vulnerable) verdicts in this run."'), 'the zero-valid-verdicts tooltip copy');
  ordered('score badge', [
    '{auditScore === null ? (',
    '<span className="badge badge-secondary" style={{ marginTop: \'2px\' }} title="No valid (secure or vulnerable) verdicts in this run.">—</span>',
    "<span className={`badge ${auditScore > 70 ? 'badge-secure' : auditScore > 40 ? 'badge-warning' : 'badge-vulnerable'}`}",
    '{auditScore}%',
  ]);
});

test('The evaluations list keeps the empty state, rows and status badges in order', () => {
  ordered('evaluations', [
    '{auditDetails.length === 0 ? (',
    'This audit record has no evaluation details.',
    'auditDetails.map((d, i) => {',
    'const expanded = expandedDetailIds.has(detailKey(d));',
    '<div key={detailKey(d)}',
    '{i + 1}.</span> {d.testName}',
    '{d.techniqueId}</span>',
    '{d.tactic}</span>',
    '{modelTargetLabel(d.provider, d.model)} · {d.techniqueName}',
    '<span className="badge" style={{ color: statusColor(d.status), border: `1px solid ${statusColor(d.status)}` }}>{d.status}</span>',
  ]);
});

test('The View/Hide toggle keeps its vaultLocked toast gate and expands through onToggleDetail(detailKey(d))', () => {
  assert.equal(countIn(modal, "onClick={() => { if (vaultLocked) { addToast('Unlock your API keys to view evaluation details.'); return; } onToggleDetail(detailKey(d)); }}"), 1, 'the toggle button keeps the locked-vault toast gate and reports the derived key through onToggleDetail');
  assert.ok(body.includes('{expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />} {expanded ? \'Hide\' : \'View\'}'), 'the toggle label/icon pair follows expanded');
  assert.equal(countIn(modal, '{expanded && !vaultLocked && ('), 1, 'the expanded panel double-gates on expanded AND unlocked vault');
});

test('The expanded panel keeps its four code-box sections with exact labels and privacy-aware fallbacks', () => {
  ordered('expanded panel', [
    'System Prompt (context)',
    "evidenceText(d.systemPrompt, '(none)')",
    'Attack Payload (user prompt)',
    "evidenceText(d.userPrompt, '(none)')",
    'Model Response',
    'Evaluation Reasoning',
    "evidenceText(d.reasoning, '(none)')",
  ]);
  assert.ok(modal.includes('Detailed evidence not stored in unencrypted history.'), 'withheld-evidence wording present');
});

test('The four override buttons moved byte-exactly through the handleResultOverride alias', () => {
  ordered('override cluster', [
    'Override verdict',
    "<button onClick={() => handleResultOverride(d, 'SECURE')} className=\"btn-secondary\" style={{ fontSize: '0.7rem', padding: '4px 10px', color: overrides[resultOverrideKey(d)]?.verdict === 'SECURE' ? 'var(--color-secure)' : undefined }}>Secure</button>",
    "<button onClick={() => handleResultOverride(d, 'VULNERABLE')} className=\"btn-secondary\" style={{ fontSize: '0.7rem', padding: '4px 10px', color: overrides[resultOverrideKey(d)]?.verdict === 'VULNERABLE' ? 'var(--color-vulnerable)' : undefined }}>Vulnerable</button>",
    "<button onClick={() => handleResultOverride(d, 'INCONCLUSIVE')} className=\"btn-secondary\" style={{ fontSize: '0.7rem', padding: '4px 10px', color: overrides[resultOverrideKey(d)]?.verdict === 'INCONCLUSIVE' ? 'var(--color-warning)' : undefined }}>Inconclusive</button>",
    '{overrides[resultOverrideKey(d)] && (',
    '<button onClick={() => handleResultOverride(d, null)} className="btn-secondary" style={{ fontSize: \'0.7rem\', padding: \'4px 10px\' }}>Clear override</button>',
  ]);
  assert.equal(countIn(modal, 'handleResultOverride(d, '), 4, 'exactly the four override call sites live in the modal (the t12 union pin counts 4 here post-T02)');
  assert.equal(countIn(modal, 'resultOverrideKey(d)'), 4, 'each button (and the clear-override condition) colors off overrides[resultOverrideKey(d)]');
});

test('The footer keeps its count copy, the Close affordance and the overlay zIndex pin', () => {
  ordered('footer', [
    '{auditDetails.length} evaluation{auditDetails.length === 1 ? \'\' : \'s\'}',
    '<button onClick={onClose} className="btn-secondary">',
    'Close',
  ]);
  assert.ok(body.includes('zIndex: 115,'), 'the overlay zIndex pin (115) is unchanged');
});

// ---------------------------------------------------------------------------
// the App seam — mount, kept state/handlers, the App-owned toggle
// ---------------------------------------------------------------------------

test('App imports the modal and mounts it under the selectedAudit guard with all thirteen props wired', () => {
  assert.ok(app.includes("import AuditDetailModal from './components/modals/AuditDetailModal';"), 'App imports the modal');
  assert.ok(app.includes('{selectedAudit && ('), 'the selectedAudit guard stays App-side');
  const mountStart = app.indexOf('<AuditDetailModal');
  assert.ok(mountStart > 0, 'App mounts <AuditDetailModal');
  const mount = app.slice(mountStart, app.indexOf('/>', mountStart) + 2);
  for (const prop of [
    'selectedAudit={selectedAudit}',
    'expandedDetailIds={expandedDetailIds}',
    'onToggleDetail={toggleExpandedDetail}',
    'onClose={() => setSelectedAudit(null)}',
    'onDelete={handleDeleteAudit}',
    'onPrintReport={printRunReport}',
    'onResultOverride={handleResultOverride}',
    'effectiveDetails={effectiveDetails}',
    'modelTargetLabel={modelTargetLabel}',
    'overrides={overrides}',
    'vaultLocked={vaultLocked}',
    'vaultPassphraseSet={vaultPassphraseSet}',
    'addToast={addToast}',
  ]) {
    assert.ok(mount.includes(prop), `the mount wires ${prop}`);
  }
  assert.ok(app.includes('{/* 4d. BULK IMPORT MODAL */}'), 'the bulk-import neighbour region stays');
});

test('The App ∪ useAuditDetail home keeps the detail state and every aliased handler; the expanded-set toggle is owned there', () => {
  assert.equal(countIn(appAudit, 'const [selectedAudit, setSelectedAudit] = useState(null);'), 1, 'selectedAudit stays declared exactly once (App today; src/hooks/useAuditDetail.js after T06 — t10 pin)');
  assert.match(appAudit, /const \[expandedDetailIds, setExpandedDetailIds\]/, 'expandedDetailIds stays declared exactly once (App today; src/hooks/useAuditDetail.js after T06 — t10 pin)');
  assert.equal(countIn(appAudit, 'const handleResultOverride = async (r, status) => {'), 1, 'handleResultOverride stays defined exactly once');
  assert.equal(countIn(appAudit, 'const handleDeleteAudit = async (id) => {'), 1, 'handleDeleteAudit stays defined exactly once');
  assert.equal(countIn(appAudit, 'const printRunReport = (results, { title, subtitle, meta } = {}) => {'), 1, 'printRunReport stays defined exactly once');
  const toggle = appAudit.indexOf('const toggleExpandedDetail = (key) => setExpandedDetailIds(prev => {');
  assert.ok(toggle > 0, 'the expanded-set toggle (concise arrow into setExpandedDetailIds) is owned by the App ∪ useAuditDetail home');
  const toggleBody = appAudit.slice(toggle, appAudit.indexOf('});', toggle));
  for (const needle of ['const next = new Set(prev);', 'if (next.has(key)) next.delete(key);', 'else next.add(key);', 'return next;']) {
    assert.ok(toggleBody.includes(needle), `the toggle keeps its exact body: ${needle}`);
  }
  assert.equal(countIn(appAudit, 'const toggleExpandedDetail = (key) => setExpandedDetailIds(prev => {'), 1, 'the toggle is declared exactly once');
});

// ---------------------------------------------------------------------------
// the region markers leave App.jsx; imports trimmed/kept; shrink gate
// ---------------------------------------------------------------------------

test('The moved markers leave App.jsx — derivation, helpers, modal JSX', () => {
  for (const marker of [
    'const auditDetails = (selectedAudit.details || []).map(effectiveDetails);',
    "const statusColor = (s) => s === 'VULNERABLE'",
    'const detailKey = (d) => `${d.timestamp}-${d.targetUid}-${d.testId}`;',
    '>Audit Details</h3>',
    "'GroundRumble Security Audit Report',",
    "handleResultOverride(d, 'SECURE')",
    'Override verdict',
    'This audit record has no evaluation details.',
  ]) {
    assert.equal(countIn(app, marker), 0, `region marker left App.jsx: ${marker}`);
  }
  // The derived helpers are modal-side only (the symmetry pin).
  for (const sym of ['auditDetails', 'statusColor', 'detailKey', 'auditScore']) {
    assert.ok(!new RegExp(`const ${sym}`).test(app), `${sym} is derived in the modal only`);
  }
});

test('App trims the region-only surface and keeps the shared surface', () => {
  const historyImport = /import \{([^}]*)\} from '\.\/context\/HistoryContext';/.exec(app);
  assert.ok(historyImport, 'App still imports from ./context/HistoryContext');
  assert.ok(!/\bresultOverrideKey\b/.test(historyImport[1]), 'resultOverrideKey left App\u2019s HistoryContext import (the modal consumes it now — the union pin resolves modal-side)');
  assert.ok(/\buseHistory\b/.test(historyImport[1]), 'App keeps useHistory');
  assert.doesNotMatch(app, /^\s*Trash2,?\s*$/m, 'the region-only icon Trash2 left App\u2019s lucide import');
  for (const kept of ['Download', 'ChevronUp', 'ChevronDown', 'X']) {
    assert.ok(new RegExp(`\\b${kept}\\b`).exec(app), `App keeps ${kept} (used outside the moved region)`);
  }
});

test('App.jsx sheds the region (net-smaller gate) and the modal carries the mass', () => {
  assert.ok(lineCount(app) < 1950, `App.jsx must shed the moved region (baseline 1950 at 98444c1); got ${lineCount(app)}`);
  assert.ok(lineCount(modal) > 150, `the modal must carry the moved region; got ${lineCount(modal)}`);
});
