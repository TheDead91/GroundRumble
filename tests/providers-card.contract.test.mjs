// Contract: the Providers card — the largest SettingsView card (provider rows,
// the inline provider draft form, model fetch/refresh/test flows, the Add
// Provider flow and the nested Sandbox Configuration card) — renders from
// src/components/views/settings/ProvidersCard.jsx consuming its deps via
// props-in/events-out (no context reaches), while the shared settingsCardHeader
// render-prop becomes the real component
// src/components/views/settings/SettingsCardHeader.jsx (props: settingKey,
// icon, title, extra; consumes useSettings collapse state itself). App sheds
// the render-prop definition and its prop wiring; SettingsView composes
// ProvidersCard and mounts SettingsCardHeader for its five remaining cards.
//
// Source-text level because Node cannot import JSX/extensionless specifiers
// under bare node:test (repo convention: see tests/settings-view.contract.test.mjs,
// tests/settings-platform-cards.contract.test.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP_PATH = 'src/App.jsx';
const VIEW_PATH = 'src/components/views/SettingsView.jsx';
const CARD_PATH = 'src/components/views/settings/ProvidersCard.jsx';
const HEADER_PATH = 'src/components/views/settings/SettingsCardHeader.jsx';
// The vault-locked banner may live in this module (the card-order pin below
// resolves against whichever file carries the banner).
const BANNERS_PATH = 'src/components/views/settings/StatusBanners.jsx';

const readSource = (relPath) => readFileSync(join(root, relPath), 'utf8').replace(/\r\n/g, '\n');
const readIfExists = (relPath) => { try { return readSource(relPath); } catch { return ''; } };

let app = '', view = '', card = '', header = '', settingsCtx = '', banners = '';
try {
  app = readSource(APP_PATH);
  view = readSource(VIEW_PATH);
  settingsCtx = readSource('src/context/SettingsContext.jsx');
} catch { /* missing files fail their first assertion */ }
// Both modules may be absent (still inline in SettingsView / App). Every pin
// below resolves over the tolerant file sets or fails its first
// assertion against the empty string.
if (existsSync(join(root, CARD_PATH))) card = readSource(CARD_PATH);
if (existsSync(join(root, HEADER_PATH))) header = readSource(HEADER_PATH);
// The Proxy Configuration card's module (view-side inline or ProxyCard.jsx).
const PROXY_CARD_PATH = 'src/components/views/settings/ProxyCard.jsx';
// The Account & Data card's module (view-side inline or the account card).
const ACCOUNT_CARD_PATH = 'src/components/views/settings/AccountDataCard.jsx';
// The Helper Models card may live in this file (the helper header mount, its
// collapse gates and the stay-put markers below resolve across the
// view ∪ helper-card file set either way).
const HELPER_CARD_PATH = 'src/components/views/settings/HelperModelsCard.jsx';
let proxyCard = '', accountCard = '', helperCard = '';
if (existsSync(join(root, PROXY_CARD_PATH))) proxyCard = readSource(PROXY_CARD_PATH);
if (existsSync(join(root, ACCOUNT_CARD_PATH))) accountCard = readSource(ACCOUNT_CARD_PATH);
// HelperModelsCard.jsx may be absent (helperCard stays '') when the markup is
// view-side; the helper pins resolve across the view ∪ helper-card file set
// either way.
if (existsSync(join(root, HELPER_CARD_PATH))) helperCard = readSource(HELPER_CARD_PATH);
// The vault-locked banner may live in the StatusBanners module; the card-order
// pin resolves against whichever file carries the banner.
if (existsSync(join(root, BANNERS_PATH))) banners = readSource(BANNERS_PATH);

const norm = (text) => text.replace(/\s+/g, ' ').trim();
const countIn = (source, needle) => source.split(needle).length - 1;
const lineCount = (source) => source.replace(/\n+$/, '').split('\n').length;
// Each card's surface resolves across its own view ∪ card file set (either
// home may own it).
const viewPlusProxy = view + '\n' + proxyCard;
const viewPlusAccount = view + '\n' + accountCard;
// The Helper Models surface resolves across the view ∪ helper-card file set.
const viewPlusHelper = view + '\n' + helperCard;
const viewOrHelper = (needle) => view.includes(needle) || helperCard.includes(needle);
// The atlas/help card modules may be absent — the union below extends over them
// so the per-key header parity and mount counts resolve across the full set
// either way.
const atlasCardT12 = readIfExists('src/components/views/settings/AtlasSyncCard.jsx');
const helpCardT12 = readIfExists('src/components/views/settings/HelpCard.jsx');
const cardUnion = view + '\n' + card + '\n' + atlasCardT12 + '\n' + helpCardT12;

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

