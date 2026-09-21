// Contract: the provider/helper-model surface of the
// `{activeTab === 'settings' && (…)}` JSX region of src/App.jsx — the
// "Needs attention" + vault-locked banners, the Providers card (provider
// rows, the provider draft form, model fetch/refresh flows, the Sandbox
// Configuration card) and the Helper Models card (AI Judge + Test Generator
// selection) — renders from src/components/views/SettingsView.jsx consuming
// useProviders()/useSettings()/useUI() directly, while the App-owned
// orchestration (buildJudge + the connectivity-test block, setDemoMode and
// the vault-locked redirect) stays in src/App.jsx and is wired into the view.
// The view also carries the platform cards (ATLAS sync, proxy, Account &
// Data, Help); the provider/helper/banner cards render ahead of them.
//
// Union tolerance: the settings banners may render from
// src/components/views/settings/StatusBanners.jsx and the ATLAS sync + Help &
// Onboarding cards from src/components/views/settings/AtlasSyncCard.jsx and
// src/components/views/settings/HelpCard.jsx. The pins those surfaces carry
// resolve across the App ∪ view ∪ banners ∪ atlas-card ∪ help-card file set,
// so the same guarantees hold whether each body renders from its module or
// inline.
//
// The Providers card may render from
// src/components/views/settings/ProvidersCard.jsx (props-in/events-out), and
// the shared settingsCardHeader render-prop may render from the component
// src/components/views/settings/SettingsCardHeader.jsx. The pins those
// surfaces carry resolve across the App ∪ view ∪ providers-card ∪ header file
// set, so the same guarantees hold either way. The view keeps destructuring
// every forwarded context name (the props-in wiring forwards them), so the
// context-consumption pins below are unchanged.
//
// Source-text level because Node cannot import JSX/extensionless specifiers
// under bare node:test (repo convention: see the sibling hook suites,
// tests/audit-engine.contract.test.mjs, tests/tests-view.contract.test.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP_PATH = 'src/App.jsx';
const VIEW_PATH = 'src/components/views/SettingsView.jsx';
const SYNC_HOOK_PATH = 'src/hooks/useProviderModelSync.js';
// The Providers card may render from this module (absent when inline; the
// pins below resolve across the App ∪ view ∪ card file set either way).
const CARD_PATH = 'src/components/views/settings/ProvidersCard.jsx';
// The shared card header may render as this component (absent when inline).
const HEADER_PATH = 'src/components/views/settings/SettingsCardHeader.jsx';
// The Proxy Configuration card may render from this file.
const PROXY_CARD_PATH = 'src/components/views/settings/ProxyCard.jsx';
// The Account & Data card may render from this file.
const ACCOUNT_CARD_PATH = 'src/components/views/settings/AccountDataCard.jsx';
// The Helper Models card may render from this file (absent when inline; the
// helper pins below resolve across the view ∪ helper-card file set either
// way).
const HELPER_CARD_PATH = 'src/components/views/settings/HelperModelsCard.jsx';
// The "Needs attention" + vault-locked banners may render from the
// StatusBanners component and the two Sandbox warning strings from the
// buildSettingsWarnings util (both absent when inline; the banner-copy pins
// below resolve across the App ∪ view ∪ banners ∪ warnings-util file set
// either way).
const BANNERS_PATH = 'src/components/views/settings/StatusBanners.jsx';
const WARNINGS_UTIL_PATH = 'src/utils/settings-warnings.js';

const ATLAS_CARD_PATH = 'src/components/views/settings/AtlasSyncCard.jsx';
const HELP_CARD_PATH = 'src/components/views/settings/HelpCard.jsx';

const readSource = (relPath) => readFileSync(join(root, relPath), 'utf8').replace(/\r\n/g, '\n');
const readIfExists = (relPath) => { try { return readSource(relPath); } catch { return ''; } };

