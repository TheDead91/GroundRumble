// Contract: the Account & Data card — the Key Vault section, the Backup &
// Restore section and the Reset Platform section of SettingsView.jsx —
// renders from src/components/views/settings/AccountDataCard.jsx,
// props-in/events-out (vaultLoading, vaultLocked, vaultPassphraseSet,
// vaultInput/setVaultInput, handleUnlockVault, handleLockVault,
// handleUnprotectVault, handleProtectVault,
// backupPassphrase/setBackupPassphrase, handleExportBackup, handleImportBackup,
// resetAllData, collapsedSettings), composing the shared SettingsCardHeader
// component and importing the shared vaultSupported util for its badge ladder.
// SettingsView imports and composes the card with bare-identifier wiring; the
// view's own prop list is unchanged and its useProviders()/useSettings()
// destructures keep binding every forwarded name (pinned by
// tests/settings-view.contract.test.mjs, untouched here).
//
// The card module may be absent (the guarded read leaves `accountCard` as ''
// and the module pins fail their first assertions). Every pin over the
// view ∪ card file set is green with the card inline in the view AND after the
// split.
//
// Source-text level because Node cannot import JSX/extensionless specifiers
// under bare node:test (repo convention: see tests/providers-card.contract.test.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const VIEW_PATH = 'src/components/views/SettingsView.jsx';
// The Account & Data card lives in this file.
const CARD_PATH = 'src/components/views/settings/AccountDataCard.jsx';

const readSource = (relPath) => readFileSync(join(root, relPath), 'utf8').replace(/\r\n/g, '\n');
let view = '', app = '';
try {
  view = readSource(VIEW_PATH);
  app = readSource('src/App.jsx');
} catch { /* missing files fail their first assertion */ }
// The card module may be absent (accountCard stays '' and the module pins fail
// their first assertions); every body needle resolves over the view ∪ card
// union either way.
let accountCard = '';
if (existsSync(join(root, CARD_PATH))) accountCard = readSource(CARD_PATH);

const norm = (text) => text.replace(/\s+/g, ' ').trim();
const countIn = (source, needle) => source.split(needle).length - 1;
const lineCount = (source) => source.replace(/\n+$/, '').split('\n').length;
const cardUnion = view + '\n' + accountCard;

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

// The <SettingsView … /> mount block inside App.jsx (opening tag to the first
// self-closing `/>`), used to prove the App-side prop wiring is untouched.
function appMountBlock() {
  const start = app.indexOf('<SettingsView');
  assert.ok(start >= 0, 'App.jsx mounts <SettingsView … />');
  const end = app.indexOf('/>', start);
  assert.ok(end > start, 'the <SettingsView mount is self-closed');
  return app.slice(start, end + 2);
}

// ---------------------------------------------------------------------------
// AccountDataCard.jsx exists, props-in/events-out, context-clean
// ---------------------------------------------------------------------------

test('AccountDataCard.jsx exists and takes the declared props-in surface (all fifteen, each a bare binding)', () => {
  assert.ok(accountCard.length > 0, 'AccountDataCard.jsx exists');
  const PROPS = [
    'vaultLoading', 'vaultLocked', 'vaultPassphraseSet',
    'vaultInput', 'setVaultInput',
    'handleUnlockVault', 'handleLockVault', 'handleUnprotectVault', 'handleProtectVault',
    'backupPassphrase', 'setBackupPassphrase',
    'handleExportBackup', 'handleImportBackup',
    'resetAllData',
    'collapsedSettings'
  ];
  assert.match(accountCard, /export function AccountDataCard\(/, 'AccountDataCard is exported (named)');
  assert.match(accountCard, /export default AccountDataCard;/, 'the default export stays (view-composition convention)');
  for (const name of PROPS) {
    assert.match(accountCard, new RegExp(`^  ${name},?$`, 'm'), `the card takes ${name} as a prop`);
  }
  assert.match(accountCard, /import React(, \{[^}]+\})? from 'react';/, 'the card keeps the repo React import convention');
});