// Extracts a component-level handler (2-space indent): from its declaration
// line to the handler-closing line, so trailing comments are excluded.
function regionOf(source, name) {
  const re = new RegExp(`^  const ${name} = `, 'm');
  const m = re.exec(source);
  assert.ok(m, `declaration of ${name} not found at the component-body indent`);
  const lines = source.slice(m.index).split('\n');
  const buf = [lines[0]];
  for (let i = 1; i < lines.length; i++) {
    buf.push(lines[i]);
    if (/^  \}(;|\)|,)/.test(lines[i]) || lines[i] === '  );') return buf.join('\n');
  }
  assert.fail(`handler ${name} has no closing line`);
}
const bodyOf = (source, name) => norm(regionOf(source, name));

// ---------------------------------------------------------------------------
// SettingsCardHeader.jsx — the shared card header becomes a real component
// ---------------------------------------------------------------------------

test('SettingsCardHeader.jsx exists, exports the component and nothing else leaks in', () => {
  assert.ok(card.length > 0, 'ProvidersCard.jsx exists');
  assert.ok(header.length > 0, 'SettingsCardHeader.jsx exists');
  assert.match(header, /export function SettingsCardHeader\(/, 'SettingsCardHeader is exported (named)');
  assert.match(header, /export default SettingsCardHeader;/, 'the default export stays (view-composition convention)');
  assert.ok(lineCount(header) < 40, `the component carries ONLY the header (got ${lineCount(header)} lines)`);
});

test('The component takes (settingKey, icon, title, extra) and consumes useSettings collapse state itself', () => {
  const sig = header.match(/export function SettingsCardHeader\(([^)]*)\)/);
  assert.ok(sig, 'the component signature is found');
  const props = sig[1].replace(/[{}]/g, '').split(',').map((p) => p.trim()).filter(Boolean);
  assert.deepEqual(props, ['settingKey', 'icon', 'title', 'extra = null'],
    'the prop surface is exactly settingKey, icon, title (extra defaults to null) — no collapsedSettings/toggle drill-in');
  // It consumes the collapse state ITSELF (no prop drilling of the state).
  assert.match(header, /const \{[^}]*\bcollapsedSettings\b[^}]*\btoggleSettingsCard\b[^}]*\} = useSettings\(\);/,
    'the component destructures collapsedSettings + toggleSettingsCard from useSettings() itself');
  assert.match(header, /import \{ useSettings \} from '\.\.\/\.\.\/\.\.\/context\/SettingsContext';/,
    'the component imports the settings context at the module depth');
  assert.match(header, /import React from 'react';/, 'the component keeps the repo React import convention');
  assert.match(header, /ChevronDown/, 'the collapsed chevron moves with the component');
  assert.match(header, /ChevronUp/, 'the expanded chevron moves with the component');
  assert.ok(!header.includes('lucide-react")') || /from 'lucide-react';/.test(header), 'chevrons come from lucide-react');
});

test('The moved header body is verbatim with key resolved to settingKey', () => {
  const body = norm(header);
  for (const needle of [
    '<div style={{ display: \'flex\', alignItems: \'center\', gap: \'8px\', cursor: \'pointer\', userSelect: \'none\' }} onClick={() => toggleSettingsCard(settingKey)}>',
    '{icon}',
    '<h3 style={{ fontSize: \'1.15rem\', fontWeight: 800 }}>{title}</h3>',
    '{extra}',
    'className="btn-secondary"',
    'style={{ marginLeft: \'auto\', padding: \'5px\', flexShrink: 0 }}',
    'onClick={(e) => { e.stopPropagation(); toggleSettingsCard(settingKey); }}',
    "title={collapsedSettings[settingKey] ? 'Expand card' : 'Collapse card'}",
    'aria-expanded={!collapsedSettings[settingKey]}',
    '{collapsedSettings[settingKey] ? <ChevronDown size={15} /> : <ChevronUp size={15} />}'
  ]) {
    assert.ok(body.includes(norm(needle)), `the header body keeps ${norm(needle)}`);
  }
});

