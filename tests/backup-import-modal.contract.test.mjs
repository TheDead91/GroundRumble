// Contract: the encrypted-backup passphrase modal and the rich confirm
// document render from src/components/modals/BackupImportModal.jsx
// (MODAL_PATH) — the modal as the presentation component BackupImportModal
// (props-in/events-out over the useBackupFlow surface, null gate module-side,
// App mounts it unconditionally) and the co-located pure BackupConfirmNode
// that App still hands into the flow hook as its buildConfirmNode dep. App
// keeps the flow orchestration and the hook's data-only param shape is
// unchanged.
//
// The shed-completeness count pin resolves across a union of possible homes:
// the non-modal AlertTriangle usages may sit in App.jsx, AddSourceDialog.jsx,
// PromptUpdateDialog.jsx or BulkImportModal.jsx as the dialogs may be split
// into their own modules, with per-file share pins so the total stays at
// unchanged strength (1 + 1 + 1 plus the bulk-import share) and no usage is
// duplicated or dropped.
//
// The hook-seam test holds regardless of which modules exist.
//
// Source-text level because Node cannot import JSX/extensionless specifiers
// under bare node:test (repo convention: the sibling hook suites,
// the sibling bundled-entry suites). The modal state machine's BEHAVIOR
// stays pinned by the sibling bundled-entry suites (runtime, public-surface
// driver) — this suite pins the App-side structural guarantees against the
// module body. Hermetic: no dev server, no network, no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MODAL_PATH = 'src/components/modals/BackupImportModal.jsx';
// The onboarding wizard's import input may live in this file.
const ONBOARDING_MODAL_PATH = 'src/components/modals/OnboardingModal.jsx';
// The global vault-unlock prompt modal may live in this file; its two <Lock
// usages then live here too.
const UNLOCK_PROMPT_PATH = 'src/components/modals/VaultUnlockPrompt.jsx';
const APP_PATH = 'src/App.jsx';
const HOOK_PATH = 'src/hooks/useBackupFlow.js';

const readSource = (relPath) => readFileSync(join(root, relPath), 'utf8').replace(/\r\n/g, '\n');
const app = readSource(APP_PATH);
const hook = readSource(HOOK_PATH);
let modal = '';
let onboardingModal = '';
let unlockPrompt = '';
try {
  modal = readSource(MODAL_PATH);
  if (existsSync(join(root, ONBOARDING_MODAL_PATH))) onboardingModal = readSource(ONBOARDING_MODAL_PATH);
} catch {
  // The modal may be absent: every module pin below then fails and the
  // hook-seam test still holds.
}
if (existsSync(join(root, UNLOCK_PROMPT_PATH))) {
  unlockPrompt = readSource(UNLOCK_PROMPT_PATH);
}
// The add-custom-source dialog — read tolerantly so the shed-completeness
// count pins can resolve across the App ∪ dialog union. The dialog's error box
// carries one non-modal <AlertTriangle usage.
let addSourceDialog = '';
try {
  if (existsSync(join(root, 'src/components/modals/AddSourceDialog.jsx'))) {
    addSourceDialog = readSource('src/components/modals/AddSourceDialog.jsx');
  }
} catch { /* dialog absent — tolerant read */ }
// The prompt-update dialog — read tolerantly so the shed-completeness count
// pin can resolve across the wider App ∪ dialogs union. The dialog's rejection
// banner carries one non-modal <AlertTriangle usage.
let promptUpdateDialog = '';
try {
  if (existsSync(join(root, 'src/components/modals/PromptUpdateDialog.jsx'))) {
    promptUpdateDialog = readSource('src/components/modals/PromptUpdateDialog.jsx');
  }
} catch { /* dialog absent — tolerant read */ }
const appPlusDialog = `${app}\n${addSourceDialog}`;