test('The card is context-clean — deps arrive via props, never via context reaches', () => {
  assert.doesNotMatch(accountCard, /= useSettings\(\)/, 'no useSettings() reach inside the card');
  assert.doesNotMatch(accountCard, /= useProviders\(\)/, 'no useProviders() reach inside the card');
  assert.doesNotMatch(accountCard, /= useUI\(\)/, 'no useUI() reach inside the card');
  assert.ok(!accountCard.includes("from '../../context/"), 'the card imports no context module');
  assert.match(accountCard, /import { SettingsCardHeader } from '\.\/SettingsCardHeader';/, 'the card composes the shared header component');
  // The vaultSupported import must resolve from the settings directory depth:
  // the card lives at src/components/views/settings/, so the specifier is
  // three levels deep ('../../../utils/vault' — the same specifier the sibling
  // ProvidersCard.jsx uses). A two-level specifier would not resolve and would
  // fail the build with UNRESOLVED_IMPORT.
  assert.match(accountCard, /import \{ vaultSupported \} from '\.\.\/\.\.\/\.\.\/utils\/vault';/, 'the card imports the shared vaultSupported util (settings-dir depth, resolving)');
  for (const icon of ['UserCog', 'Lock', 'Database', 'Download', 'Upload', 'Trash2', 'AlertTriangle', 'RefreshCw']) {
    assert.match(accountCard, new RegExp(`\\b${icon}\\b`), `the ${icon} icon moves with the card`);
  }
});

// ---------------------------------------------------------------------------
// The card body is verbatim (union over the view ∪ card file set)
// ---------------------------------------------------------------------------

test('The account card shell + collapse gates resolve across the view ∪ card union, in render order', () => {
  ordered(cardUnion, 'account card shell', [
    `<div className="glass-card" data-tour="account-data" style={{ display: 'flex', flexDirection: 'column', gap: collapsedSettings['account-data'] ? '0' : '16px' }}>`,
    `<SettingsCardHeader settingKey="account-data" icon={<UserCog size={18} color="var(--color-secondary)" />} title={'Account & Data'} />`,
    `!collapsedSettings['account-data'] && (`,
    '<div style={{ display: \'flex\', flexDirection: \'column\', gap: \'16px\' }}>',
    `<div data-tour="key-vault" style={{ display: 'flex', flexDirection: 'column' }}>`
  ]);
});

test('The Key Vault section resolves across the union, in render order', () => {
  ordered(cardUnion, 'account.vault', [
    '<Lock size={18} color="var(--color-secondary)" />',
    '<h3 style={{ fontSize: \'1.15rem\', fontWeight: 800 }}>Key Vault</h3>',
    '{(!vaultSupported() || (vaultPassphraseSet ?? false) || vaultLocked) && (',
    `{!vaultSupported() ? 'UNSUPPORTED' : (vaultPassphraseSet ?? false) ? 'ENCRYPTED' : 'LOCKED'}`,
    'API keys are stored in your browser\'s <b>IndexedDB vault</b>, not in plain localStorage. Optionally protect',
    '{vaultLoading && (',
    '<RefreshCw size={13} className="animate-spin-custom" /> Loading vault…',
    '{!vaultSupported() ? (',
    'This browser doesn\'t expose Web Crypto/IndexedDB in a secure context, so the Key Vault cannot persist',
    ') : vaultLocked ? (',
    'handleUnlockVault(vaultInput)',
    'data-testid="vault-passphrase-input"',
    'onChange={(e) => setVaultInput(e.target.value)}',
    'onKeyDown={(e) => { if (e.key === \'Enter\') handleUnlockVault(vaultInput); }}',
    'placeholder="Enter your vault passphrase"',
    'data-testid="vault-unlock"',
    '<Lock size={14} /> Unlock',
    ') : (vaultPassphraseSet ?? false) ? (',
    'Your keys are encrypted at rest and unlocked for this session.',
    'handleProtectVault(); }}',
    'New passphrase:',
    'placeholder="Change passphrase"',
    'Change passphrase',
    'data-testid="vault-lock"',
    'onClick={handleLockVault}',
    '<Lock size={14} /> Lock now',
    'onClick={handleUnprotectVault}',
    'Remove passphrase',
    ') : (',
    'No passphrase set — keys are stored securely in the vault but not encrypted.',
    'data-testid="vault-protect-input"',
    'placeholder="Set a passphrase to encrypt your keys"',
    'data-testid="vault-protect"',
    '<Lock size={14} /> Protect with passphrase'
  ]);
});