// ---------------------------------------------------------------------------
// ProvidersCard.jsx — the card, props-in/events-out, no context
// ---------------------------------------------------------------------------

test('ProvidersCard.jsx exists and takes the declared props-in surface (all 28, each a bare binding)', () => {
  const PROPS = [
    'providers', 'setProviders', 'persistProviders',
    'providerDraft', 'setProviderDraft',
    'providerTest', 'setProviderTest',
    'providerModelErrors', 'providerRefreshing', 'refreshProviderModels',
    'handleProviderTest', 'openProviderDraft', 'deleteProvider', 'saveProviderDraft',
    'cpFromDraft', 'protectVault', 'setVaultPassphraseSet', 'setVaultLocked',
    'vaultLocked', 'vaultPassphraseSet',
    'addToast', 'askChoice', 'askConfirm', 'askInput',
    'useDemoMode', 'setDemoMode', 'collapsedSettings'
  ];
  assert.match(card, /export function ProvidersCard\(/, 'ProvidersCard is exported (named)');
  assert.match(card, /export default ProvidersCard;/, 'the default export stays (view-composition convention)');
  for (const name of PROPS) {
    assert.match(card, new RegExp(`^  ${name},?$`, 'm'), `the card takes ${name} as a prop`);
  }
  assert.match(card, /import React, \{ useCallback \} from 'react';/, 'the card keeps the React convention and useCallback for the moved wrapper');
});

test('The card is context-clean — deps arrive via props, never via context reaches', () => {
  assert.doesNotMatch(card, /= useProviders\(\)/, 'no useProviders() reach inside the card');
  assert.doesNotMatch(card, /= useSettings\(\)/, 'no useSettings() reach inside the card');
  assert.doesNotMatch(card, /= useUI\(\)/, 'no useUI() reach inside the card');
  assert.ok(!card.includes("from '../../context/"), 'the card imports no context module');
  assert.ok(!card.includes('setActiveTab'), 'the card never touches setActiveTab (App-side tab navigation stays out of the card)');
  // The card pulls only pure utils/data and its sibling header component.
  assert.match(card, /import \{ PROVIDER_PRESETS \} from '\.\.\/\.\.\/\.\.\/data\/app-config';/, 'presets import');
  assert.match(card, /import \{ vaultSupported \} from '\.\.\/\.\.\/\.\.\/utils\/vault';/, 'vaultSupported import');
  assert.match(card, /import \{ providerCarriesSecret \} from '\.\.\/\.\.\/\.\.\/utils\/providerSecret';/, 'secret-classifier import');
  assert.match(card, /import \{ deriveModelsEndpoint, resolveOpenAIEndpoint \} from '\.\.\/\.\.\/\.\.\/utils\/api';/, 'endpoint helpers import');
  assert.match(card, /import \{ isInsecureHttpEndpoint \} from '\.\.\/\.\.\/\.\.\/utils\/endpoint-policy';/, 'endpoint-policy import');
  assert.match(card, /import \{ SettingsCardHeader \} from '\.\/SettingsCardHeader';/, 'the card composes the shared header component');
});

test('HandleSaveProviderWrapper moved verbatim — same body, same dependency array', () => {
  const wrapper = bodyOf(card, 'handleSaveProviderWrapper');
  assert.ok(wrapper.includes('if (!vaultPassphraseSet && providerDraft.apiKey) {'), 'gate: unencrypted vault + API key in draft');
  assert.ok(wrapper.includes('Your vault is not encrypted. API keys will be stored in plaintext.'), 'choice dialog explains plaintext storage');
  assert.ok(wrapper.includes("cancelText: 'Cancel'"), 'choice: Cancel');
  assert.ok(wrapper.includes("secondaryText: 'Save anyway'"), 'choice: Save anyway');
  assert.ok(wrapper.includes("primaryText: 'Set up encryption'"), 'choice: Set up encryption');
  assert.ok(wrapper.includes('if (choice === \'cancel\') return;'), 'cancel aborts the save');
  assert.ok(!wrapper.includes("let passphrase = '';"), 'no dead outer passphrase declaration shadowed by the askInput result');
  assert.ok(wrapper.includes('if (passphrase.length >= 12) {'), 'passphrase minimum length enforced');
  assert.ok(wrapper.includes('await protectVault(passphrase);'), 'vault is protected with the passphrase');
  assert.ok(wrapper.includes('setVaultPassphraseSet(true);'), 'vaultPassphraseSet flips true');
  assert.ok(wrapper.includes('setVaultLocked(false);'), 'vault ends unlocked');
  assert.ok(wrapper.includes('addToast(\'API keys are now encrypted at rest. You will be asked to unlock on each new session.\');'), 'success toast is exact');
  assert.ok(wrapper.includes('await saveProviderDraft(e);'), 'the wrapper always ends in saveProviderDraft');
  assert.ok(wrapper.includes('}, [vaultPassphraseSet, providerDraft, saveProviderDraft, askChoice, protectVault, setVaultPassphraseSet, setVaultLocked, addToast, askInput]);'),
    'the dependency array moves with the body: every called binding (protectVault, setVaultPassphraseSet, setVaultLocked, addToast, askInput) is listed so the exhaustive-deps lint stays clean, minus the dead App-side setActiveTab pin (the body never calls it — an unnecessary dep would be a NEW lint finding; the reference keeps the binding alive in the view for the help card instead)');
});

test('EnableImportedProvider moved verbatim and stays defined exactly once', () => {
  const enable = bodyOf(card, 'enableImportedProvider');
  assert.ok(enable.includes('const next = providers.map(p => p.id === cp.id ? { ...p, enabled: true } : p);'), 'enable flips exactly the picked provider');
  assert.ok(enable.includes('setProviders(next);'), 'state updates through the setProviders prop');
  assert.ok(enable.includes('persistProviders(next);'), 'the change persists immediately');
  assert.ok(enable.includes('addToast(`"${cp.name}" is now enabled.`);'), 'the confirmation toast names the provider');
  assert.equal(countIn(card, 'const enableImportedProvider ='), 1, 'defined exactly once card-side');
  assert.equal(countIn(card, 'enableImportedProvider'), 2, 'exactly 1 definition + 1 call-site reference');
});

test('The inline draft form moved with its presets, fields, endpoint resolution and insecure-transport opt-in', () => {
  ordered(card, 'card.provider form', [
    '<form onSubmit={handleSaveProviderWrapper}',
    '{providerDraft.id ? \'Edit Provider\' : \'New Provider\'}',
    'onClick={() => setProviderDraft(null)}',
    '{PROVIDER_PRESETS.map(p => (',
    "connector: 'openai',",
    "method: 'POST',",
    "responsePath: 'choices.0.message.content'",
    '<label className="form-label">Provider Name</label>',
    'placeholder="e.g. OpenAI, OpenRouter, DeepSeek"',
    'const resolved = resolveOpenAIEndpoint(cpFromDraft(providerDraft));',
    'This endpoint uses plaintext <code>http://</code> to a remote host',
    'data-testid="provider-allow-insecure-transport"',
    'onClick={() => testConnection(cpFromDraft(providerDraft), \'draft\')}'
  ]);
});

test('The card renders the providers glass-card with the header mount, rows, actions and vault gates', () => {
  ordered(card, 'card.providers head', [
    '<div className="glass-card" data-tour="credentials-panel" style={{ display: \'flex\', flexDirection: \'column\', gap: collapsedSettings[\'providers\'] ? \'0\' : \'16px\' }}>',
    '<SettingsCardHeader settingKey="providers"',
    '<Plug size={18} color="var(--color-primary)" />',
    "title={'Providers'}",
    '(vaultSupported() && !vaultPassphraseSet && !vaultLocked && providers.some(providerCarriesSecret)) ? (',
    '<span data-testid="providers-plaintext-badge" title="API keys are stored unencrypted — set a passphrase in the Key Vault card to encrypt them at rest."',
    '<AlertTriangle size={12} /> Unencrypted keys',
    "{!collapsedSettings['providers'] && (",
    'Connect the model hosts you want to use — as comparison targets, the AI Judge, or the Test Generator.',
    'Your API keys and providers are <b>locked</b> (encrypted vault) and are not shown here. Unlock them in'
  ]);
  ordered(card, 'card.providers rows', [
    'data-testid={`provider-row-${cp.id}`}',
    'Imported, review before enabling',
    '{cp.connector === \'raw\' ? \'RAW\' : \'OpenAI-compatible\'}',
    '(isInsecureHttpEndpoint(cp.endpoint) || isInsecureHttpEndpoint(cp.modelsEndpoint)) && (',
    'HTTP — credentials sent unencrypted',
    "cp.connector !== 'raw' && resolveOpenAIEndpoint(cp).chatEndpoint !== cp.endpoint && (",
    '{providerModelErrors[cp.id] && (',
    "{providerTest[cp.id] && providerTest[cp.id].status !== 'testing' && (",
    'onClick={() => enableImportedProvider(cp)}',
    'data-testid={`provider-enable-${cp.id}`}',
    "cp.connector !== 'raw' && deriveModelsEndpoint(cp) && (",
    'onClick={() => refreshProviderModels(cp)}',
    'onClick={() => testConnection(cp, cp.id)}',
    'onClick={() => openProviderDraft(cp)}',
    'onClick={() => confirmDeleteProvider(cp)}'
  ]);
  assert.equal(countIn(card, 'vaultLocked && (vaultPassphraseSet ?? false)'), 5,
    'the vault-locked gate arms exactly the five state-changing surfaces (draft test, row test, edit, delete, Add Provider)');
  ordered(card, 'card.providers tail', [
    '{providerDraft && providerDraft.id === cp.id && providerForm}',
    '{providerDraft && !providerDraft.id && providerForm}',
    "{vaultLocked ? 'Providers are locked — unlock them in the Key Vault below.' : 'No providers configured yet. Use \"Add Provider\" to connect one.'}",
    'onClick={() => openProviderDraft()}',
    '<Plus size={14} /> Add Provider'
  ]);
});

test('The nested Sandbox Configuration card moved inside the card and stays intact', () => {
  ordered(card, 'card.sandbox', [
    '<div style={{ height: \'1px\', background: \'var(--border-subtle)\' }} />',
    '<div data-tour="sandbox-config" style={{ display: \'flex\', flexDirection: \'column\' }}>',
    'Sandbox Configuration',
    'Test the runner out-of-the-box using mock datasets — no API keys needed.',
    '<b>Demo Secure</b> (attacks resisted) and <b>Demo Vulnerable</b> (attacks succeed)',
    'data-tour="sandbox-toggle"',
    'checked={useDemoMode}',
    'onChange={(e) => setDemoMode(e.target.checked)}',
    'Active Sandbox Mode',
    'When enabled, the Auditor Runner simulates model responses instead of calling real APIs.'
  ]);
});

// ---------------------------------------------------------------------------
// SettingsView adoption — composition, header mounts, prop shed
// ---------------------------------------------------------------------------

test('SettingsView imports the two modules and sheds the settingsCardHeader prop entirely', () => {
  assert.match(view, /import \{ ProvidersCard \} from '\.\/settings\/ProvidersCard';/, 'the view imports ProvidersCard');
  // With the Account & Data card living in
  // src/components/views/settings/AccountDataCard.jsx the view's last direct
  // header usage may live card-side (the account card can be the view's final
  // <SettingsCardHeader consumer), so the header import resolves across the
  // view ∪ account-card file set — either the './settings/SettingsCardHeader'
  // spelling or the card's same-dir './SettingsCardHeader' spelling.
  assert.ok(
    /import \{ SettingsCardHeader \} from '\.\/settings\/SettingsCardHeader';/.test(view) ||
    /import \{ SettingsCardHeader \} from '\.\/SettingsCardHeader';/.test(accountCard),
    'the view ∪ account card imports SettingsCardHeader'
  );
  assert.equal(countIn(view, 'settingsCardHeader'), 0, 'the render-prop identifier is gone from the view (import, signature, call sites)');
  // The view still destructures every name it forwards to the card — the
  // context-consumption contract is unchanged.
  const providersBlock = /const \{([\s\S]*?)\n  \} = useProviders\(\);/.exec(view) || /const \{([\s\S]*?)\} = useProviders\(\);/.exec(view);
  assert.ok(providersBlock, 'the view still destructures useProviders()');
  for (const name of ['providers', 'setProviders', 'persistProviders', 'providerDraft', 'setProviderDraft', 'providerTest', 'setProviderTest', 'providerModelErrors', 'providerRefreshing', 'refreshProviderModels', 'handleProviderTest', 'openProviderDraft', 'deleteProvider', 'saveProviderDraft', 'cpFromDraft', 'protectVault', 'setVaultPassphraseSet', 'setVaultLocked', 'vaultLocked', 'vaultPassphraseSet']) {
    assert.match(providersBlock[1], new RegExp(`\\b${name}\\b`), `the view keeps forwarding ${name}`);
  }
});

test('SettingsView composes <ProvidersCard> with the full props-in wiring at the exact position', () => {
  // The vault-locked banner may live in StatusBanners.jsx — resolve the banner
  // side, then keep the card-order guarantee against whichever file set carries
  // it. The Helper Models card may live in HelperModelsCard.jsx — the
  // helper-models anchor resolves across the view ∪ helper-card set, still
  // after the ProvidersCard mount either way.
  const bannerCopy = 'Your API keys are <b>locked</b> (encrypted vault). Unlock them in';
  const viewPlusHelper = view + '\n' + helperCard;
  const mountAt = viewPlusHelper.indexOf('<ProvidersCard');
  const helperCardAt = viewPlusHelper.indexOf('<div className="glass-card" data-tour="helper-models"');
  assert.ok(mountAt >= 0, 'the view mounts <ProvidersCard');
  if (view.includes(bannerCopy)) {
    const banner = view.indexOf(bannerCopy);
    assert.ok(mountAt > banner && helperCardAt > mountAt,
      'the mount sits after the vault-locked banner and before the Helper Models card (baseline card order preserved)');
  } else {
    assert.ok(banners.includes(bannerCopy), 'the vault-locked banner renders banners-module-side (post-T11)');
    const bannersMount = view.indexOf('<StatusBanners');
    assert.ok(bannersMount >= 0 && mountAt > bannersMount && helperCardAt > mountAt,
      'the mount sits after the banners module and before the Helper Models card (baseline card order preserved)');
  }
  for (const name of ['providers', 'setProviders', 'persistProviders', 'providerDraft', 'setProviderDraft', 'providerTest', 'setProviderTest', 'providerModelErrors', 'providerRefreshing', 'refreshProviderModels', 'handleProviderTest', 'openProviderDraft', 'deleteProvider', 'saveProviderDraft', 'cpFromDraft', 'protectVault', 'setVaultPassphraseSet', 'setVaultLocked', 'vaultLocked', 'vaultPassphraseSet', 'addToast', 'askChoice', 'askConfirm', 'askInput', 'useDemoMode', 'setDemoMode', 'collapsedSettings']) {
    assert.ok(view.includes(`${name}={${name}}`), `the mount wires ${name}={${name}} (bare, referentially stable)`);
  }
  assert.equal(countIn(view, '<ProvidersCard'), 1, 'the card is composed exactly once');
});

test('The five remaining cards mount SettingsCardHeader directly with their exact identity', () => {
  // The cors header mount resolves across the view ∪ proxy-card set;
  // account-data across the account set. The helper-models header mount
  // resolves across the view ∪ helper-card set (either home may own it).
  const HEADER_MOUNTS = [
    ['atlas', '<Layers size={18} color="var(--color-primary)" />', 'MITRE ATLAS Framework Database'],
    ['help', '<HelpCircle size={18} color="var(--color-primary)" />', 'Help & Onboarding']
  ];
  // The atlas/help header mounts resolve against whichever file owns the card.
  const HEADER_BODY = {
    'helper-models': view,
    atlas: atlasCardT12 || view,
    cors: view,
    'account-data': view,
    help: helpCardT12 || view
  };
  for (const [key, icon, title] of HEADER_MOUNTS) {
    ordered(HEADER_BODY[key], `view.${key} header mount`, [
      '<SettingsCardHeader',
      `settingKey="${key}"`,
      icon,
      `title={'${title}'}`
    ]);
  }
  ordered(viewPlusHelper, 'helper-models header mount (view ∪ helper card)', [
    '<SettingsCardHeader',
    'settingKey="helper-models"',
    '<Cpu size={18} color="var(--color-primary)" />',
    "title={'Helper Models'}"
  ]);
  // The card headers keep their identity but resolve across their own
  // view ∪ card file sets.
  for (const [key, icon, title, surface] of [
    ['cors', '<Globe size={18} color="var(--color-primary)" />', 'Proxy Configuration', viewPlusProxy],
    ['account-data', '<UserCog size={18} color="var(--color-secondary)" />', 'Account & Data', viewPlusAccount]
  ]) {
    ordered(surface, `${key} header mount (view ∪ card)`, [
      '<SettingsCardHeader',
      `settingKey="${key}"`,
      icon,
      `title={'${title}'}`
    ]);
  }
  // Header call-site parity: each of the six keys resolves to exactly one
  // header mount across its view ∪ card file set (providers card-side, cors
  // across the proxy set, account-data across the account set, helper-models
  // across the helper-card set, the rest view-side) — no card loses or
  // duplicates its header.
  for (const [key, surface] of [['providers', cardUnion], ['cors', viewPlusProxy], ['account-data', viewPlusAccount], ['helper-models', viewPlusHelper], ...HEADER_MOUNTS.map(([k]) => [k, cardUnion])]) {
    assert.equal(countIn(surface, `settingKey="${key}"`), 1, `the ${key} header resolves exactly once across its view ∪ card set`);
  }
  // The atlas/help header mounts may live in AtlasSyncCard.jsx/HelpCard.jsx —
  // the five non-providers mounts resolve across the wider union
  // (view ∪ atlas ∪ help).
  assert.equal(countIn(view, '<SettingsCardHeader') + countIn(proxyCard, '<SettingsCardHeader') + countIn(accountCard, '<SettingsCardHeader') + countIn(helperCard, '<SettingsCardHeader') + countIn(atlasCardT12, '<SettingsCardHeader') + countIn(helpCardT12, '<SettingsCardHeader'), 5,
    'the five remaining cards keep their shared-header mounts across view ∪ proxy-card ∪ account-card ∪ helper-card ∪ atlas ∪ help');
  assert.equal(countIn(card, '<SettingsCardHeader'), 1, 'the card mounts the shared header exactly once');
});

test('The collapse flow still runs end-to-end through SettingsContext', () => {
  // The component toggles through useSettings; the context persists + guards.
  assert.ok(settingsCtx.includes("localStorage.getItem('atlas_settings_collapsed'"), 'SettingsContext still reads atlas_settings_collapsed');
  assert.ok(settingsCtx.includes("localStorage.setItem('atlas_settings_collapsed', JSON.stringify(next));"), 'SettingsContext still persists the collapse state');
  assert.ok(settingsCtx.includes("if (key === 'providers' && providerDraft) return;"), 'the Providers card still never collapses while a draft is open');
  // The card keeps gating its gap and body on the providers collapse flag (via
  // the collapsedSettings prop — exact needles).
  assert.ok(card.includes("gap: collapsedSettings['providers'] ? '0' : '16px'"), 'the Providers card still collapses its gap');
  assert.ok(card.includes("!collapsedSettings['providers'] && ("), 'the Providers card body is still gated on collapse state');
  // The Helper Models gates resolve across the view ∪ helper card.
  assert.ok(viewOrHelper("gap: collapsedSettings['helper-models'] ? '0' : '16px'"), 'the Helper Models card still collapses its gap');
  assert.ok(viewOrHelper("!collapsedSettings['helper-models'] && ("), 'the Helper Models card body is still gated on collapse state');
  // The five remaining cards keep their collapse gates across their own
  // view ∪ card file set.
  // The atlas/help gates may live in AtlasSyncCard.jsx/HelpCard.jsx — they
  // resolve across the view ∪ atlas/help union (exactly twice per card).
  for (const key of ['atlas', 'help']) {
    assert.equal(countIn(view + '\n' + atlasCardT12 + '\n' + helpCardT12, `collapsedSettings['${key}']`), 2, `the ${key} card still gates its gap and body on collapsedSettings twice`);
  }
  for (const [key, flux] of [['cors', viewPlusProxy], ['account-data', viewPlusAccount]]) {
    assert.equal(countIn(flux, `collapsedSettings['${key}']`), 2, `the ${key} card still gates its gap and body on collapsedSettings twice (view ∪ card)`);
  }
  // The tour config still targets the card anchors.
  assert.ok(app.includes("'[data-tour=\"credentials-panel\"]'") || readIfExists('src/utils/tour-steps.js').includes("'[data-tour=\"credentials-panel\"]'"),
    'the tour still targets the credentials-panel anchor (App-side pre-T10, src/utils/tour-steps.js after)');
});

// ---------------------------------------------------------------------------
// App shed + single-definition + net-smaller gates
// ---------------------------------------------------------------------------

test('App sheds the render-prop definition and its wiring; the definition lives exactly once module-side', () => {
  assert.equal(countIn(app, 'const settingsCardHeader ='), 0, 'App no longer defines settingsCardHeader');
  assert.equal(countIn(app, 'settingsCardHeader={settingsCardHeader}'), 0, 'App no longer wires the render-prop into the view');
  assert.equal(countIn(header, 'export function SettingsCardHeader('), 1, 'the header is defined exactly once module-side');
  assert.equal(countIn(card + '\n' + view, 'const settingsCardHeader ='), 0, 'no render-prop reimplementation creeps back');
});

test('App.jsx and SettingsView.jsx are both strictly net-smaller (baselines 1810 / 1122 at 3601d86)', () => {
  const appLines = lineCount(app);
  const viewLines = lineCount(view);
  assert.ok(appLines < 1810, `App.jsx must shed the render-prop + wiring (baseline 1810); got ${appLines}`);
  assert.ok(viewLines < 1122, `SettingsView.jsx must shed the moved card (baseline 1122); got ${viewLines}`);
  assert.ok(lineCount(card) > 400, `ProvidersCard.jsx carries the moved surface (handlers + form + card JSX); got ${lineCount(card)}`);
});

// ---------------------------------------------------------------------------
// DOM byte-compatibility — every needle survives exactly once across the
// view ∪ card ∪ header file set
// ---------------------------------------------------------------------------

test('Every moved JSX fragment survives exactly once across the union (byte-compatible DOM)', () => {
  const MOVED_NEEDLES = [
    'data-tour="credentials-panel"',
    'data-testid="providers-plaintext-badge"',
    '<AlertTriangle size={12} /> Unencrypted keys',
    'Connect the model hosts you want to use — as comparison targets, the AI Judge, or the Test Generator.',
    'Your API keys and providers are <b>locked</b> (encrypted vault) and are not shown here. Unlock them in',
    'data-testid={`provider-row-${cp.id}`}',
    'Imported, review before enabling',
    '{cp.connector === \'raw\' ? \'RAW\' : \'OpenAI-compatible\'}',
    'HTTP — credentials sent unencrypted',
    'data-testid={`provider-enable-${cp.id}`}',
    'data-tip="Refresh models"',
    'data-tip="Edit"',
    'data-tip="Delete"',
    'data-tour="sandbox-config"',
    'data-tour="sandbox-toggle"',
    '<h3 style={{ fontSize: \'1.15rem\', fontWeight: 800 }}>Sandbox Configuration</h3>',
    'Active Sandbox Mode',
    'data-testid="provider-allow-insecure-transport"',
    'This endpoint uses plaintext <code>http://</code> to a remote host',
    "{vaultLocked ? 'Providers are locked — unlock them in the Key Vault below.' : 'No providers configured yet. Use \"Add Provider\" to connect one.'}",
    '<Plus size={14} /> Add Provider'
  ];
  for (const needle of MOVED_NEEDLES) {
    assert.equal(countIn(cardUnion, needle), 1, `the moved fragment renders exactly once across the view ∪ card: ${needle.slice(0, 60)}`);
  }
  // The Helper Models surface may live in HelperModelsCard.jsx — the markers
  // resolve exactly once across the view ∪ helper-card set (CODE tokens;
  // comments stripped so docblock wording cannot skew the count), and the
  // providers card still absorbs none of them.
  const helperCodeUnion = (view + '\n' + helperCard).split('\n')
    .filter((l) => { const t = l.trim(); return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')); })
    .join('\n');
  for (const marker of ['data-tour="helper-models"', 'data-tour="judge-config"', 'data-tour="gen-config"', 'AI Judge Model', 'Test Generator Model', 'Choose which model drafts new attack payloads in "AI Test Generation".']) {
    assert.equal(countIn(helperCodeUnion, marker), 1, `the Helper Models surface renders exactly once across the view ∪ helper card: ${marker}`);
    assert.equal(countIn(card, marker), 0, `the providers card does not absorb Helper Models content: ${marker}`);
  }
});