// The bulk-import modal's error row carries a fourth non-modal <AlertTriangle
// usage — when BulkImportModal.jsx exists, the calibrated count of 3 resolves
// across the App ∪ dialog ∪ bulk-modal union at unchanged strength; when
// absent, the App ∪ dialog union runs unchanged.
let bulkImportModal = '';
try {
  if (existsSync(join(root, 'src/components/modals/BulkImportModal.jsx'))) {
    bulkImportModal = readSource('src/components/modals/BulkImportModal.jsx');
  }
} catch { /* modal absent — tolerant read */ }
const alertTriangleUnion = `${appPlusDialog}\n${bulkImportModal}`;

const norm = (text) => text.replace(/\s+/g, ' ').trim();
const countIn = (source, needle) => source.split(needle).length - 1;
const lineCount = (source) => source.replace(/\n+$/, '').split('\n').length;

// Ordered-substring helper over a normalized region: pins presence AND order.
const ordered = (label, body, needles) => {
  let cursor = -1;
  for (const needle of needles) {
    const at = body.indexOf(needle, cursor + 1);
    assert.ok(at > cursor, `${label}: expected ${JSON.stringify(needle)} after offset ${cursor} (ordering pin)`);
    cursor = at;
  }
};

// The module's two component slices, found by their export signatures (never
// by line numbers): the modal component runs to the BackupConfirmNode export
// (or EOF), the confirm component runs from its signature to EOF.
const modalSig = modal.indexOf('export function BackupImportModal({');
const confirmSig = modal.indexOf('export function BackupConfirmNode({');
const modalBody = norm(confirmSig > modalSig && confirmSig > 0 ? modal.slice(modalSig, confirmSig) : modal.slice(modalSig));
const confirmBody = norm(confirmSig > 0 ? modal.slice(confirmSig) : '');

// ---------------------------------------------------------------------------
// The flow-hook seam — unchanged by the split (true in either layout)
// ---------------------------------------------------------------------------

test('The hook keeps its data-only param shape and its single confirm-document call site; App keeps the thin binding', () => {
  assert.match(hook, /export function useBackupFlow\(\{\s*providers,\s*aiGenUrls,\s*vaultPassphraseSet,\s*vaultLocked,\s*historyRef,\s*buildConfirmNode\n\}\)/, 'the hook signature keeps the exact six-name deps bag');
  assert.equal(countIn(hook, 'importMessage = buildConfirmNode({ summary, sourceUrls, promptOverrides, candidate });'), 1, 'the hook calls the confirm document exactly once with candidate');
  assert.equal(countIn(hook, 'const buildConfirmNode'), 0, 'the hook never defines the confirm document');
  assert.ok(app.includes("} = useBackupFlow({"), 'App still binds the T02 useBackupFlow hook');
  for (const name of ['handleExportBackup', 'handleImportBackup', 'backupPassphrase', 'setBackupPassphrase', 'backupImportModal', 'setBackupImportModal', 'closeBackupImportModal', 'submitBackupImportPassphrase']) {
    assert.match(app, new RegExp(`\\n    ${name},?\\n`), `App still destructures ${name} from the hook`);
  }
  // The wizard file input may live in
  // src/components/modals/OnboardingModal.jsx — the single wizard-side
  // onChange binding (handleImportBackup or the onImportBackup prop) resolves
  // over the App ∪ onboarding-modal file set.
  assert.equal(
    countIn(app + '\n' + (onboardingModal || ''), /onChange=\{(?:handleImportBackup|onImportBackup)\}/),
    1,
    'the wizard file input stays the only wizard-side onChange binding across App.jsx ∪ OnboardingModal.jsx'
  );
});

// ---------------------------------------------------------------------------
// The modal component — exports, gate, purity, JSX, testids
// ---------------------------------------------------------------------------

test('The modal module exists, exports both components, and gates module-side', () => {
  assert.ok(existsSync(join(root, MODAL_PATH)), `${MODAL_PATH} must exist`);
  assert.ok(modalSig > 0, 'BackupImportModal is exported');
  assert.ok(confirmSig > 0, 'BackupConfirmNode is co-located in the same module');
  assert.match(modal, /export function BackupImportModal\(\{ backupImportModal, setBackupImportModal, closeBackupImportModal, submitBackupImportPassphrase \}\)/, 'the exact props-in contract over the useBackupFlow surface');
  assert.match(modal, /export function BackupConfirmNode\(\{ summary, sourceUrls, promptOverrides, candidate \}\)/, 'the confirm document accepts candidate for expandable review');
  const gateIdx = modal.indexOf('if (!backupImportModal) return null;');
  assert.ok(gateIdx > modalSig && (confirmSig < 0 || gateIdx < confirmSig), 'the null gate lives module-side inside the modal component');
  assert.equal(countIn(modal, 'if (!backupImportModal) return null;'), 1, 'the module-side gate appears exactly once');
});