test('The Backup & Restore section resolves across the union, in render order', () => {
  ordered(cardUnion, 'account.backup', [
    `<div data-tour="backup-card"`,
    '<Database size={18} color="var(--color-secondary)" />',
    '<h3 style={{ fontSize: \'1.15rem\', fontWeight: 800 }}>Backup & Restore</h3>',
    'Export all API keys, providers, the comparison lineup, judge settings, saved tests, and audit history',
    '<form onSubmit={(e) => { e.preventDefault(); handleExportBackup(); }}>',
    '<label className="form-label">Passphrase (required)</label>',
    'value={backupPassphrase}',
    'onChange={(e) => setBackupPassphrase(e.target.value)}',
    'placeholder="Required to encrypt the backup (min 12 characters)"',
    'The backup will be encrypted with AES-256-GCM. The passphrase can\'t be recovered',
    'data-testid="backup-export"',
    'onClick={handleExportBackup}',
    '<Download size={14} style={{ marginRight: \'6px\' }} /> Export Backup',
    'type="file"',
    'id="backup-file-input"',
    'data-testid="backup-import-input"',
    'accept=".json,application/json"',
    'onChange={handleImportBackup}',
    'htmlFor="backup-file-input"',
    '<Upload size={14} style={{ marginRight: \'6px\' }} /> Import Backup',
    'Import overwrites the current settings and reloads the app. Encrypted backups ask for their passphrase in a'
  ]);
});

test('The Reset Platform section resolves across the union, in render order', () => {
  ordered(cardUnion, 'account.reset', [
    '<AlertTriangle size={18} color="var(--color-vulnerable)" />',
    '<h3 style={{ fontSize: \'1.15rem\', fontWeight: 800 }}>Reset Platform</h3>',
    'Deletes ALL data stored in this browser',
    'custom &amp; AI-generated tests, comparison lineup, audit history, demo settings, and the cached matrix —',
    'onClick={resetAllData}',
    '<Trash2 size={14} style={{ marginRight: \'6px\' }} /> Reset everything'
  ]);
});

test('The gate + testid counts are preserved across the union', () => {
  assert.equal(countIn(cardUnion, `collapsedSettings['account-data']`), 2, 'the two account collapse gates survive the move');
  assert.equal(countIn(cardUnion, `<SettingsCardHeader settingKey="account-data"`), 1, 'the account header stays mounted exactly once');
  for (const marker of [
    'data-testid="vault-passphrase-input"',
    'data-testid="vault-unlock"',
    'data-testid="vault-lock"',
    'data-testid="vault-protect-input"',
    'data-testid="vault-protect"',
    'data-testid="backup-export"',
    'data-testid="backup-import-input"',
    'id="backup-file-input"'
  ]) {
    assert.equal(countIn(cardUnion, marker), 1, `the card surface renders ${marker} exactly once (view ∪ card)`);
  }
  assert.equal(countIn(cardUnion, 'onChange={(e) => setVaultInput(e.target.value)}'), 3, 'unlock + change-passphrase + protect inputs all write the vaultInput prop (3 bindings across the pair)');
  assert.equal(countIn(cardUnion, 'onChange={handleImportBackup}'), 1, 'the card import input binds handleImportBackup exactly once');
  assert.equal(countIn(cardUnion, 'onClick={handleExportBackup}'), 1, 'the export button binds handleExportBackup exactly once');
  assert.equal(countIn(cardUnion, 'onClick={resetAllData}'), 1, 'the reset button binds resetAllData exactly once');
});

// ---------------------------------------------------------------------------
// SettingsView composition — import, mount position, bare-identifier wiring
// ---------------------------------------------------------------------------

