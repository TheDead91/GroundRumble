// Contract: the settings platform cards — the MITRE ATLAS sync card, the
// Proxy Configuration card, the Account & Data card (Key Vault + Backup &
// Restore + Reset Platform) and the Help & Onboarding card — render from
// src/components/views/SettingsView.jsx, consuming SettingsContext,
// ProvidersContext and UIContext directly, with the App-side orchestration
// (the Key-Vault handler trio, vaultInput, resetAllData and the useBackupFlow
// bindings) wired down as bare-identifier props. The banners, Providers card
// and Helper Models card render ahead of the platform cards.
//
// Source-text level because Node cannot import JSX/extensionless specifiers
// under bare node:test (repo convention: see tests/settings-view.contract.test.mjs
// and tests/comparison-results.contract.test.mjs).
//
// Union tolerance: the Providers card may render from
// src/components/views/settings/ProvidersCard.jsx, and the shared
// settingsCardHeader render-prop may render from the component
// src/components/views/settings/SettingsCardHeader.jsx. The pins those
// surfaces carry (the mount's settingsCardHeader prop, the surface markers the
// providers card carries, the card-order walk, the header definition and the
// per-card header routing) resolve across the App ∪ view ∪ providers-card ∪
// header file set, so the same guarantee holds whether the card renders from
// the module or inline in the view.
//
// The Proxy Configuration card may render from
// src/components/views/settings/ProxyCard.jsx — the cors-card pins (shell,
// ordered walk, gate counts, anchors) resolve across the view ∪ proxy-card
// file set; the account-card pins are mirrored across the view ∪
// src/components/views/settings/AccountDataCard.jsx set so this file stays
// green whether or not the card module is present.
//
// The Account & Data card may render from AccountDataCard.jsx: the account-card
// ordered walks (view.vault / view.backup / view.reset), the vaultInput
// onChange binding, the in-card unlock-form testid counts and the view-size
// gates resolve across the view ∪ AccountDataCard.jsx file set and reflect the
// smaller composition shell.
//
// The settings banners may render from
// src/components/views/settings/StatusBanners.jsx, and the ATLAS sync + Help &
// Onboarding platform cards may render from
// src/components/views/settings/AtlasSyncCard.jsx and
// src/components/views/settings/HelpCard.jsx. The pins those surfaces carry
// (the banner copy + 'Needs attention' marker, the atlas/help markers and
// counts, the per-card ordered walks, the header routing, the collapse gates,
// the anchors and the help-card handler pins) resolve across the App ∪ view ∪
// banners ∪ atlas-card ∪ help-card file set, so the same guarantee holds
// whether each body renders from its module or inline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP_PATH = 'src/App.jsx';
const VIEW_PATH = 'src/components/views/SettingsView.jsx';
const SETTINGS_CTX_PATH = 'src/context/SettingsContext.jsx';
const VAULT_ACTIONS_HOOK_PATH = 'src/hooks/useVaultActions.js';
// The encrypted-backup passphrase modal may render from this file.
const MODAL_PATH = 'src/components/modals/BackupImportModal.jsx';
// The first-run onboarding wizard may render from this file.
const ONBOARDING_MODAL_PATH = 'src/components/modals/OnboardingModal.jsx';
// The global vault-unlock prompt modal may render from this file.
const UNLOCK_PROMPT_PATH = 'src/components/modals/VaultUnlockPrompt.jsx';
// The Providers card + the shared card header may render from these files.
const CARD_PATH = 'src/components/views/settings/ProvidersCard.jsx';
const HEADER_PATH = 'src/components/views/settings/SettingsCardHeader.jsx';
// The Proxy Configuration card may render from this file.
const PROXY_CARD_PATH = 'src/components/views/settings/ProxyCard.jsx';
// The Account & Data card may render from this file (the guard tolerates
// either side so this file stays green whether or not the module is present).
const ACCOUNT_CARD_PATH = 'src/components/views/settings/AccountDataCard.jsx';
// The "Needs attention" + vault-locked banners may render from this module
// (absent when inline; the marker pins below resolve across the view ∪
// banners file set either way).
const BANNERS_PATH = 'src/components/views/settings/StatusBanners.jsx';
// The Helper Models card may render from this file (absent when inline; the
// helper markers and the card-order walk below resolve across the view ∪
// helper-card file set either way).
const HELPER_CARD_PATH = 'src/components/views/settings/HelperModelsCard.jsx';
// The ATLAS sync + Help & Onboarding platform cards may render from these files.
const ATLAS_CARD_PATH = 'src/components/views/settings/AtlasSyncCard.jsx';
const HELP_CARD_PATH = 'src/components/views/settings/HelpCard.jsx';

