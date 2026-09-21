// Contract: the global vault-unlock prompt modal lives in
// src/components/modals/VaultUnlockPrompt.jsx as the presentation component
// VaultUnlockPrompt — props-in/events-out over the App-side orchestration
// (open, vaultInput, setVaultInput, onUnlock, onClose, onResetAll, addToast),
// with the null gate module-side. App keeps the unlockPromptOpen lifecycle
// (auto-open effect, locked-banner re-open button) and mounts the component;
// the module body plus the App adoption pin every characterization
// guarantee here.
//
// COLOR CONTRACT: every module/adoption test below is designed-RED before the
// module exists (App still carries the inline JSX) and turns GREEN when the
// module lands. There are no always-true tests: the framework holds this
// suite back until execution.
//
// The App-side shrink floor tolerates the extractions that may or may not
// have landed: each existing module re-bases the floor by exactly its shed
// and must carry the moved mass, so the floor is green with or without each
// extraction present.
//
// Source-text level because Node cannot import JSX/extensionless specifiers
// under bare node:test (repo convention: tests/backup-import-modal.contract.test.mjs).
// Hermetic: no dev server, no network, no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MODAL_PATH = 'src/components/modals/VaultUnlockPrompt.jsx';
const APP_PATH = 'src/App.jsx';

const readSource = (relPath) => readFileSync(join(root, relPath), 'utf8').replace(/\r\n/g, '\n');
const app = readSource(APP_PATH);
let modal = '';
try {
  modal = readSource(MODAL_PATH);
} catch {
  // Absent modal: every module/adoption pin below fails BY DESIGN until the
  // module lands, so the floor can branch on presence.
}
// The audit-detail modal is read tolerantly so the shrink floor can branch on
// its presence.
let auditModal = '';
try {
  auditModal = readSource('src/components/modals/AuditDetailModal.jsx');
} catch { /* absent */ }
// The add-custom-source dialog is read tolerantly so the shrink floor can
// branch on its presence.
let addSourceDialog = '';
try {
  addSourceDialog = readSource('src/components/modals/AddSourceDialog.jsx');
} catch { /* absent */ }
// The prompt-update dialog is read tolerantly so the shrink floor can branch
// on its presence.
let promptUpdateDialog = '';
try {
  promptUpdateDialog = readSource('src/components/modals/PromptUpdateDialog.jsx');
} catch { /* absent */ }
// The model-connectivity hook is read tolerantly so the shrink floor can
// branch on its presence.
let modelPingHook = '';
try {
  modelPingHook = readSource('src/hooks/useModelPingTests.js');
} catch { /* absent */ }
// The bulk-import modal is read tolerantly so the shrink floor can branch on
// its presence.
let bulkImportModal = '';
try {
  bulkImportModal = readSource('src/components/modals/BulkImportModal.jsx');
} catch { /* absent */ }
// The audit-history glue hook is read tolerantly so the shrink floor can
// branch on its presence.
let auditDetailHook = '';
try {
  auditDetailHook = readSource('src/hooks/useAuditDetail.js');
} catch { /* absent */ }
// The prompt-workspace component is read tolerantly. Presence is recognized
// only by its export signature, never by an empty file.
let promptWorkspace = '';
try {
  promptWorkspace = readSource('src/components/views/prompts/PromptWorkspace.jsx');
} catch { /* absent */ }

const norm = (text) => text.replace(/\s+/g, ' ').trim();
const countIn = (source, needle) => source.split(needle).length - 1;
const lineCount = (source) => source.replace(/\n+$/, '').split('\n').length;

// Ordered-substring helper over a normalized body: pins presence AND order.
const ordered = (label, body, needles) => {
  const hay = norm(body);
  let cursor = -1;
  for (const needle of needles) {
    const at = hay.indexOf(norm(needle), cursor + 1);
    assert.ok(at > cursor, `${label}: expected ${JSON.stringify(needle)} after offset ${cursor} (ordering pin)`);
    cursor = at;
  }
};

// ---------------------------------------------------------------------------
// The module contract — export, exact props-in/events-out, module-side gate,
// purity
// ---------------------------------------------------------------------------