let app = '', view = '', settingsCtx = '', providersCtx = '', syncHook = '', tour = '';
let providersCard = '', cardHeader = '', proxyCard = '', accountCard = '', banners = '', warningsUtil = '', helperCard = '';
try {
  app = readSource(APP_PATH);
  view = readSource(VIEW_PATH);
  settingsCtx = readSource('src/context/SettingsContext.jsx');
  providersCtx = readSource('src/context/ProvidersContext.jsx');
  syncHook = readSource(SYNC_HOOK_PATH);
  // The guided-tour step definitions may live in the pure factory module
  // src/utils/tour-steps.js; when the file is absent `tour` stays ''.
  tour = readSource('src/utils/tour-steps.js');
} catch { /* missing files fail their first assertion */ }
if (existsSync(join(root, CARD_PATH))) providersCard = readSource(CARD_PATH);
if (existsSync(join(root, HEADER_PATH))) cardHeader = readSource(HEADER_PATH);
// ProxyCard.jsx may be absent when the cors card renders inline (proxyCard
// stays '') ; the cors pins resolve across the view ∪ proxy-card file set
// either way.
if (existsSync(join(root, PROXY_CARD_PATH))) proxyCard = readSource(PROXY_CARD_PATH);
// AccountDataCard.jsx may be absent when the account card renders inline; the
// account pins resolve across that set.
if (existsSync(join(root, ACCOUNT_CARD_PATH))) accountCard = readSource(ACCOUNT_CARD_PATH);
// HelperModelsCard.jsx may be absent when the card renders inline (helperCard
// stays ''); the helper pins resolve across the view ∪ helper-card file set
// either way.
if (existsSync(join(root, HELPER_CARD_PATH))) helperCard = readSource(HELPER_CARD_PATH);
// The ATLAS sync + Help & Onboarding cards may render from these files (absent
// when inline; the atlas/help pins resolve across the view ∪ cards union
// either way).
const atlasCard = existsSync(join(root, ATLAS_CARD_PATH)) ? readSource(ATLAS_CARD_PATH) : '';
const helpCard = existsSync(join(root, HELP_CARD_PATH)) ? readSource(HELP_CARD_PATH) : '';

// The proxy/account card surfaces resolve across their own view ∪ card file
// sets (inline in the view or in the card module).
const viewOrProxy = (needle) => view.includes(needle) || proxyCard.includes(needle);
const viewOrAccount = (needle) => view.includes(needle) || accountCard.includes(needle);
// The banners component + warnings util may be absent when the banner copies
// stay view-side and the pins resolve over the view-only set; otherwise they
// resolve across the App ∪ view ∪ banners ∪ warnings-util union either way.
if (existsSync(join(root, BANNERS_PATH))) banners = readSource(BANNERS_PATH);
if (existsSync(join(root, WARNINGS_UTIL_PATH))) warningsUtil = readSource(WARNINGS_UTIL_PATH);

const norm = (text) => text.replace(/\s+/g, ' ').trim();
const countIn = (source, needle) => source.split(needle).length - 1;
const pair = app + '\n' + view;
// The banner surface resolves across the view ∪ banners ∪ warnings-util file
// set (inline in the view, or component + util).
const bannerUnion = pair + '\n' + banners + '\n' + warningsUtil;
// The provider/model sync surface lives in
// src/hooks/useProviderModelSync.js — those names must stay defined exactly
// once across App + view + hook (no duplication).
const triple = pair + '\n' + syncHook;
// The providers card surface resolves across the view ∪ card file set (inline
// in the view or in the card module).
const viewPlusCard = view + '\n' + providersCard;
const viewOrCard = (needle) => view.includes(needle) || providersCard.includes(needle);
const pairPlusCard = pair + '\n' + providersCard;
// The Helper Models surface resolves across the view ∪ helper-card file set
// (inline in the view or in the card module).
const viewPlusHelper = view + '\n' + helperCard;
const viewOrHelper = (needle) => view.includes(needle) || helperCard.includes(needle);
// The atlas/help card surfaces resolve across the view ∪ cards set.
const viewPlusCards = view + '\n' + atlasCard + '\n' + helpCard;
const viewOrCards = (needle) => view.includes(needle) || atlasCard.includes(needle) || helpCard.includes(needle);

// App-side tour copy resolves across App.jsx ∪ src/utils/tour-steps.js (the
// factory module may own it, or the file may be absent).
const appTour = app + '\n' + tour;
const lineCount = (source) => source.replace(/\n+$/, '').split('\n').length;