test('The module is presentation-only — imports from lucide and local components, zero hooks, zero context/IO reach', () => {
  const importLines = modal.split('\n').filter((l) => /^\s*import\b/.test(l));
  assert.equal(importLines.length, 2, 'the module declares exactly two imports');
  assert.equal(importLines[0], "import { Lock, Eye, EyeOff, AlertTriangle } from 'lucide-react';", 'the icon set moves with the JSX, byte-exact');
  assert.match(importLines[1], /import \{ PromptDiffView, TestCriteriaDiffView \} from '\.\.\/backup\/RestoreCandidateReview\.jsx';/, 'imports expandable review components');
  assert.doesNotMatch(modal, /\buseState\b|\buseEffect\b|\buseRef\b|\buseMemo\b|\buseCallback\b|\buseContext\b/, 'no hooks in the presentation module');
  assert.doesNotMatch(modal, /useUI|UIContext|ProvidersContext|SettingsContext|HistoryContext/, 'no context reach');
  assert.doesNotMatch(modal, /localStorage|window\.|document\.|fetch\(/, 'no IO in the presentation module');
});

test('Modal JSX — shell, passphrase input, toggle, error row, busy footer (ordered)', () => {
  ordered('modal JSX', modalBody, [
    'if (!backupImportModal) return null;',
    "position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 139,",
    "background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)',",
    "display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'",
    '<div className="glass-card" style={{ width: \'100%\', maxWidth: \'420px\', padding: \'22px\' }}>',
    '<Lock size={18} color="var(--color-warning)" />',
    '<h3 style={{ margin: 0, fontSize: \'1rem\', fontWeight: 800 }}>Encrypted backup</h3>',
    'This backup was encrypted with a passphrase when it was exported. Enter that passphrase to unlock it and continue the import.',
    "type={backupImportModal.show ? 'text' : 'password'}",
    'value={backupImportModal.passphrase}',
    "onChange={(e) => setBackupImportModal(m => m ? { ...m, passphrase: e.target.value, error: '' } : m)}",
    "onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitBackupImportPassphrase(); } }}",
    'placeholder="Backup passphrase"',
    'className="form-input"',
    'autoFocus',
    'data-testid="backup-passphrase-input"',
    "onClick={() => setBackupImportModal(m => m ? { ...m, show: !m.show } : m)}",
    "title={backupImportModal.show ? 'Hide passphrase' : 'Show passphrase'}",
    '{backupImportModal.show ? <EyeOff size={14} /> : <Eye size={14} />}',
    '{backupImportModal.error && (',
    '<AlertTriangle size={14} style={{ flexShrink: 0, marginTop: \'1px\' }} />',
    '<span>{backupImportModal.error}</span>',
    '<button onClick={closeBackupImportModal} className="btn-secondary" disabled={backupImportModal.busy} data-testid="backup-passphrase-cancel">Cancel</button>',
    '<button onClick={submitBackupImportPassphrase} className="btn-primary" disabled={backupImportModal.busy} data-testid="backup-passphrase-import">',
    "{backupImportModal.busy ? 'Unlocking…' : 'Unlock & import'}",
  ]);
  assert.equal(countIn(modalBody, "passphrase: e.target.value, error: '' }"), 1, 'typing still clears the inline error via the exact functional updater');
});

test('The four data-testids move byte-compatible; the busy disable gate covers both footer buttons', () => {
  for (const testid of ['backup-passphrase-input', 'backup-passphrase-error', 'backup-passphrase-cancel', 'backup-passphrase-import']) {
    assert.equal(countIn(modal, `data-testid="${testid}"`), 1, `${testid} byte-compatible and exactly once`);
    assert.equal(countIn(app, `data-testid="${testid}"`), 0, `${testid} no longer App-side`);
  }
  assert.equal(countIn(modal, 'disabled={backupImportModal.busy}'), 2, 'both footer buttons share the busy disable gate');
});

// ---------------------------------------------------------------------------
// BackupConfirmNode — the co-located rich confirm document
// ---------------------------------------------------------------------------

test('Confirm document — shell, overwrite warning, pre-wrap summary, source-URL section (ordered)', () => {
  ordered('confirm shell+sources', confirmBody, [
    "<div style={{ textAlign: 'left', fontSize: '0.85rem', lineHeight: 1.5 }}>",
    'Import this backup? It will overwrite the current settings and reload the app.',
    "<div style={{ whiteSpace: 'pre-wrap' }}>{summary}</div>",
    '{sourceUrls.length > 0 && (',
    'AI source URLs (fetched during generation):',
    'key={s.url || `${s.kind}-${i}`}',
    "{s.kind === 'paste' ? 'Pasted content (no fetch)' : s.url}",
    "{s.kind !== 'paste' && (",
    "{s.title ? `${s.title} · ` : ''}{s.enabled ? 'enabled' : 'disabled'}",
    '{!s.hasExcerpt && <span style={{ color: \'var(--color-warning)\' }}> · will be fetched on the next generation run</span>}',
  ]);
});

test('Confirm document — candidate-based expandable review with prompt diff and test criteria', () => {
  ordered('confirm candidate sections', confirmBody, [
    "{candidate && candidate.promptDiff && candidate.promptDiff.changed.length > 0 && (",
    '<PromptDiffView promptDiff={candidate.promptDiff} />',
    "{candidate && candidate.testCriteriaDiff && candidate.testCriteriaDiff.tests.length > 0 && (",
    '<TestCriteriaDiffView testCriteriaDiff={candidate.testCriteriaDiff} />',
  ]);
  assert.equal(countIn(confirmBody, 'candidate &&'), 2, 'candidate-gated sections for prompt and test-criteria diffs');
  assert.equal(countIn(modal, 'buildConfirmNode'), 0, 'the module never references the old App-side callback name');
});

// ---------------------------------------------------------------------------
// App adoption + shed completeness
// ---------------------------------------------------------------------------

test('App imports the modal file exactly once, mounts the component with the exact four-prop contract', () => {
  const importLines = app.split('\n').filter((l) => l.includes("from './components/modals/BackupImportModal'"));
  assert.equal(importLines.length, 1, 'exactly one import from the modal specifier');
  assert.ok(importLines[0].includes('BackupImportModal') && importLines[0].includes('BackupConfirmNode'), 'the import carries both components');
  assert.equal(countIn(app, '<BackupImportModal'), 1, 'the component is mounted exactly once');
  for (const prop of ['backupImportModal={backupImportModal}', 'setBackupImportModal={setBackupImportModal}', 'closeBackupImportModal={closeBackupImportModal}', 'submitBackupImportPassphrase={submitBackupImportPassphrase}']) {
    assert.equal(countIn(app, prop), 1, `the mount passes ${prop}`);
  }
  assert.equal(countIn(app, '{backupImportModal && ('), 0, 'the gate moved module-side — App mounts unconditionally');
});

test('App hands the co-located confirm document into the hook — buildConfirmNode: BackupConfirmNode', () => {
  assert.match(app, /= useBackupFlow\(\{\s*providers,\s*aiGenUrls,\s*vaultPassphraseSet,\s*vaultLocked,\s*historyRef,\s*buildConfirmNode: BackupConfirmNode,?\s*\}\)/, 'the deps object binds buildConfirmNode to the co-located component');
  assert.equal(countIn(app, 'buildConfirmNode'), 1, 'App references buildConfirmNode exactly once (the deps pass)');
  assert.equal(countIn(app, 'const buildConfirmNode = '), 0, 'the App-inline confirm document is gone');
});

test('Shed completeness — zero passphrase-modal JSX left in App', () => {
  assert.equal(countIn(app, 'data-testid="backup-passphrase-'), 0, 'no passphrase-modal testids App-side');
  assert.equal(countIn(app, 'backupImportModal.'), 0, 'no modal member reads App-side');
  assert.equal(countIn(app, 'onClick={submitBackupImportPassphrase}'), 0, 'no modal submit binding App-side');
  assert.equal(countIn(app, 'onClick={closeBackupImportModal}'), 0, 'no modal cancel binding App-side');
  assert.equal(countIn(app, '<Eye'), 0, 'Eye/EyeOff JSX moved with the modal (App-side usages gone)');
  // The global unlock prompt's two <Lock usages live App-side while it is
  // inline and move with VaultUnlockPrompt.jsx — exactly two
  // non-unlock-prompt Lock usages (the locked-vault banner) stay App-side
  // either way.
  assert.equal(countIn(app, '<Lock'), 2 + (unlockPrompt ? 0 : 2), 'the two banner Lock usages stay App-side; the global unlock prompt\'s two Locks leave App once extracted (T06)');
  assert.equal(countIn(unlockPrompt, '<Lock'), unlockPrompt ? 2 : 0, 'the extracted unlock prompt carries the two moved Lock usages');
  // The add-source dialog's error-box AlertTriangle may live in
  // AddSourceDialog.jsx — when the dialog exists the count resolves across the
  // App ∪ dialog union at unchanged strength; when absent, the App-side
  // assertion runs unchanged.
  // The prompt-update dialog's rejection-banner AlertTriangle may live in
  // PromptUpdateDialog.jsx — when the dialog exists the count
  // resolves across the App ∪ dialogs union at unchanged strength (1 App
  // import-error box + 1 AddSourceDialog error box + 1 PromptUpdateDialog
  // rejection banner = 3), with per-file asserts pinning that neither side
  // duplicates or drops its share; when absent, the App ∪ add-source assertion
  // runs unchanged.
  if (promptUpdateDialog) {
    assert.equal(countIn(app, '<AlertTriangle'), 0, 'App keeps zero non-modal AlertTriangle usage post-T01 (the import-error box already lives in the T07 modal; App\u2019s last non-modal use — the dialog rejection banner — moved to PromptUpdateDialog.jsx)');
    assert.equal(countIn(addSourceDialog, '<AlertTriangle'), 1, 'the add-source dialog keeps its error-box AlertTriangle exactly once (T04 share)');
    assert.equal(countIn(promptUpdateDialog, '<AlertTriangle'), 1, 'the prompt-update dialog carries its rejection-banner AlertTriangle exactly once (T01 share)');
    assert.equal(countIn(`${alertTriangleUnion}\n${promptUpdateDialog}`, '<AlertTriangle'), 3, 'the non-modal AlertTriangle usages hold at baseline strength across the App ∪ dialogs (∪ bulk-import modal post-T02) union (four at the 855d4b4 calibration baseline; the fourth left App with the T03 merge-dialog shed, the third with the T04 dialog shed, re-unioned with the T01 dialog shed)');
  } else if (addSourceDialog) {
    assert.equal(countIn(alertTriangleUnion, '<AlertTriangle'), 3, 'the non-modal AlertTriangle usages hold at baseline strength across the App ∪ dialog (∪ bulk-import modal post-T02) union (four at the 855d4b4 calibration baseline; the fourth left App with the T03 merge-dialog shed, the third with the T04 dialog shed)');
  } else {
    assert.equal(countIn(app, '<AlertTriangle'), 3, 'the non-modal AlertTriangle usages stay App-side (four at the 855d4b4 calibration baseline; the fourth left App with the T03 merge-dialog shed, before the live-tree re-attestation)');
  }
});

// ---------------------------------------------------------------------------
// The App is strictly net-smaller against its 2873-line ceiling
// ---------------------------------------------------------------------------

test('App.jsx is strictly net-smaller than its 2873-line pre-T07 baseline', () => {
  const appLines = lineCount(app);
  assert.ok(appLines > 0, 'App.jsx readable');
  assert.ok(appLines < 2873, `App.jsx is net-smaller than the 2873-line T07 baseline (landed ${appLines})`);
});