const readSource = (relPath) => readFileSync(join(root, relPath), 'utf8').replace(/\r\n/g, '\n');
let app = '', view = '', settingsCtx = '', vaultActionsHook = '', tour = '', modal = '', onboardingModal = '', unlockPrompt = '';
let providersCard = '', cardHeader = '', proxyCard = '', accountCard = '', banners = '', helperCard = '', atlasCard = '', helpCard = '';
try {
  app = readSource(APP_PATH);
  view = readSource(VIEW_PATH);
  settingsCtx = readSource(SETTINGS_CTX_PATH);
  vaultActionsHook = readSource(VAULT_ACTIONS_HOOK_PATH);
  // The guided-tour step definitions may live in the pure factory
  // module src/utils/tour-steps.js; when the file is absent `tour` stays ''.
  tour = readSource('src/utils/tour-steps.js');
  if (existsSync(join(root, MODAL_PATH))) modal = readSource(MODAL_PATH);
  // The onboarding wizard JSX may live inline in App.jsx or module-side;
  // `onboardingModal` stays '' when it is inline.
  if (existsSync(join(root, ONBOARDING_MODAL_PATH))) onboardingModal = readSource(ONBOARDING_MODAL_PATH);
  // The global unlock prompt may be App-inline (unlockPrompt stays '') or
  // module-side; every pin below resolves across the App ∪ modal file set.
  if (existsSync(join(root, UNLOCK_PROMPT_PATH))) unlockPrompt = readSource(UNLOCK_PROMPT_PATH);
  // Both modules may be absent when the card renders inline (providersCard/
  // cardHeader stay ''); the pins these modules own resolve across the view ∪
  // card ∪ header file set either way.
  if (existsSync(join(root, CARD_PATH))) providersCard = readSource(CARD_PATH);
  if (existsSync(join(root, HEADER_PATH))) cardHeader = readSource(HEADER_PATH);
  // ProxyCard.jsx may be absent when the cors card renders inline (proxyCard
  // stays ''); every cors pin below resolves across the view ∪ proxy-card file
  // set either way.
  if (existsSync(join(root, PROXY_CARD_PATH))) proxyCard = readSource(PROXY_CARD_PATH);
  // AccountDataCard.jsx may be absent when the account card renders inline
  // (accountCard stays ''); the account pins resolve across the account file
  // set either way.
  if (existsSync(join(root, ACCOUNT_CARD_PATH))) accountCard = readSource(ACCOUNT_CARD_PATH);
  // StatusBanners.jsx may be absent when the banners render inline (banners
  // stays '' and the "Needs attention" marker pin resolves view-side); the
  // banner pins resolve across the view ∪ banners file set either way.
  if (existsSync(join(root, BANNERS_PATH))) banners = readSource(BANNERS_PATH);
  // HelperModelsCard.jsx may be absent when the card renders inline
  // (helperCard stays ''); the helper pins resolve across the view ∪
  // helper-card file set either way.
  if (existsSync(join(root, HELPER_CARD_PATH))) helperCard = readSource(HELPER_CARD_PATH);
  // AtlasSyncCard.jsx/HelpCard.jsx may be absent when the cards render inline
  // (atlasCard/helpCard stay '' and the atlas/help pins resolve view-side);
  // those pins resolve across the view ∪ cards union either way.
  if (existsSync(join(root, ATLAS_CARD_PATH))) atlasCard = readSource(ATLAS_CARD_PATH);
  if (existsSync(join(root, HELP_CARD_PATH))) helpCard = readSource(HELP_CARD_PATH);
} catch { /* missing files fail their first assertion */ }


// The Key-Vault handler trio lives in the useVaultActions hook; the App.jsx +
// hook pair keeps every concern at exactly one definition site.
const appPlusVaultHook = `${app}\n${vaultActionsHook}`;

// The providers-card surface resolves across the view ∪ card file set (inline
// in the view or in the card module).
const viewOrCard = (needle) => view.includes(needle) || providersCard.includes(needle);
// The proxy-card and account-card surfaces each resolve across their own
// view ∪ card file set (inline in the view or in the card module) — identical
// guarantees on both sides.
const viewPlusProxy = view + '\n' + proxyCard;
const viewOrProxy = (needle) => view.includes(needle) || proxyCard.includes(needle);
const viewPlusAccount = view + '\n' + accountCard;
// The account-card needles resolve whether the card is inline or in its module.
const viewOrAccount = (needle) => view.includes(needle) || accountCard.includes(needle);
// The banner surface resolves across the view ∪ banners file set (inline in
// the view or in the banners module).
const viewOrBanners = (needle) => view.includes(needle) || banners.includes(needle);
// The banner + atlas/help-card surfaces resolve across the view ∪ banners ∪
// cards file set; the per-card ordered walks resolve against whichever file
// owns the card body (inline in the view or module-side).
const viewPlusCards = view + '\n' + atlasCard + '\n' + helpCard;
const viewOrCards = (needle) => view.includes(needle) || atlasCard.includes(needle) || helpCard.includes(needle);
const atlasBody = atlasCard || view;
const helpBody = helpCard || view;

const norm = (text) => text.replace(/\s+/g, ' ').trim();
const countIn = (source, needle) => source.split(needle).length - 1;
const lineCount = (source) => source.replace(/\n+$/, '').split('\n').length;