test('SettingsView imports the card and composes it exactly once with bare-identifier wiring', () => {
  assert.ok(accountCard.length > 0, 'AccountDataCard.jsx exists');
  assert.match(view, /import { AccountDataCard } from '\.\/settings\/AccountDataCard';/, 'the view imports AccountDataCard');
  assert.equal(countIn(view, '<AccountDataCard'), 1, 'the view composes the card exactly once');
  // The card's mount block (opening tag to its self-close), so the prop pins
  // are not confused by the same spellings on the sibling mounts (the view
  // also wires vaultLocked/vaultPassphraseSet into StatusBanners and
  // ProvidersCard).
  const mStart = view.indexOf('<AccountDataCard');
  assert.ok(mStart >= 0, 'the AccountDataCard mount exists');
  const mEnd = view.indexOf('/>', mStart);
  assert.ok(mEnd > mStart, 'the AccountDataCard mount is self-closed');
  const mount = view.slice(mStart, mEnd + 2);
  for (const name of [
    'vaultLoading', 'vaultLocked', 'vaultPassphraseSet',
    'vaultInput', 'setVaultInput',
    'handleUnlockVault', 'handleLockVault', 'handleUnprotectVault', 'handleProtectVault',
    'backupPassphrase', 'setBackupPassphrase',
    'handleExportBackup', 'handleImportBackup',
    'resetAllData'
  ]) {
    assert.equal(countIn(mount, `${name}={${name}}`), 1, `the mount wires ${name}={${name}} (bare, referentially stable)`);
  }
  assert.ok(mount.includes('collapsedSettings={collapsedSettings}'), 'the mount wires collapsedSettings={collapsedSettings}');
});

test('SettingsView keeps its exact pre-split prop list; the vault trio stays bound from the view destructure', () => {
  for (const name of [
    'buildJudge', 'testJudge', 'testGenerator', 'testingJudge', 'testingGen',
    'setDemoMode', 'selectedGenProvider', 'genModelList', 'helperProviderSelectable',
    'selectedJudgeProvider', 'judgeModelList',
    'handleProtectVault', 'handleUnprotectVault', 'handleLockVault',
    'vaultInput', 'setVaultInput', 'resetAllData',
    'handleExportBackup', 'handleImportBackup', 'backupPassphrase', 'setBackupPassphrase'
  ]) {
    assert.match(view, new RegExp(`^  ${name},?$`, 'm'), `the view takes ${name} as a prop (list unchanged)`);
  }
  const providersBlock = /const \{([\s\S]*?)\} = useProviders\(\);/.exec(view);
  assert.ok(providersBlock, 'the view destructures useProviders()');
  for (const name of ['vaultLoading', 'vaultLocked', 'vaultPassphraseSet', 'handleUnlockVault']) {
    assert.match(providersBlock[1], new RegExp(`\\b${name}\\b`), `the view keeps ${name} bound from context for the card wiring`);
  }
  const settingsBlock = /const \{([\s\S]*?)\} = useSettings\(\);/.exec(view);
  assert.ok(settingsBlock, 'the view destructures useSettings()');
  assert.match(settingsBlock[1], /\bcollapsedSettings\b/, 'the view keeps collapsedSettings bound from context for the card wiring');
  // App-side wiring is untouched: the mount still hands the same bare props.
  const mount = appMountBlock();
  for (const name of ['handleProtectVault', 'handleUnprotectVault', 'handleLockVault', 'vaultInput', 'setVaultInput', 'resetAllData', 'handleExportBackup', 'handleImportBackup', 'backupPassphrase', 'setBackupPassphrase']) {
    assert.ok(mount.includes(`${name}={${name}}`), `the App mount still wires ${name}={${name}}`);
  }
  assert.equal(countIn(app, 'const resetAllData ='), 1, 'resetAllData stays App-defined exactly once');
});

test('The card mount sits after the proxy card and before the Help card', () => {
  assert.ok(accountCard.length > 0, 'AccountDataCard.jsx exists');
  const proxyAt = view.indexOf('<ProxyCard');
  const mountAt = view.indexOf('<AccountDataCard');
  // The Help & Onboarding card is composed as <HelpCard />.
  const helpAt = view.indexOf('<HelpCard');
  assert.ok(proxyAt >= 0 && helpAt >= 0, 'the surrounding card mounts are present view-side');
  assert.ok(proxyAt < mountAt, 'the account mount succeeds the ProxyCard mount (baseline card order preserved)');
  assert.ok(mountAt < helpAt, 'the account mount precedes the HelpCard mount (baseline card order preserved)');
});

// ---------------------------------------------------------------------------
// Anchors + the unlock-form testid partition stay exactly-once
// ---------------------------------------------------------------------------

test('The account anchors exist exactly once across the new file set; App keeps zero', () => {
  assert.equal(countIn(cardUnion, 'data-tour="account-data"'), 1, 'data-tour="account-data" survives exactly once');
  for (const marker of ['data-tour="account-data"', 'data-tour="key-vault"', 'data-tour="backup-card"', "'Account & Data'", '>Reset Platform</h3>']) {
    assert.equal(countIn(cardUnion, marker), 1, `the account surface carries ${marker} exactly once (view ∪ card)`);
    assert.equal(countIn(app, marker), 0, `App keeps none of the moved account surface: ${marker}`);
  }
  assert.ok(!app.includes('<AccountDataCard'), 'App never mounts the account card directly');
});