test('The modal module exists and exports VaultUnlockPrompt with the exact seven-prop contract', () => {
  assert.ok(existsSync(join(root, MODAL_PATH)), `${MODAL_PATH} must exist`);
  assert.match(modal, /export function VaultUnlockPrompt\(\{ open, vaultInput, setVaultInput, onUnlock, onClose, onResetAll, addToast \}\)/, 'the exact props-in/events-out contract');
});

test('The null gate lives module-side and the module is presentation-only', () => {
  const sigAt = modal.indexOf('export function VaultUnlockPrompt(');
  const gateAt = modal.indexOf('if (!open) return null;');
  assert.ok(sigAt >= 0, 'VaultUnlockPrompt is exported');
  assert.ok(gateAt > sigAt, 'the null gate lives module-side inside the component');
  assert.equal(countIn(modal, 'if (!open) return null;'), 1, 'the module-side gate appears exactly once');
  const importLines = modal.split('\n').filter((l) => /^\s*import\b/.test(l));
  assert.equal(importLines.length, 1, 'the module declares exactly one import');
  assert.equal(importLines[0], "import { Lock } from 'lucide-react';", 'the icon set moves with the JSX, byte-exact');
  assert.doesNotMatch(modal, /\buseState\b|\buseEffect\b|\buseRef\b|\buseMemo\b|\buseCallback\b|\buseContext\b/, 'no hooks in the presentation module');
  assert.doesNotMatch(modal, /useUI|UIContext|ProvidersContext|SettingsContext|HistoryContext/, 'no context reach');
  assert.doesNotMatch(modal, /localStorage|window\.|document\.|fetch\(/, 'no IO in the presentation module');
});

// ---------------------------------------------------------------------------
// The exact module-side modal JSX — shell, form, footer
// ---------------------------------------------------------------------------

test('Modal shell — backdrop, glass card, lock icon, heading, explainer (ordered)', () => {
  ordered('module modal body', modal, [
    'if (!open) return null;',
    "position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,",
    "background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(6px)',",
    "display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 115, padding: '20px'",
    '<div className="glass-card" style={{ width: \'100%\', maxWidth: \'460px\', padding: \'26px\' }}>',
    '<Lock size={20} color="var(--color-secondary)" />',
    '<h3 style={{ fontSize: \'1.2rem\', fontWeight: 800, margin: 0 }}>Unlock your API keys</h3>',
    'Your API keys are stored encrypted in the browser vault (IndexedDB). Enter the passphrase you set in{\' \'}',
    '<b>Settings → Key Vault</b> to unlock this session, or continue in <b>read-only mode</b> (Settings',
    'and the Auditor Runner are disabled, and AI-powered actions are turned off).'
  ]);
});

test('Passphrase form — controlled vaultInput, Enter-unlock and submit-unlock route through onUnlock with the exact toast template (ordered)', () => {
  ordered('module modal form', modal, [
    '<form onSubmit={async (e) => { e.preventDefault(); const result = await onUnlock(vaultInput); if (!result.success) addToast(`Unlock failed: ${result.error}`, \'error\'); }}>',
    '<input',
    'data-testid="vault-passphrase-input"',
    'type="password"',
    'value={vaultInput}',
    'onChange={(e) => setVaultInput(e.target.value)}',
    'onKeyDown={async (e) => { if (e.key === \'Enter\') { const result = await onUnlock(vaultInput); if (!result.success) addToast(`Unlock failed: ${result.error}`, \'error\'); } }}',
    'placeholder="Vault passphrase"',
    'className="form-input"',
    'autoFocus',
    'autoComplete="off"'
  ]);
  assert.equal(countIn(modal, 'onUnlock(vaultInput)'), 2, 'form submit and Enter keydown both unlock through onUnlock(vaultInput) — exactly two module-side call sites');
  assert.equal(countIn(modal, 'Unlock failed: '), 2, 'both unlock arms share the exact `Unlock failed: ${result.error}` toast template');
  assert.equal(countIn(modal, "addToast(`Unlock failed: ${result.error}`, 'error')"), 2, 'both unlock arms toast at error level');
});

test('Read-only continue button fires onClose; forgot-passphrase row fires onResetAll (ordered)', () => {
  ordered('module modal footer', modal, [
    '<button type="button" onClick={onClose} className="btn-secondary" style={{ justifyContent: \'center\' }}>',
    'Continue in read-only mode',
    '<button data-testid="vault-unlock" type="submit" className="btn-primary" style={{ justifyContent: \'center\' }}>',
    '<Lock size={14} /> Unlock',
    '<div style={{ marginTop: \'14px\', paddingTop: \'12px\', borderTop: \'1px solid var(--border-subtle)\', fontSize: \'0.72rem\', color: \'var(--text-muted)\' }}>',
    'Forgot the passphrase? The keys can\'t be recovered — your only option is to{\' \'}',
    '<button onClick={onResetAll} className="btn-secondary" style={{ padding: \'2px 8px\', fontSize: \'0.7rem\', color: \'var(--color-vulnerable)\', display: \'inline-flex\', marginLeft: \'2px\' }}>',
    'Reset the platform',
    ', which deletes everything (including the encrypted keys) and starts fresh.'
  ]);
  assert.equal(countIn(modal, '<Lock'), 2, 'both Lock usages moved with the JSX — exactly two module-side');
});

test('The two global unlock testids move byte-compatible and exactly once each', () => {
  for (const marker of ['data-testid="vault-passphrase-input"', 'data-testid="vault-unlock"']) {
    assert.equal(countIn(modal, marker), 1, `the module carries ${marker} exactly once`);
    assert.equal(countIn(app, marker), 0, `${marker} no longer App-side`);
  }
});

// ---------------------------------------------------------------------------
// App adoption + lifecycle retention
// ---------------------------------------------------------------------------

test('App imports the modal exactly once and mounts it with the exact prop wiring', () => {
  const importLines = app.split('\n').filter((l) => l.includes("from './components/modals/VaultUnlockPrompt'"));
  assert.equal(importLines.length, 1, 'exactly one import from the modal specifier');
  assert.ok(importLines[0].includes('VaultUnlockPrompt'), 'the import carries the component');
  assert.equal(countIn(app, '<VaultUnlockPrompt'), 1, 'the component is mounted exactly once');
  // The mount block (opening tag to its self-close), so the prop pins are not
  // confused by the same spellings on other mounts (SettingsView also receives
  // vaultInput/setVaultInput).
  const mStart = app.indexOf('<VaultUnlockPrompt');
  assert.ok(mStart >= 0, 'the VaultUnlockPrompt mount exists');
  const mEnd = app.indexOf('/>', mStart);
  assert.ok(mEnd > mStart, 'the VaultUnlockPrompt mount is self-closed');
  const mount = app.slice(mStart, mEnd + 2);
  for (const prop of [
    'open={unlockPromptOpen}',
    'vaultInput={vaultInput}',
    'setVaultInput={setVaultInput}',
    'onUnlock={handleUnlockVault}',
    "onClose={() => { setVaultInput(''); setUnlockPromptOpen(false); }}",
    'onResetAll={resetAllData}',
    'addToast={addToast}'
  ]) {
    assert.equal(countIn(mount, prop), 1, `the mount passes ${prop}`);
  }
});

test('App keeps the unlockPromptOpen lifecycle — state consumption, auto-open effect, banner re-open', () => {
  assert.ok(app.includes('unlockPromptOpen,'), 'App keeps consuming unlockPromptOpen from providersCtx');
  assert.ok(app.includes('setUnlockPromptOpen,'), 'App keeps consuming setUnlockPromptOpen from providersCtx');
  assert.ok(app.includes("if (!vaultLoading && vaultLocked && (vaultPassphraseSet ?? false) && !unlockPromptOpen && (activeTab === 'runner' || activeTab === 'prompts' || activeTab === 'settings')) {"), 'the auto-open gate effect stays App-side');
  assert.ok(app.includes('}, [vaultLoading, vaultLocked, vaultPassphraseSet, unlockPromptOpen, activeTab, setActiveTab]);'), 'the auto-open effect keeps its exact lint-clean dep array');
  assert.equal(countIn(app, 'onClick={() => setUnlockPromptOpen(true)}'), 1, 'the banner re-open button stays App-side exactly once');
});

// ---------------------------------------------------------------------------
// Shed completeness — the moved modal leaves zero residue App-side
// ---------------------------------------------------------------------------

test('Shed completeness — zero unlock-prompt JSX left in App', () => {
  assert.equal(countIn(app, '{unlockPromptOpen && ('), 0, 'the inline JSX gate is gone from App');
  assert.equal(countIn(app, 'handleUnlockVault(vaultInput)'), 0, 'no modal unlock call sites App-side');
  assert.equal(countIn(app, 'Unlock failed: '), 0, 'no modal toast template App-side');
  assert.equal(countIn(app, 'Continue in read-only mode'), 0, 'the read-only continue button moved');
  assert.equal(countIn(app, 'Forgot the passphrase?'), 0, 'the forgot-passphrase row moved');
  assert.equal(countIn(app, 'Reset the platform'), 0, 'the reset-platform button moved');
  assert.equal(countIn(app, 'onClick={resetAllData}'), 0, 'the inline resetAllData binding moved');
  assert.equal(countIn(app, 'const resetAllData ='), 1, 'resetAllData stays App-defined exactly once (the modal only consumes it)');
  assert.equal(countIn(app, 'placeholder="Vault passphrase"'), 0, 'the passphrase input moved');
  assert.equal(countIn(app, "maxWidth: '460px'"), 0, 'the unlock-prompt card shell moved');
  assert.equal(countIn(app, '>Unlock your API keys</h3>'), 0, 'the unlock heading moved');
  assert.equal(countIn(app, 'Your API keys are stored encrypted in the browser vault'), 0, 'the explainer paragraph moved');
});

// ---------------------------------------------------------------------------
// The App is strictly net-smaller after the modal extraction
// ---------------------------------------------------------------------------

test('App.jsx is strictly net-smaller than its 1894-line pre-T06 baseline', () => {
  const appLines = lineCount(app);
  assert.ok(appLines > 0, 'App.jsx readable');
  assert.ok(appLines < 1894, `App.jsx is net-smaller than the 1894-line T06 baseline (landed ${appLines})`);
  // The floor re-bases by each extraction that has landed: the
  // settings-card-header render-prop definition, its wiring and the two
  // useSettings bindings (collapsedSettings/toggleSettingsCard); the
  // audit-detail-modal region; and the add-custom-source dialog region. Each
  // module must carry the mass it took over, so the floor still forbids
  // gutting anything beyond the named extractions.
  const t02ModalLanded = countIn(auditModal, 'export default function AuditDetailModal(') > 0;
  const t04DialogLanded = countIn(addSourceDialog, 'export default function AddSourceDialog(') > 0;
  // The model-connectivity extraction (the testingJudge/testingGen busy
  // states and the testJudge/testGenerator handlers) re-bases the floor by
  // its shed; App consumes the hook through one destructure line plus its
  // import. When the hook exists it must carry the moved bodies.
  const t05HookLanded = countIn(modelPingHook, 'export function useModelPingTests(') > 0;
  const t05Shed = t05HookLanded ? 32 : 0;
  const t02BulkLanded = countIn(bulkImportModal, 'export default function BulkImportModal(') > 0;
  const t01DialogLanded = countIn(promptUpdateDialog, 'export default function PromptUpdateDialog(') > 0;
  const t01Shed = t01DialogLanded ? 181 : 0;
  // The audit-history glue extraction (selectedAudit/expandedDetailIds state
  // and the toggleExpandedDetail / handleDeleteAudit / handleResultOverride /
  // printRunReport / clearHistory glue) re-bases the floor by its shed; the
  // useAuditDetail hook must carry the moved glue when present.
  const t06HookLanded = auditDetailHook.trim().length > 0;
  const t06Shed = t06HookLanded ? 60 : 0;
  // The dead-binding dedupe re-bases the floor by its shed — App's
  // underscore-aliased useAIGen mirror entries, the five useTests aliases,
  // the dead catalog/audit-record/vault import specifiers and their
  // disable/comment lines. No module carries the mass (it is deletion, not
  // extraction); while App still binds _validTechniqueIds the original floor
  // runs.
  const t07Landed = !app.includes('_validTechniqueIds');
  const t07Shed = t07Landed ? 52 : 0;
  // Only promptDraft, usePromptUpdate adoption and the two child mounts move.
  // Forty lines is a conservative allowance for those regions, not a free shed.
  const promptWorkspaceLanded = /export (?:default )?function PromptWorkspace\(\{/.test(promptWorkspace);
  const promptWorkspaceShed = promptWorkspaceLanded ? 40 : 0;
  if (promptWorkspaceLanded) {
    assert.ok(lineCount(promptWorkspace) > 40, `PromptWorkspace carries meaningful moved mass (landed ${lineCount(promptWorkspace)} lines)`);
    assert.equal(countIn(promptWorkspace, 'const [promptDraft, setPromptDraft] = useState({});'), 1, 'PromptWorkspace owns promptDraft');
    assert.equal(countIn(promptWorkspace, '= usePromptUpdate({'), 1, 'PromptWorkspace owns the prompt-update hook adoption');
    assert.equal(countIn(app, '<PromptWorkspace'), 1, 'App mounts PromptWorkspace exactly once');
  }
  if (t06HookLanded) {
    assert.ok(lineCount(auditDetailHook) > 60, `the useAuditDetail hook carries the moved audit-history glue (landed ${lineCount(auditDetailHook)})`);
  }
  if (t02ModalLanded && t04DialogLanded && t02BulkLanded && t01DialogLanded) {
    assert.ok(appLines > 1200 - t05Shed - t01Shed - t06Shed - t07Shed - promptWorkspaceShed, `App.jsx keeps its remaining surface after the sanctioned extractions including PromptWorkspace when landed (landed ${appLines}; extraction must move ownership, not gut the app)`);
    assert.ok(lineCount(auditModal) > 150, `the audit-detail modal carries the moved region (landed ${lineCount(auditModal)})`);
    assert.ok(lineCount(addSourceDialog) > 200, `the add-source dialog carries the moved region (landed ${lineCount(addSourceDialog)})`);
    assert.ok(lineCount(bulkImportModal) > 150, `the bulk-import modal carries the moved region (landed ${lineCount(bulkImportModal)})`);
    assert.ok(lineCount(promptUpdateDialog) > 160, `the prompt-update dialog carries the moved region (landed ${lineCount(promptUpdateDialog)})`);
  } else if (t02ModalLanded && t04DialogLanded && t02BulkLanded) {
    assert.ok(appLines > 1200 - t05Shed - t06Shed - t07Shed - promptWorkspaceShed, `App.jsx keeps its remaining surface after sanctioned extractions including PromptWorkspace when landed (landed ${appLines}; extraction must move ownership, not gut the app)`);
    assert.ok(lineCount(auditModal) > 150, `the audit-detail modal carries the moved region (landed ${lineCount(auditModal)})`);
    assert.ok(lineCount(addSourceDialog) > 200, `the add-source dialog carries the moved region (landed ${lineCount(addSourceDialog)})`);
    assert.ok(lineCount(bulkImportModal) > 150, `the bulk-import modal carries the moved region (landed ${lineCount(bulkImportModal)})`);
  } else if (t02ModalLanded && t04DialogLanded) {
    assert.ok(appLines > 1411 - t05Shed - t06Shed - t07Shed - promptWorkspaceShed, `App.jsx keeps its remaining surface after sanctioned extractions including PromptWorkspace when landed (landed ${appLines}; extraction must move ownership, not gut the app)`);
    assert.ok(lineCount(auditModal) > 150, `the audit-detail modal carries the moved region (landed ${lineCount(auditModal)})`);
    assert.ok(lineCount(addSourceDialog) > 200, `the add-source dialog carries the moved region (landed ${lineCount(addSourceDialog)})`);
  } else if (t02ModalLanded) {
    assert.ok(appLines > 1626 - t05Shed - t06Shed - t07Shed - promptWorkspaceShed, `App.jsx keeps its remaining surface after sanctioned extractions including PromptWorkspace when landed (landed ${appLines}; extraction must move ownership, not gut the app)`);
    assert.ok(lineCount(auditModal) > 150, `the audit-detail modal carries the moved region (landed ${lineCount(auditModal)})`);
  } else if (t04DialogLanded) {
    assert.ok(appLines > 1568 - t05Shed - t06Shed - t07Shed - promptWorkspaceShed, `App.jsx keeps its remaining surface after sanctioned extractions including PromptWorkspace when landed (landed ${appLines}; extraction must move ownership, not gut the app)`);
    assert.ok(lineCount(addSourceDialog) > 200, `the add-source dialog carries the moved region (landed ${lineCount(addSourceDialog)})`);
  } else {
    assert.ok(appLines > 1783 - t05Shed - t06Shed - t07Shed - promptWorkspaceShed, `App.jsx keeps its remaining surface including the sanctioned PromptWorkspace shed when landed (landed ${appLines}; extraction must move ownership, not gut the app)`);
  }
});