// App-side tour copy resolves across App.jsx ∪ src/utils/tour-steps.js (the
// factory module may own it, or the file may be absent).
const appTour = app + '\n' + tour;

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

// A card's header needle resolves from either side of the component move —
// the exact render-prop call when the card is inline, the
// <SettingsCardHeader settingKey="…"> mount when it is extracted (the
// icon/title parity around it is pinned by the exact-once marker list).
const headerNeedle = (key, preT09Call) => (view.includes(preT09Call) ? preT09Call : `settingKey="${key}"`);

// The <SettingsView … /> mount block inside App.jsx (opening tag to the first
// self-closing `/>`), which proves the prop wiring.
function mountBlock() {
  const start = app.indexOf('<SettingsView');
  assert.ok(start >= 0, 'App.jsx mounts <SettingsView … />');
  const end = app.indexOf('/>', start);
  assert.ok(end > start, 'the <SettingsView mount is self-closed');
  return app.slice(start, end + 2);
}

// The orchestration props the view must receive (bare-identifier bindings).
// settingsCardHeader is not in the pinned props list: App does not wire the
// render-prop (the view mounts SettingsCardHeader directly).
const ORCHESTRATION_PROPS = [
  'handleProtectVault', 'handleUnprotectVault', 'handleLockVault',
  'vaultInput', 'setVaultInput',
  'resetAllData',
  'handleExportBackup', 'handleImportBackup',
  'backupPassphrase', 'setBackupPassphrase'
];

// ---------------------------------------------------------------------------
// The platform cards render from the context-fed view
// ---------------------------------------------------------------------------