test('The in-card unlock testids keep their App∪modal partition; the global prompt is untouched', () => {
  for (const marker of ['data-testid="vault-passphrase-input"', 'data-testid="vault-unlock"']) {
    assert.equal(countIn(cardUnion, marker), 1, `the in-card unlock form carries ${marker} exactly once (view ∪ card)`);
  }
  // The GLOBAL unlock prompt's occurrence lives exactly once across the
  // App ∪ modal file set (VaultUnlockPrompt.jsx keeps its own copy; App keeps
  // zero).
  const unlockPrompt = readSource('src/components/modals/VaultUnlockPrompt.jsx');
  for (const marker of ['data-testid="vault-passphrase-input"', 'data-testid="vault-unlock"']) {
    assert.equal(countIn(app, marker) + countIn(unlockPrompt, marker), 1, `the global unlock prompt's ${marker} lives exactly once across App ∪ the extracted modal`);
    assert.equal(countIn(unlockPrompt, marker), 1, `VaultUnlockPrompt keeps its own ${marker} untouched`);
  }
});

// ---------------------------------------------------------------------------
// Shrink + cleanliness gates
// ---------------------------------------------------------------------------

test('SettingsView is strictly net-smaller; the card carries the moved region whole', () => {
  assert.ok(accountCard.length > 0, 'AccountDataCard.jsx exists');
  // The view must shrink below its 365-line reference; the account region
  // leaves with the card.
  assert.ok(lineCount(view) < 365, `SettingsView is strictly net-smaller than its 365-line T10 baseline (got ${lineCount(view)})`);
  assert.ok(lineCount(accountCard) > 120, `the card carries the moved region whole; got ${lineCount(accountCard)} lines`);
  // The view does not carry the card bodies: every section-defining
  // fragment must not be defined twice across the pair (exactly-once above) —
  // and the view must not carry the deep-card fragments.
  for (const fragment of [
    'data-tour="key-vault"',
    'data-tour="backup-card"',
    '>Reset Platform</h3>',
    'data-testid="backup-export"'
  ]) {
    assert.equal(countIn(view, fragment), 0, `the view lost the moved fragment: ${fragment}`);
  }
  // Shed completeness (no NEW lint findings): every icon the account card
  // consumes leaves the view with the card — the card is the LAST lucide-react
  // consumer view-side (the other cards import their own icons module-side),
  // so the whole lucide-react import line sheds with the region, together with
  // the vaultSupported import and the card-only JSX usage.
  for (const fragment of [
    '<UserCog', '<Lock size={18}', '<Lock size={14}', '<Database size',
    '<Download size', '<Upload size', '<Trash2 size', '<AlertTriangle',
    '<RefreshCw', '{vaultLoading && (', 'badge badge-primary',
    "import { vaultSupported } from '../../utils/vault';",
    "from 'lucide-react'"
  ]) {
    assert.equal(countIn(view, fragment), 0, `the view sheds the card-only usage: ${fragment}`);
  }
  // The declaration + composition keeps the whole card body at exactly one
  // definition site across the view ∪ card pair.
  for (const needle of [
    'API keys are stored in your browser\'s <b>IndexedDB vault</b>',
    'Export all API keys, providers, the comparison lineup, judge settings, saved tests, and audit history',
    'Deletes ALL data stored in this browser'
  ]) {
    assert.equal(countIn(cardUnion, needle), 1, `'${needle}' stays defined exactly once across the pair`);
  }
});

test('The card file is parse-clean — no stub fragments, single definition', () => {
  assert.ok(accountCard.length > 0, 'AccountDataCard.jsx exists');
  for (const fragment of ['600\', background', "fontWeight: 700'", 'Settings view - Configure providers, models, and application settings']) {
    assert.ok(!accountCard.includes(fragment), `no stray fragment in the card: ${fragment}`);
  }
  assert.equal([...accountCard.matchAll(/export function AccountDataCard\(/g)].length, 1, 'exactly one component definition');
  assert.equal([...accountCard.matchAll(/export default /g)].length, 1, 'exactly one default export');
});