// Tour-config selector strings ('[data-tour="…"]') stay App-side on purpose —
// strip them before checking which data-tour ANCHORS still live in App.
const appNoTourSelectors = app.replace(/\[data-tour="[^"]+"\]/g, '');

// The <SettingsView … /> wiring block inside App.jsx (from the opening tag to
// the first self-closing `/>`), which proves App passes its App-owned
// helpers/derivations down to the view.
function wiringBlock() {
  const start = app.indexOf('<SettingsView');
  assert.ok(start >= 0, 'App.jsx mounts <SettingsView … />');
  // App mount blocks can nest self-closing component mounts — the outer close
  // is the `/>` at the mount tag's own indentation level.
  const tagIndent = /^[\t ]*/.exec(app.slice(app.lastIndexOf('\n', start) + 1))[0];
  const end = app.indexOf(`\n${tagIndent}/>`, start);
  assert.ok(end > start, 'the mount closes at its own indentation level');
  return app.slice(start, end + `\n${tagIndent}/>`.length);
}
// A name reaches the view either through App's wiring block or through a local
// definition inside the view component (2-space component-body indent).
const reachesView = (name) => {
  if (new RegExp(`^  const ${name} = `, 'm').test(view)) return 'local';
  if (wiringBlock().includes(name)) return 'wired';
  return null;
};

// Extracts a component-level handler (2-space indent): from its declaration
// line to the handler-closing line (`  };`, `  });`, `  );` or a useCallback
// dependency-array close), so trailing comments are excluded.
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

// The card-local handlers resolve from whichever file owns them — the view or
// ProvidersCard.jsx.
const wrapperSource = () => (new RegExp('^  const handleSaveProviderWrapper = ', 'm').test(view) ? view : providersCard);

// ---------------------------------------------------------------------------
// The view is real, mounted, context-consuming; the region left App.jsx
// ---------------------------------------------------------------------------

test('SettingsView.jsx is the real view — named + default export, all cards, placeholder gone', () => {
  assert.match(view, /export function SettingsView\(/, 'SettingsView is exported');
  assert.match(view, /export default SettingsView;/, 'the default export stays for direct App composition');
  // The provider/helper/banner cards and the platform cards live in the same
  // view file. The markers ProvidersCard.jsx owns resolve across the view ∪
  // card file set (identical guarantee both trees).
  for (const marker of [
    'data-tour="credentials-panel"',
    'data-testid="providers-plaintext-badge"',
    'Connect the model hosts you want to use',
    'Add Provider',
    'data-tour="sandbox-config"',
    'data-tour="sandbox-toggle"',
    'Sandbox Configuration'
  ]) {
    assert.ok(viewOrCard(marker), `the view (or the extracted providers card) renders ${marker}`);
  }
  // The markers the Helper Models card owns resolve across the view ∪
  // helper-card file set (identical guarantee both trees).
  for (const marker of [
    'data-tour="helper-models"',
    'data-tour="judge-config"',
    'data-tour="gen-config"',
    'AI Judge Model',
    'Test Generator Model'
  ]) {
    assert.ok(viewOrHelper(marker), `the view (or the extracted helper card) renders ${marker}`);
    // Count pins measure CODE tokens (comments stripped) so docblock wording
    // cannot skew the exactly-once guarantee (repo convention:
    // tests/model-selector.contract.test.mjs).
    const codeUnion = (view + '\n' + helperCard).split('\n')
      .filter((l) => { const t = l.trim(); return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')); })
      .join('\n');
    assert.equal(countIn(codeUnion, marker), 1, `${marker} renders exactly once across the view ∪ helper card`);
  }
  // The atlas/help anchors resolve across the view ∪ cards set — exactly once
  // across the union either way (inline in the view, or
  // AtlasSyncCard.jsx/HelpCard.jsx).
  for (const marker of ['data-tour="atlas-sync-settings"', 'data-tour="help-onboarding"']) {
    assert.ok(viewOrCards(marker), `the view (or the extracted card) renders ${marker}`);
    assert.equal(countIn(viewPlusCards, marker), 1, `${marker} renders exactly once across the view ∪ cards`);
  }
  for (const marker of [
    'data-tour="cors-card"',
    'data-tour="account-data"'
  ]) {
    assert.ok(view.includes(marker) || proxyCard.includes(marker) || accountCard.includes(marker), `${marker} renders view-side (or card-side after its split)`);
  }
  assert.ok(!view.includes('Settings view - Configure providers, models, and application settings'), 'the stub placeholder text is gone');
  assert.doesNotMatch(view, /if \(activeTab !== 'settings'\) return null;/, 'the stub\u2019s activeTab early-return is gone — App\u2019s conditional governs mounting');
  assert.ok(lineCount(view + '\n' + providersCard) > 700, `the view (plus the extracted providers card) carries the moved region on top of the T15 cards; got ${lineCount(view + '\n' + providersCard)}`);
});

test('App mounts <SettingsView and the provider/helper-model markers leave App.jsx', () => {
  const wire = wiringBlock();
  assert.ok(wire.length > 10, 'the mount is wired with props');
  // settingsCardHeader is not in the pinned props list — App does not wire the
  // render-prop (the view mounts SettingsCardHeader directly; pinned in
  // tests/providers-card.contract.test.mjs).
  for (const name of ['buildJudge', 'testJudge', 'testGenerator', 'testingJudge', 'testingGen', 'setDemoMode', 'helperProviderSelectable', 'selectedJudgeProvider', 'judgeModelList']) {
    assert.ok(wire.includes(name), `App wires ${name} into the view (${reachesView(name) ?? 'MISSING'})`);
  }
  // The gen selector resolves from either side of the component move — App
  // wires the renderGenSelector helper, or the view imports GenModelSelector
  // and App wires the gen sync derivations instead.
  if (!wire.includes('renderGenSelector')) {
    assert.ok(wire.includes('selectedGenProvider={selectedGenProvider}') && wire.includes('genModelList={genModelList}'),
      'post-T08 App wires the gen sync derivations into the view (the view imports GenModelSelector)');
  }
  for (const marker of [
    'data-tour="credentials-panel"',
    'data-tour="sandbox-config"',
    'data-tour="sandbox-toggle"',
    'data-tour="helper-models"',
    'data-tour="judge-config"',
    'data-tour="gen-config"',
    'data-testid="providers-plaintext-badge"',
    'data-testid={`provider-row-${cp.id}`}',
    "settingsCardHeader('providers'",
    "settingsCardHeader('helper-models'",
    'PROVIDER_PRESETS.map',
    'const providerForm',
    'enableImportedProvider'
  ]) {
    assert.ok(!appNoTourSelectors.includes(marker), `region marker left App.jsx: ${marker}`);
  }
  // App still owns the settings tab shell; the platform cards stay view-local
  // (they must not leak back into App.jsx).
  assert.ok(app.includes("{activeTab === 'settings' && ("), 'the settings conditional stays in App');
  // The extracted-card anchors resolve across their own view ∪ card file set;
  // App-side the platform cards always stay 0.
  for (const marker of ['data-tour="atlas-sync-settings"', 'data-tour="help-onboarding"']) {
    assert.ok(viewOrCards(marker), `the view (or the extracted card) renders ${marker}`);
    assert.ok(!appNoTourSelectors.includes(marker), `the T15 platform card stays view-local: ${marker}`);
  }
  for (const [anchor, resolves] of [['cors-card', viewOrProxy], ['account-data', viewOrAccount]]) {
    assert.ok(resolves(`data-tour="${anchor}"`), `${anchor} renders across its view ∪ card set`);
    assert.ok(!appNoTourSelectors.includes(anchor), `the T15 platform card stays view-local: ${anchor}`);
  }
});

test('The view consumes useProviders(), useSettings() and useUI() directly', () => {
  assert.match(view, /useProviders\(\)/, 'the view calls useProviders() itself');
  assert.match(view, /useSettings\(\)/, 'the view calls useSettings() itself');
  assert.match(view, /useUI\(\)/, 'the view calls useUI() itself');
  const providersNames = ['providers', 'providerDraft', 'setProviderDraft', 'providerTest', 'setProviderTest', 'providerModelErrors', 'providerRefreshing', 'refreshProviderModels', 'handleProviderTest', 'openProviderDraft', 'deleteProvider', 'saveProviderDraft', 'cpFromDraft', 'vaultLocked', 'vaultPassphraseSet'];
  const viewProviders = /const \{([\s\S]*?)\n  \} = useProviders\(\);/.exec(view) || /const \{([\s\S]*?)\} = useProviders\(\);/.exec(view);
  assert.ok(viewProviders, 'the view destructures useProviders()');
  for (const name of providersNames) {
    assert.match(viewProviders[1], new RegExp(`\\b${name}\\b`), `the view consumes ProvidersContext\u2019s ${name}`);
  }
  const settingsNames = ['useDemoMode', 'collapsedSettings', 'judgeConfig', 'saveJudgeConfig', 'effectiveGenConfig'];
  const viewSettings = /const \{([\s\S]*?)\n  \} = useSettings\(\);/.exec(view) || /const \{([\s\S]*?)\} = useSettings\(\);/.exec(view);
  assert.ok(viewSettings, 'the view destructures useSettings()');
  for (const name of settingsNames) {
    assert.match(viewSettings[1], new RegExp(`\\b${name}\\b`), `the view consumes SettingsContext\u2019s ${name}`);
  }
  const viewUI = /const \{([\s\S]*?)\n  \} = useUI\(\);/.exec(view) || /const \{([\s\S]*?)\} = useUI\(\);/.exec(view);
  assert.ok(viewUI, 'the view destructures useUI()');
  for (const name of ['addToast', 'askChoice', 'askInput', 'setActiveTab']) {
    assert.match(viewUI[1], new RegExp(`\\b${name}\\b`), `the view consumes UIContext\u2019s ${name}`);
  }
  // setActiveTab matters at RUNTIME, not just lint: the help card's tour-exit
  // handler calls it (the view binding stays for the help card).
  assert.match(viewUI[1], /\bsetActiveTab\b/, 'the view destructure pins setActiveTab (the help card\u2019s tour-exit handler calls it)');
  assert.doesNotMatch(view, /import .*App/, 'the view never imports App — everything arrives via contexts and props');
});

test('Definition ownership — the form flow is view-local; the shared engine block stays App-local and is wired', () => {
  // The card-local handler resolves from either side of the move — view-local
  // or ProvidersCard.jsx-local — exactly one definition across the pair, zero
  // in App.
  for (const name of ['handleSaveProviderWrapper']) {
    assert.equal(countIn(viewPlusCard, `const ${name} =`), 1, `${name} is defined exactly once across the view ∪ providers card`);
    assert.equal(countIn(app, `const ${name} =`), 0, `${name} left App.jsx`);
  }
  assert.equal(countIn(viewPlusCard, 'const providerForm'), 1, 'the provider draft form moved once (view pre-T09, card post-T09)');
  assert.equal(countIn(app, 'const providerForm'), 0, 'the provider draft form left App.jsx');
  for (const name of ['buildJudge', 'pingModel']) {
    assert.equal(countIn(pair, `const ${name} =`), 0, `${name} has no local definition across App + view (it moved to src/utils/judge-config.js with T02)`);
  }
  // The judge-config import may or may not include pingModel (its only
  // consumers live in the model-ping hook) — the import pin tolerates both
  // shapes.
  assert.ok(/^import \{ buildJudge(, pingModel)? \} from '\.\/utils\/judge-config';$/m.test(app), 'App imports the extracted judge helpers (the shared engine block stays wired)');
  // settingsCardHeader resolves from either side of the component move — an
  // App-local render-prop, or SettingsCardHeader.jsx — still exactly one
  // definition, zero duplication.
  assert.equal(countIn(pair, 'const settingsCardHeader =') + countIn(cardHeader, 'export function SettingsCardHeader('), 1,
    'the shared card header keeps exactly one definition (App render-prop pre-T09, component post-T09)');
  // testJudge/testGenerator live in src/hooks/useModelPingTests.js — one
  // definition across App ∪ model-ping hook; setDemoMode stays App-defined.
  const modelPingHook = readIfExists('src/hooks/useModelPingTests.js');
  for (const name of ['testJudge', 'testGenerator']) {
    assert.equal(countIn(`${app}\n${modelPingHook}`, `const ${name} =`), 1, `${name} keeps exactly one definition across App + model-ping hook (no duplication)`);
  }
  for (const name of ['setDemoMode']) {
    assert.equal(countIn(pair, `const ${name} =`), 1, `${name} keeps exactly one definition across App + view (no duplication)`);
    assert.ok(countIn(app, `const ${name} =`) === 1, `${name} stays App-defined (shared with the runner/AI-gen/platform-card regions)`);
  }
  // The selector helpers resolve from either side of the component move —
  // App-local render helpers, or components defined exactly once in their own
  // files.
  const genComponent = readIfExists('src/components/GenModelSelector.jsx');
  const judgeComponent = readIfExists('src/components/JudgeModelSelector.jsx');
  const chipComponent = readIfExists('src/components/ActiveModelChip.jsx');
  assert.equal(countIn(pair, 'const renderGenSelector =') + countIn(genComponent, 'export function GenModelSelector('), 1, 'the gen selector keeps exactly one definition (App render-prop pre-T08, component post-T08)');
  assert.equal(countIn(pair, 'const renderJudgeSelector =') + countIn(judgeComponent, 'export function JudgeModelSelector('), 1, 'the judge selector keeps exactly one definition (App render-prop pre-T08, component post-T08)');
  assert.equal(countIn(pair, 'const renderActiveModelChip =') + countIn(chipComponent, 'export function ActiveModelChip('), 1, 'the active-model chip keeps exactly one definition (App render-prop pre-T08, component post-T08)');
  // The sync surface is hook-owned — still exactly one definition, across App
  // + view + hook (App consumes it through the useProviderModelSync
  // destructure and keeps wiring it into the views).
  for (const name of ['helperProviderSelectable', 'providerSelectable', 'judgeModelList', 'genModelList', 'selectedJudgeProvider', 'selectedGenProvider']) {
    assert.equal(countIn(triple, `const ${name} =`), 1, `${name} keeps exactly one definition across App + view + sync hook (T09: hook-owned, no duplication)`);
  }
  // The busy states resolve from the App ∪ model-ping-hook union and stay
  // wired down into the view either way.
  assert.ok(
    (app.includes('const [testingJudge, setTestingJudge]') && app.includes('const [testingGen, setTestingGen]'))
    || (modelPingHook.includes('const [testingJudge, setTestingJudge]') && modelPingHook.includes('const [testingGen, setTestingGen]')),
    'the model-test busy states stay owned by the App ∪ model-ping-hook union and are wired down'
  );
});

test('The view renders the moved provider rows with their flows and vault gates', () => {
  // Every marker ProvidersCard.jsx owns resolves across the view ∪
  // providers-card file set.
  for (const marker of [
    'data-testid={`provider-row-${cp.id}`}',
    "{cp.connector === 'raw' ? 'RAW' : 'OpenAI-compatible'}",
    'Imported, review before enabling',
    'HTTP — credentials sent unencrypted',
    "onClick={() => enableImportedProvider(cp)}",
    'onClick={() => refreshProviderModels(cp)}',
    'onClick={() => testConnection(cp, cp.id)}',
    "onClick={() => openProviderDraft(cp)}",
    'onClick={() => confirmDeleteProvider(cp)}',
    'onClick={() => openProviderDraft()}',
    'disabled={vaultLocked && (vaultPassphraseSet ?? false)}',
    "cp.connector !== 'raw' && deriveModelsEndpoint(cp)"
  ]) {
    assert.ok(viewOrCard(marker), `the view\u2019s provider surface keeps ${marker}`);
  }
  // The judge provider picker may render with the Helper Models card.
  assert.ok(viewOrHelper('providers.filter(cp => cp.enabled !== false).map(cp => ('), 'the view keeps its provider-filtered picker surfaces (or the helper card does)');
  assert.equal(countIn(viewPlusHelper, 'providers.filter(cp => cp.enabled !== false).map(cp => ('), 1, 'the judge provider filter renders exactly once across the view ∪ helper card');
  assert.equal(countIn(pairPlusCard, 'data-testid={`provider-row-${cp.id}`}'), 1, 'provider rows render exactly once across the pair ∪ card');
  // The gen-config paragraph copy (with the "AI Test Generation" mention)
  // renders with the Helper Models card — exactly once across the pair ∪ helper
  // card, in the view.
  assert.ok(viewOrHelper('Choose which model drafts new attack payloads in "AI Test Generation".'), 'the gen-config paragraph moved into the view (or the helper card)');
  assert.equal(countIn(pair + '\n' + helperCard, 'AI Test Generation'), 1, 'the cross-region "AI Test Generation" literal stays unique (helper-card-local after the T08 split)');
});

// ---------------------------------------------------------------------------
// save-without-encryption flow, insecure transport, vault status
// ---------------------------------------------------------------------------

test('The save-without-encryption choice flow moved into the view intact', () => {
  // The handler resolves from either side of the move.
  const wrapper = bodyOf(wrapperSource(), 'handleSaveProviderWrapper');
  assert.ok(wrapper.includes('if (!vaultPassphraseSet && providerDraft.apiKey) {'), 'gate: unencrypted vault + API key in draft');
  assert.ok(wrapper.includes('Your vault is not encrypted. API keys will be stored in plaintext.'), 'choice dialog explains plaintext storage');
  assert.ok(wrapper.includes("cancelText: 'Cancel'"), 'choice: Cancel');
  assert.ok(wrapper.includes("secondaryText: 'Save anyway'"), 'choice: Save anyway');
  assert.ok(wrapper.includes("primaryText: 'Set up encryption'"), 'choice: Set up encryption');
  assert.ok(wrapper.includes("if (choice === 'cancel') return;"), 'cancel aborts the save');
  assert.ok(wrapper.includes('if (passphrase.length >= 12) {'), 'passphrase minimum length enforced');
  assert.ok(wrapper.includes('await protectVault(passphrase);'), 'vault is protected with the passphrase');
  assert.ok(wrapper.includes('setVaultPassphraseSet(true);'), 'vaultPassphraseSet flips true');
  assert.ok(wrapper.includes('setVaultLocked(false);'), 'vault ends unlocked');
  assert.ok(wrapper.includes("addToast('API keys are now encrypted at rest. You will be asked to unlock on each new session.');"), 'success toast is exact');
  assert.ok(wrapper.includes('await saveProviderDraft(e);'), 'the wrapper always ends in saveProviderDraft');
  // The context-owned save keeps its validation contract.
  assert.ok(providersCtx.includes("throw new Error('Provider name is required.');"), 'saveProviderDraft still validates the name');
  assert.ok(providersCtx.includes("throw new Error('A valid endpoint URL (http:// or https://) is required.');"), 'saveProviderDraft still validates the endpoint');
});

test('Insecure-transport and vault-status surfaces survive the move', () => {
  // The badge/draft surfaces resolve across the view ∪ card.
  assert.ok(viewOrCard('(vaultSupported() && !vaultPassphraseSet && !vaultLocked && providers.some(providerCarriesSecret))'), 'plaintext badge keeps its exact gating condition');
  assert.ok(viewOrCard('data-testid="providers-plaintext-badge"'), 'badge is testid-anchored');
  assert.ok(viewOrCard('This endpoint uses plaintext <code>http://</code> to a remote host'), 'draft-level insecure transport warning moved with the form');
  assert.ok(viewOrCard('data-testid="provider-allow-insecure-transport"'), 'insecure-transport opt-in checkbox moved with the form');
  // Vault-status banners may render view-side or from StatusBanners.jsx — but
  // exactly once across the App ∪ view ∪ banners union.
  assert.equal(countIn(bannerUnion, 'Your API keys are <b>locked</b> (encrypted vault)'), 1, 'the vault-locked banner renders exactly once');
  assert.equal(countIn(bannerUnion, 'Sandbox is ON and you have providers configured, but the AI Judge is not set to one of them'), 1, 'the judge warning renders exactly once');
  assert.equal(countIn(bannerUnion, 'the Test Generator model is not set to one of them'), 1, 'the generator warning renders exactly once');
  // The vault-locked redirect stays App-side and still covers the settings tab.
  assert.ok(app.includes("activeTab === 'runner' || activeTab === 'prompts' || activeTab === 'settings'"), 'the vault-locked redirect keeps covering the settings tab');
  assert.ok(app.includes("setActiveTab('dashboard');"), 'the redirect lands on the dashboard');
});

// ---------------------------------------------------------------------------
// collapse state from SettingsContext; tour anchors preserved
// ---------------------------------------------------------------------------

test('Card collapse still flows from SettingsContext; tour anchors preserved', () => {
  // The shared header resolves from either side of the component move — App
  // wires the render-prop, or the view mounts SettingsCardHeader, which
  // consumes the collapse state itself.
  if (reachesView('settingsCardHeader') === 'wired') {
    const header = bodyOf(app, 'settingsCardHeader');
    assert.ok(header.includes('onClick={() => toggleSettingsCard(key)}'), 'the header helper still toggles through SettingsContext');
    assert.ok(header.includes("collapsedSettings[key] ? 'Expand card' : 'Collapse card'"), 'the chevron title still mirrors collapse state');
  } else {
    assert.ok(cardHeader.includes('export function SettingsCardHeader('), 'post-T09 the shared header is the SettingsCardHeader component');
    assert.match(cardHeader, /const \{[^}]*\btoggleSettingsCard\b[^}]*\} = useSettings\(\);/, 'the component consumes the collapse toggle from SettingsContext itself');
    assert.ok(cardHeader.includes('onClick={() => toggleSettingsCard(settingKey)}'), 'the component still toggles through SettingsContext');
    assert.ok(cardHeader.includes("collapsedSettings[settingKey] ? 'Expand card' : 'Collapse card'"), 'the chevron title still mirrors collapse state');
  }
  // The providers-card gates resolve across the view ∪ card.
  assert.ok(viewOrCard("gap: collapsedSettings['providers'] ? '0' : '16px'"), 'the Providers card still collapses its gap');
  assert.ok(viewOrCard("!collapsedSettings['providers'] && ("), 'the Providers card body is still gated on collapse state');
  // The Helper Models gates resolve across the view ∪ helper card.
  assert.ok(viewOrHelper("gap: collapsedSettings['helper-models'] ? '0' : '16px'"), 'the Helper Models card still collapses its gap');
  assert.ok(viewOrHelper("!collapsedSettings['helper-models'] && ("), 'the Helper Models card body is still gated on collapse state');
  assert.ok(settingsCtx.includes("localStorage.setItem('atlas_settings_collapsed', JSON.stringify(next));"), 'SettingsContext still persists the collapse state');
  assert.ok(settingsCtx.includes("if (key === 'providers' && providerDraft) return;"), 'the Providers card still never collapses while a draft is open');
  // The App-owned tour config still targets the extracted-card anchors.
  for (const target of ['credentials-panel', 'judge-config', 'sandbox-config']) {
    assert.ok(appTour.includes(`'[data-tour="${target}"]'`), `the tour still targets ${target} (App-side pre-T10, src/utils/tour-steps.js after)`);
  }
});

// ---------------------------------------------------------------------------
// App.jsx loses the region; the wiring and the latent bug are resolved
// ---------------------------------------------------------------------------

test('App.jsx loses the provider/helper-model JSX region (shrink gate)', () => {
  const appLines = lineCount(app);
  const viewLines = lineCount(view);
  assert.ok(appLines < 4100, `App.jsx must shed the moved region (baseline 4441); got ${appLines}`);
  // The ProvidersCard module counts toward the union gate — the view (plus its
  // card module) still carries the region.
  assert.ok(lineCount(viewPlusCard) > 800, `the view (plus the extracted providers card) must carry the moved region on top of the T15 cards; got ${lineCount(viewPlusCard)}`);
  assert.ok(viewLines > 0, 'the view stays readable');
});

test('The sandbox persistence, the judge pickers and the latent Enable-reference survive the move honestly', () => {
  assert.ok(pair.includes("localStorage.setItem('atlas_demo_mode', String(v));"), 'the sandbox toggle still persists atlas_demo_mode');
  assert.ok(pair.includes('setUseDemoMode(v);'), 'the sandbox toggle still updates the SettingsContext flag');
  // The sandbox checkbox binding resolves across the view ∪ card.
  assert.ok(viewOrCard('checked={useDemoMode}'), 'the sandbox checkbox still reads useDemoMode');
  assert.ok(viewOrCard('onChange={(e) => setDemoMode(e.target.checked)}'), 'the sandbox checkbox still writes through the wired setDemoMode');
  // The judge pickers keep their exact save-handler wiring — the three
  // helper-models bindings render with the Helper Models card (App keeps its
  // other three).
  assert.ok(viewOrHelper("onChange={(e) => saveJudgeConfig({ provider: e.target.value, model: '' })}"), 'the judge provider picker binding moved with the card');
  const judgeComponent = readIfExists('src/components/JudgeModelSelector.jsx');
  assert.equal(countIn(pair + '\n' + helperCard, "onChange={(e) => saveJudgeConfig({ ...judgeConfig, model: e.target.value })}") + countIn(judgeComponent, "onChange={(e) => saveJudgeConfig({ ...judgeConfig, model: e.target.value })}"), 6, 'all six judge model pickers survive across the pair ∪ helper card + the shared judge component (T08: three helper-card-side + three component-side post-move)');
  // Guards against the latent ReferenceError: `enableImportedProvider` was
  // referenced but defined nowhere. The identifier must resolve — defined once
  // — while keeping the button and its testid.
  // The definition + reference resolve across the union file set (view-side or
  // ProvidersCard.jsx-side).
  assert.equal(countIn(pairPlusCard, 'enableImportedProvider'), 2, 'enableImportedProvider is now defined (1 definition + 1 reference, no more)');
  assert.ok(viewOrCard('data-testid={`provider-enable-${cp.id}`}'), 'the Enable button survives with its testid');
});