test('SettingsView.jsx is the real view — named + default export, the four platform cards, placeholder gone', () => {
  assert.match(view, /export function SettingsView\(/, 'SettingsView is exported (the extracted component)');
  assert.match(view, /export default SettingsView;|export default SettingsView\s*;/, 'the default export stays for direct App composition');
  // The proxy-card and account-card markers resolve across their own view ∪
  // card file set; the other markers stay view-side.
  for (const marker of [
    'data-tour="atlas-sync-settings"',
    'data-tour="sync-atlas-settings"',
    'data-tour="help-onboarding"',
    "'MITRE ATLAS Framework Database'",
    "'Help & Onboarding'"
  ]) {
    assert.equal(countIn(viewPlusCards, marker), 1, `the view ∪ cards render ${marker} exactly once`);
  }
  for (const marker of ['data-tour="cors-card"', "'Proxy Configuration'"]) {
    assert.equal(countIn(viewPlusProxy, marker), 1, `the proxy surface renders ${marker} exactly once (view ∪ card)`);
  }
  for (const marker of [
    'data-tour="account-data"',
    'data-tour="key-vault"',
    'data-tour="backup-card"',
    "'Account & Data'"
  ]) {
    assert.equal(countIn(viewPlusAccount, marker), 1, `the account surface renders ${marker} exactly once (view ∪ card)`);
  }
  assert.ok(!view.includes('Settings view - Configure providers, models, and application settings'), 'the placeholder stub text is gone');
  // The gate is 200 rather than 300 — with the Account & Data card rendered
  // from src/components/views/settings/AccountDataCard.jsx the view is a
  // composition shell + the remaining card mounts (~215 lines); it must stay
  // the real view, not a stub.
  assert.ok(lineCount(view) > 200, `the view carries the moved cards; got ${lineCount(view)} lines`);
});

test('The card chunk lives view-side — card markers exist exactly once view-side, zero App-side', () => {
  // Mirrors the platform-card union — proxy-card markers over the view ∪
  // proxy-card set, account-card markers over the account set.
  for (const marker of [
    'data-tour="atlas-sync-settings"',
    'data-tour="sync-atlas-settings"',
    'data-tour="help-onboarding"',
    "'MITRE ATLAS Framework Database'",
    "'Help & Onboarding'",
    'Sync live with the official MITRE GitHub to download all 80+ techniques',
    'Replay onboarding'
  ]) {
    // The atlas/help surface may render from AtlasSyncCard.jsx/HelpCard.jsx —
    // it carries exactly once across the view ∪ cards union, zero App-side, either way.
    assert.equal(countIn(viewPlusCards, marker), 1, `the view ∪ cards carry ${marker} exactly once`);
    assert.equal(countIn(app, marker), 0, `App keeps none of the moved card surface: ${marker}`);
  }
  for (const marker of [
    'data-tour="cors-card"',
    "'Proxy Configuration'",
    'Browsers block most cross-origin traffic (CORS)'
  ]) {
    assert.equal(countIn(viewPlusProxy, marker), 1, `the proxy surface carries ${marker} exactly once (view ∪ card)`);
    assert.equal(countIn(app, marker), 0, `App keeps none of the moved card surface: ${marker}`);
  }
  for (const marker of [
    'data-tour="account-data"',
    'data-tour="key-vault"',
    'data-tour="backup-card"',
    "'Account & Data'",
    'data-testid="backup-export"',
    'data-testid="backup-import-input"',
    'data-testid="vault-lock"',
    'data-testid="vault-protect-input"',
    'data-testid="vault-protect"',
    'Export all API keys, providers, the comparison lineup, judge settings, saved tests, and audit history',
    'Deletes ALL data stored in this browser'
  ]) {
    assert.equal(countIn(viewPlusAccount, marker), 1, `the account surface carries ${marker} exactly once (view ∪ card)`);
    assert.equal(countIn(app, marker), 0, `App keeps none of the moved card surface: ${marker}`);
  }
  // The atlas/help card markers resolve across the view ∪ cards
  // set exactly once, zero App-side, either way.
  for (const marker of [
    'data-tour="atlas-sync-settings"',
    'data-tour="sync-atlas-settings"',
    'data-tour="help-onboarding"',
    "'MITRE ATLAS Framework Database'",
    "'Help & Onboarding'",
    'Sync live with the official MITRE GitHub to download all 80+ techniques',
    'Replay onboarding'
  ]) {
    assert.equal(countIn(viewPlusCards, marker), 1, `the view ∪ cards carry ${marker} exactly once`);
    assert.equal(countIn(app, marker), 0, `App keeps none of the moved card surface: ${marker}`);
  }
  // The in-card unlock form shares its testids with the GLOBAL unlock
  // prompt (the vault-locked modal) — the card's own form lives view-side,
  // and the global prompt's occurrence lives exactly once across the
  // App ∪ modal file set: App-side while the prompt is still inline, then in
  // src/components/modals/VaultUnlockPrompt.jsx once extracted (App keeps
  // zero). Totals preserved either way.
  // The in-card unlock form may render from
  // src/components/views/settings/AccountDataCard.jsx — the count resolves
  // across the view ∪ account-card file set (inline or card-side), identical
  // guarantee on both sides.
  for (const marker of ['data-testid="vault-passphrase-input"', 'data-testid="vault-unlock"']) {
    assert.equal(countIn(viewPlusAccount, marker), 1, `the in-card unlock form carries ${marker} exactly once (view ∪ account card)`);
    assert.equal(countIn(app, marker) + countIn(unlockPrompt, marker), 1, `the global unlock prompt's ${marker} lives exactly once across App ∪ the extracted modal`);
  }
});

test('The view consumes Settings/Providers/UI contexts directly; the T14 surface renders view-side', () => {
  const settingsBlock = /const \{([\s\S]*?)\} = useSettings\(\);/.exec(view);
  assert.ok(settingsBlock, 'the view destructures useSettings()');
  for (const name of ['syncLiveATLAS', 'loadingATLAS', 'atlasSyncStatus', 'proxyEnabled', 'setProxyEnabled', 'proxyUrl', 'setProxyUrl', 'proxyMode', 'setProxyMode', 'proxyCategories', 'setProxyCategories', 'collapsedSettings']) {
    assert.match(settingsBlock[1], new RegExp(`\\b${name}\\b`), `the view takes ${name} from SettingsContext`);
  }
  const providersBlock = /const \{([\s\S]*?)\} = useProviders\(\);/.exec(view);
  assert.ok(providersBlock, 'the view destructures useProviders()');
  for (const name of ['vaultLoading', 'vaultLocked', 'vaultPassphraseSet']) {
    assert.match(providersBlock[1], new RegExp(`\\b${name}\\b`), `the view takes ${name} from ProvidersContext`);
  }
  const uiBlock = /const \{([\s\S]*?)\} = useUI\(\);/.exec(view);
  assert.ok(uiBlock, 'the view destructures useUI()');
  for (const name of ['setActiveTab', 'setOnboardingOpen', 'setTourRunning']) {
    assert.match(uiBlock[1], new RegExp(`\\b${name}\\b`), `the view takes ${name} from UIContext`);
  }
  // The vaultSupported import may render alongside the badge ladder in
  // src/components/views/settings/AccountDataCard.jsx — the import resolves
  // across the view ∪ account-card file set either way. The card-side
  // specifier must be three levels deep to resolve from
  // src/components/views/settings/ (ProvidersCard.jsx in the same dir uses
  // three levels); the view-side specifier keeps the views-dir depth.
  assert.ok(
    /import \{ vaultSupported \} from '\.\.\/\.\.\/utils\/vault';/.test(view) || /import \{ vaultSupported \} from '\.\.\/\.\.\/\.\.\/utils\/vault';/.test(accountCard),
    'the vaultSupported import resolves across the view ∪ account card (view-side pre-T10, card-side after)'
  );
  // The banners + Providers + Helper Models cards render from this view — the
  // markers render view-side and are gone App-side (App's tour config
  // legitimately keeps targeting the anchors, so its
  // '[data-tour="…"]' selector strings are stripped first).
  // The credentials-panel anchor and the nested sandbox card may render from
  // ProvidersCard.jsx — those two resolve across the view ∪ card.
  // The "Needs attention" banner may render from StatusBanners.jsx —
  // it resolves across the view ∪ banners union.
  const appNoTourSelectors = app.replace(/\[data-tour="[^"]+"\]/g, '');
  // The helper-models/judge-config markers also resolve across
  // the view ∪ helper-card set when the Helper Models card is extracted.
  for (const marker of ['Needs attention', 'data-tour="helper-models"', 'data-tour="judge-config"']) {
    assert.ok(view.includes(marker) || viewOrCard(marker) || viewOrBanners(marker) || helperCard.includes(marker), `the T14 surface renders view-side (or card/banners/helper-card-side after T09/T11/T08): ${marker}`);
    assert.ok(!appNoTourSelectors.includes(marker), `the T14 surface left App.jsx: ${marker}`);
  }
  // The "Needs attention" shell renders view-side or from
  // StatusBanners.jsx — same guarantee either way.
  {
    const marker = 'Needs attention';
    assert.ok(viewOrBanners(marker), `the T14 banner surface renders view-side (or banner-side after T11): ${marker}`);
    assert.ok(!appNoTourSelectors.includes(marker), `the T14 surface left App.jsx: ${marker}`);
  }
  for (const marker of ['data-tour="credentials-panel"', 'data-tour="sandbox-config"']) {
    assert.ok(viewOrCard(marker), `the T14 surface renders view-side (or card-side after T09): ${marker}`);
    assert.ok(!appNoTourSelectors.includes(marker), `the T14 surface left App.jsx: ${marker}`);
  }
});

test('App mounts <SettingsView /> with exactly the orchestration props (bare-identifier wiring)', () => {
  assert.match(app, /import SettingsView from '\.\/components\/views\/SettingsView';/, 'App imports the extracted view');
  const mount = mountBlock();
  for (const name of ORCHESTRATION_PROPS) {
    assert.ok(mount.includes(`${name}={${name}}`), `the mount wires ${name}={${name}} (bare, referentially stable)`);
  }
  const props = mount.match(/[a-zA-Z]+=\{[^}]*\}/g) || [];
  assert.ok(props.length >= ORCHESTRATION_PROPS.length, `the mount wires ${props.length} props`);
  for (const prop of props) {
    assert.match(prop, /^[a-zA-Z]+=\{[a-zA-Z]+\}$/, `prop ${prop} must be a bare identifier={identifier} binding — no inline closures/object literals`);
  }
  // The mount sits INSIDE the settings conditional — the conditional holds
  // just the wrapper div and the mount. The helper-then-platform card order is
  // pinned view-side instead: the helper cards render ahead of the platform
  // cards (card order preserved).
  const cond = app.indexOf("{activeTab === 'settings' && (");
  assert.ok(cond >= 0, 'App keeps the settings conditional');
  const mountAt = app.indexOf('<SettingsView', cond);
  assert.ok(mountAt > cond, 'the mount is inside the settings conditional');
  // The card-order walk resolves across the card ∪ view file set — the
  // providers card (with the credentials-panel anchor) renders ahead of the
  // Helper Models card either way (inline in the view, or composed in from
  // ProvidersCard.jsx).
  // The walk resolves across the provider card ∪ helper card ∪ view ∪ atlas ∪
  // help file set — the walk order stays providers → helper models → ATLAS →
  // cors → account-data → help (the card bodies resolve against their owning
  // file either way).
  ordered(providersCard + '\n' + helperCard + '\n' + view + '\n' + atlasCard + '\n' + helpCard, 'settings cards', [
    'data-tour="credentials-panel"',
    'data-tour="helper-models"',
    'data-tour="atlas-sync-settings"'
  ]);
  // The view is mounted unconditionally within the conditional (no extra
  // activeTab gate inside the view — the lazy route must render it too).
  assert.ok(!view.includes("if (activeTab !== 'settings') return null;"), 'the view drops the stub activeTab early-return');
  assert.ok(!/const \{[^}]*\bactiveTab\b[^}]*\} = useUI\(\);/.test(view), 'the view does not even read activeTab (App owns the tab gating)');
});

// ---------------------------------------------------------------------------
// The card bodies are unchanged; the orchestration stays App-side
// ---------------------------------------------------------------------------

test('ATLAS sync card wiring is context-fed (sync, busy gate, live status)', () => {
  // The walk resolves against whichever file owns the card body (inline in the
  // view, or AtlasSyncCard.jsx).
  ordered(atlasBody, 'view.atlas card', [
    headerNeedle('atlas', "settingsCardHeader('atlas', <Layers size={18} color=\"var(--color-primary)\" />, 'MITRE ATLAS Framework Database')"),
    'onClick={syncLiveATLAS}',
    'data-tour="sync-atlas-settings"',
    'disabled={loadingATLAS}',
    "{loadingATLAS ? 'Downloading...' : 'Sync Live ATLAS'}",
    '{atlasSyncStatus}'
  ]);
});

test('Proxy card wiring — every edit flows through the SettingsContext setters', () => {
  // The cors ordered walk resolves across the view ∪ proxy-card file set
  // (inline in the view, or ProxyCard.jsx).
  ordered(viewPlusProxy, 'view.cors card', [
    'checked={proxyEnabled}',
    'onChange={(e) => setProxyEnabled(e.target.checked)}',
    'Enable the proxy',
    'checked={proxyCategories.articles}',
    'onChange={(e) => setProxyCategories((c) => ({ ...c, articles: e.target.checked }))}',
    'checked={proxyCategories.providers}',
    'onChange={(e) => setProxyCategories((c) => ({ ...c, providers: e.target.checked }))}',
    'checked={proxyCategories.privateNet}',
    'onChange={(e) => setProxyCategories((c) => ({ ...c, privateNet: e.target.checked }))}',
    'value={proxyMode}',
    'onChange={(e) => setProxyMode(e.target.value)}',
    '<option value="fallback">Only when the direct fetch is blocked (recommended)</option>',
    '<option value="always">All article fetches</option>',
    'value={proxyUrl}',
    'onChange={(e) => setProxyUrl(e.target.value)}',
    'placeholder="Enter your proxy URL (supports {url} placeholder)"',
    '<b>Privacy &amp; safety:</b> traffic is relayed through your configured proxy URL'
  ]);
  // The gate counts resolve across the view ∪ proxy-card pair.
  assert.equal(countIn(viewPlusProxy, 'disabled={!proxyEnabled}'), 3, 'the three category toggles gate on the proxy being enabled');
  assert.ok(viewOrProxy('disabled={!proxyEnabled || !proxyCategories.articles}'), 'the mode select additionally gates on article fetching');
  // The context-side immediate-apply contract is untouched.
  assert.ok(settingsCtx.includes('setProxyConfig({ enabled: proxyEnabled, baseUrl: url, mode: proxyMode, categories: proxyCategories });'), 'SettingsContext still applies setProxyConfig immediately on proxy-state changes');
  assert.ok(settingsCtx.includes("localStorage.setItem('atlas_proxy', JSON.stringify({ enabled: proxyEnabled, url: proxyUrl.trim(), mode: proxyMode, categories: proxyCategories }));"), 'SettingsContext still persists atlas_proxy');
});

test('Key Vault surfaces — badge ladder, unlock/lock/change/protect flows through App props', () => {
  // The vault section may render from AccountDataCard.jsx — the walk resolves
  // across the view ∪ card file set.
  ordered(viewPlusAccount, 'view.vault', [
    '{(!vaultSupported() || (vaultPassphraseSet ?? false) || vaultLocked) && (',
    "{!vaultSupported() ? 'UNSUPPORTED' : (vaultPassphraseSet ?? false) ? 'ENCRYPTED' : 'LOCKED'}",
    '{vaultLoading && (',
    ') : vaultLocked ? (',
    'handleUnlockVault(vaultInput)',
    'data-testid="vault-passphrase-input"',
    'data-testid="vault-unlock"',
    ') : (vaultPassphraseSet ?? false) ? (',
    'Your keys are encrypted at rest and unlocked for this session.',
    'data-testid="vault-lock"',
    'onClick={handleLockVault}',
    'onClick={handleUnprotectVault}',
    'handleProtectVault(); }}',
    'data-testid="vault-protect-input"',
    'data-testid="vault-protect"'
  ]);
  assert.ok(viewOrAccount('onChange={(e) => setVaultInput(e.target.value)}'), 'passphrase inputs write the vaultInput prop (view ∪ account card)');
  // The orchestration stays single-definition: resetAllData App-side, the
  // Key-Vault trio in the useVaultActions hook — exactly one definition site
  // across the App.jsx + hook pair.
  for (const name of ['handleProtectVault', 'handleUnprotectVault', 'handleLockVault']) {
    assert.equal(countIn(appPlusVaultHook, `const ${name} =`), 1, `${name} stays defined exactly once across App.jsx + the vault-actions hook`);
  }
  assert.equal(countIn(app, 'const resetAllData ='), 1, 'resetAllData stays App-defined exactly once');
  assert.ok(appPlusVaultHook.includes('await protectVault(vaultInput);'), 'handleProtectVault keeps its exact body (hook-side since T08)');
  assert.ok(appPlusVaultHook.includes('await unprotectVault({ providers });'), 'handleUnprotectVault keeps its exact body (hook-side since T08)');
});

test('Backup & Restore + Reset Platform — the T02 hook bindings arrive as props', () => {
  // The Backup & Restore + Reset Platform sections may render from
  // AccountDataCard.jsx — both walks resolve across the view ∪ card file set.
  ordered(viewPlusAccount, 'view.backup', [
    'value={backupPassphrase}',
    'onChange={(e) => setBackupPassphrase(e.target.value)}',
    'placeholder="Required to encrypt the backup (min 12 characters)"',
    'The backup will be encrypted with AES-256-GCM. The passphrase can\'t be recovered',
    'data-testid="backup-export"',
    'onClick={handleExportBackup}',
    'id="backup-file-input"',
    'data-testid="backup-import-input"',
    'accept=".json,application/json"',
    'onChange={handleImportBackup}',
    'htmlFor="backup-file-input"',
    'Import overwrites the current settings and reloads the app.'
  ]);
  ordered(viewPlusAccount, 'view.reset', [
    'onClick={resetAllData}',
    '<Trash2 size={14} style={{ marginRight: \'6px\' }} /> Reset everything'
  ]);
  // The hook stays App-bound; the import modal renders from the App+modal file
  // set (the passphrase modal JSX may live in
  // src/components/modals/BackupImportModal.jsx, where the null gate lives
  // module-side and App mounts the component unconditionally; identical
  // guarantee across both trees).
  assert.ok(app.includes("} = useBackupFlow({"), 'App still binds the T02 useBackupFlow hook');
  if (modal) {
    assert.ok(modal.includes('if (!backupImportModal) return null;'), 'the import modal gate lives module-side once extracted');
    assert.ok(app.includes('<BackupImportModal'), 'App mounts the extracted BackupImportModal');
  } else {
    assert.ok(app.includes('{backupImportModal && ('), 'the import modal stays App-rendered');
  }
  const modalUnion = app + '\n' + modal;
  assert.ok(modalUnion.includes('data-testid="backup-passphrase-cancel"') && modalUnion.includes('data-testid="backup-passphrase-import"'), 'the modal testids stay in the App+modal file set');
  // The wizard-side import input may live in App.jsx or in
  // src/components/modals/OnboardingModal.jsx — the count and the id pin
  // resolve over the App ∪ onboarding-modal file set (identical guarantee on
  // both sides).
  const onboardingUnion = app + '\n' + onboardingModal;
  assert.equal(countIn(onboardingUnion, /onChange=\{(?:handleImportBackup|onImportBackup)\}/), 1, 'the wizard-side import input stays the single wizard onChange binding (App-side pre-T05, prop-wired module-side post-T05) across App.jsx ∪ OnboardingModal.jsx (the card input moved into the view)');
  assert.ok(onboardingUnion.includes('id="wizard-backup-input"'), 'the wizard import input survives across App.jsx ∪ OnboardingModal.jsx');
});

test('Help & Onboarding handlers are exact', () => {
  // The walk resolves against whichever file owns the card body (the view, or
  // HelpCard.jsx); the view-side handler bodies stay wired into the card as
  // props either way.
  //
  // The six needles are split by owner: the header + the two button labels
  // resolve over helpBody (card-side when extracted, view-side when inline);
  // the three handler needles resolve over the view, with the tour-exit arrow
  // pinned in its cross-form `() => { setActiveTab('dashboard'); setTourRunning(true); }}`
  // (the button's inline onClick when inline, the onStartTour prop value when
  // extracted). No needle dropped, no count changed.
  ordered(helpBody, 'view.help card', [
    headerNeedle('help', "settingsCardHeader('help', <HelpCircle size={18} color=\"var(--color-primary)\" />, 'Help & Onboarding')"),
    '<HelpCircle size={14} style={{ marginRight: \'6px\' }} /> Replay onboarding',
    '<Info size={14} style={{ marginRight: \'6px\' }} /> Start interface tour'
  ]);
  ordered(view, 'view.help handlers (view-owned, wired into the card as props)', [
    "localStorage.removeItem('atlas_onboarding_done');",
    'setOnboardingOpen(true);',
    "() => { setActiveTab('dashboard'); setTourRunning(true); }}"
  ]);
});

// ---------------------------------------------------------------------------
// Card-collapse persistence + tour anchors
// ---------------------------------------------------------------------------

test('Card collapse flows from SettingsContext; anchors preserved', () => {
  // The shared header resolves from either side of the component move — an
  // App-local render-prop (wired as a prop), or the SettingsCardHeader
  // component (mounted view-side, consuming the collapse state itself) —
  // exactly one definition either way.
  assert.equal(countIn(app, 'const settingsCardHeader = ') + countIn(cardHeader, 'export function SettingsCardHeader('), 1,
    'the shared card header keeps exactly one definition (App render-prop pre-T09, SettingsCardHeader component post-T09)');
  for (const key of ['atlas', 'cors', 'account-data', 'help']) {
    // The header routing resolves from either side of the move — the
    // render-prop call, or the <SettingsCardHeader settingKey="…"> mount.
    // The cors/account-data keys resolve across their own view ∪ card sets;
    // the atlas/help keys across the view ∪ cards set.
    const surface = key === 'cors' ? viewPlusProxy : key === 'account-data' ? viewPlusAccount : viewPlusCards;
    assert.ok(view.includes(`settingsCardHeader('${key}'`) || surface.includes(`settingKey="${key}"`),
      `the ${key} card header routes through the shared card header`);
    // The atlas/help collapse gates resolve across the view ∪ cards set (inline
    // or card-side); cors/account-data stay across their own view ∪ card sets.
    assert.equal(countIn(surface, `collapsedSettings['${key}']`), 2, `the ${key} card gates its gap and body on collapsedSettings twice`);
  }
  for (const [key, flux] of [['cors', viewPlusProxy], ['account-data', viewPlusAccount]]) {
    assert.ok(flux.includes(`settingKey="${key}"`),
      `the ${key} card header routes through the shared card header (view ∪ card)`);
    assert.equal(countIn(flux, `collapsedSettings['${key}']`), 2, `the ${key} card gates its gap and body on collapsedSettings twice (view ∪ card)`);
  }
  assert.ok(settingsCtx.includes("localStorage.getItem('atlas_settings_collapsed'"), 'SettingsContext still reads atlas_settings_collapsed');
  assert.ok(settingsCtx.includes("localStorage.setItem('atlas_settings_collapsed', JSON.stringify(next));"), 'SettingsContext still persists atlas_settings_collapsed on toggle');
  // The four card anchors exist exactly once across the repo (each anchor
  // resolves across its own view ∪ card file set).
  for (const marker of ['atlas-sync-settings', 'cors-card', 'account-data', 'help-onboarding']) {
    const surface = marker === 'cors-card' ? viewPlusProxy : marker === 'account-data' ? viewPlusAccount : viewPlusCards;
    assert.equal(countIn(surface, `data-tour="${marker}"`), 1, `the view ∪ cards carry the ${marker} anchor`);
    assert.equal(countIn(app, `data-tour="${marker}"`), 0, `App no longer carries the ${marker} anchor`);
  }
  // The App-side tour config still targets the extracted-card anchors.
  for (const target of ['credentials-panel', 'judge-config', 'sandbox-config']) {
    assert.ok(appTour.includes(`'[data-tour="${target}"]'`), `the tour still targets ${target} (App-side pre-T10, src/utils/tour-steps.js after)`);
  }
});

// ---------------------------------------------------------------------------
// Shrink gates + the orphan-binding guard
// ---------------------------------------------------------------------------

test('Shrink gates — App.jsx stays below the gate, the view carries the cards', () => {
  const appLines = lineCount(app);
  const viewLines = lineCount(view);
  assert.ok(appLines < 5000, `App.jsx stays below the 5000-line shrink gate (3389 at the T15-rework baseline; got ${appLines})`);
  // The gate is 200 rather than 300 — the Account & Data card renders from its
  // own module (the view is ~215 lines); it must stay the real view, not a
  // stub.
  assert.ok(viewLines > 200, `SettingsView.jsx carries the moved cards (365 at the T10 baseline; got ${viewLines})`);
  // The card bodies are absent from App: spot-check three deep-card fragments.
  for (const fragment of [
    "settingsCardHeader('atlas',",
    'checked={proxyCategories.privateNet}',
    'data-testid="backup-export"'
  ]) {
    assert.ok(!app.includes(fragment), `App lost the moved fragment: ${fragment}`);
  }
  // App keeps its remaining settings surface + the conditional.
  assert.ok(app.includes("{activeTab === 'settings' && ("), 'the settings conditional stays');
  assert.ok(appPlusVaultHook.includes("const [vaultInput, setVaultInput] = useState('');"), 'vaultInput is declared exactly once across App.jsx + the vault-actions hook (hook-side since T08; the view receives it as a prop)');
});

test('The view file is parse-clean — no stub fragments remain', () => {
  // The placeholder stub debris and the MatrixView-stub stray-quote fragments
  // must not reappear here.
  for (const fragment of ['600\', background', "fontWeight: 700'"]) {
    assert.ok(!view.includes(fragment), `no stray-quote fragment in the view: ${fragment}`);
  }
  assert.ok(!view.includes('Settings view - Configure providers, models, and application settings'), 'no placeholder-stub text remains in the view');
});

test('The rework prune — no orphaned setOnboardingOpen binding remains in the App useUI() destructure', () => {
  // The orphaned setOnboardingOpen setter must not remain in the App useUI()
  // destructure (surgical: that one line only); the ui feeder and the
  // onboardingOpen state binding stay.
  assert.equal(countIn(app, 'setOnboardingOpen'), 0, 'the orphaned setOnboardingOpen binding is gone from App.jsx (T15-rework corrective action 1)');
  assert.ok(app.includes('const ui = useUI();'), 'the ui destructure feeder stays');
  assert.ok(app.includes('    onboardingOpen,'), 'the onboardingOpen state binding stays (the prune is surgical: only the setter line)');
  // The view keeps the name alive from its own useUI() destructure: the bind +
  // the help card's Replay-onboarding handler.
  // The bind + handler resolve across the view ∪ help-card set (both may be
  // view-side; the handler stays view-side as the prop value or moves
  // module-side with the card — exactly two occurrences either way).
  assert.equal(countIn(viewPlusCards, 'setOnboardingOpen'), 2, 'setOnboardingOpen is bound and fired exactly twice across the view ∪ help card');
  assert.ok(viewOrCards('setOnboardingOpen(true);'), 'the help card still opens onboarding (view-side pre-T12, HelpCard.jsx composition after)');
});
