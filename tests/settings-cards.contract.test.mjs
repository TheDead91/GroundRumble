// Contract: the two small platform cards of
// src/components/views/SettingsView.jsx — the MITRE ATLAS sync card and the
// Help & Onboarding card — render from the props-in/events-out modules
// src/components/views/settings/AtlasSyncCard.jsx and
// src/components/views/settings/HelpCard.jsx, while SettingsView composes
// them (verbatim bodies, card order preserved) and keeps the context-owned
// handler bodies for the help card wired in as props.
//
// The pins read across a union of possible homes: a card's markup may be
// view-side or module-side, and the account-data anchor is spliced into the
// union at its DOM position so every index comparison and ordered walk keeps
// its exact meaning whether or not the module exists. The tolerant reads
// degrade to the view alone when a collaborator module is absent.
//
// The companion port suites
// (tests/settings-platform-cards.contract.test.mjs,
// tests/settings-view.contract.test.mjs,
// tests/providers-card.contract.test.mjs) resolve the same unions across the
// view ∪ banners ∪ atlas-card ∪ help-card file set and are asserted to exist
// here.
//
// Source-text level because Node cannot import JSX/extensionless specifiers
// under bare node:test (repo convention: see tests/settings-platform-cards.contract.test.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const VIEW_PATH = 'src/components/views/SettingsView.jsx';
const ATLAS_CARD_PATH = 'src/components/views/settings/AtlasSyncCard.jsx';
const HELP_CARD_PATH = 'src/components/views/settings/HelpCard.jsx';
// The Helper Models / proxy cards may live in these files (the order-bracket
// pins below resolve across the view ∪ helper/proxy sets).
const HELPER_CARD_PATH = 'src/components/views/settings/HelperModelsCard.jsx';
const PROXY_CARD_PATH = 'src/components/views/settings/ProxyCard.jsx';
// The Account & Data card may live in this file (absent when view-side).
const ACCOUNT_CARD_PATH = 'src/components/views/settings/AccountDataCard.jsx';

const readSource = (relPath) => readFileSync(join(root, relPath), 'utf8').replace(/\r\n/g, '\n');
let view = '', app = '', atlasCard = '', helpCard = '', helperModule = '', proxyModule = '', accountModule = '';
try {
  view = readSource(VIEW_PATH);
  app = readSource('src/App.jsx');
  if (existsSync(join(root, ATLAS_CARD_PATH))) atlasCard = readSource(ATLAS_CARD_PATH);
  if (existsSync(join(root, HELP_CARD_PATH))) helpCard = readSource(HELP_CARD_PATH);
  helperModule = readSource(HELPER_CARD_PATH);
  proxyModule = readSource(PROXY_CARD_PATH);
  // AccountDataCard.jsx may be absent (accountModule stays ''); the account
  // pins resolve across the view ∪ account-card file set either way.
  if (existsSync(join(root, ACCOUNT_CARD_PATH))) accountModule = readSource(ACCOUNT_CARD_PATH);
} catch { /* missing files fail their first assertion */ }

const norm = (text) => text.replace(/\s+/g, ' ').trim();
const countIn = (source, needle) => source.split(needle).length - 1;
const lineCount = (source) => source.replace(/\n+$/, '').split('\n').length;
const viewPlusCards = view + '\n' + atlasCard + '\n' + helpCard;
// The account card module spliced into the view at its DOM position (the
// <AccountDataCard mount): index comparisons over the spliced union keep their
// meaning whether or not the module exists (an absent module splices as '').
const accountMountAt = view.indexOf('<AccountDataCard');
const viewPlusAccountSpliced = accountMountAt >= 0
  ? view.slice(0, accountMountAt) + '\n' + accountModule + view.slice(accountMountAt)
  : view + '\n' + accountModule;

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

// ---------------------------------------------------------------------------
// The ATLAS card is a real props-in/events-out module with the verbatim body;
// the view composes it
// ---------------------------------------------------------------------------

test('AtlasSyncCard.jsx is the real card — named + default export, exact 4-prop surface, verbatim body', () => {
  assert.match(atlasCard, /export function AtlasSyncCard\(/, 'AtlasSyncCard is exported');
  assert.match(atlasCard, /export default AtlasSyncCard;/, 'the default export exists');
  // The exact prop list — props-in, nothing else.
  const props = /\(\{\s*([\s\S]*?)\s*\}\)/.exec(atlasCard)?.[1] ?? '';
  for (const name of ['syncLiveATLAS', 'loadingATLAS', 'atlasSyncStatus', 'collapsedSettings']) {
    assert.match(props, new RegExp(`\\b${name}\\b`), `AtlasSyncCard receives ${name} as a prop`);
  }
  // Verbatim body: shell, header mount, collapse gates, sync button, status.
  ordered(atlasCard, 'atlas card body', [
    `<div className="glass-card" data-tour="atlas-sync-settings" style={{ display: 'flex', flexDirection: 'column', gap: collapsedSettings['atlas'] ? '0' : '12px' }}>`,
    `<SettingsCardHeader settingKey="atlas" icon={<Layers size={18} color="var(--color-primary)" />} title={'MITRE ATLAS Framework Database'} />`,
    `!collapsedSettings['atlas'] && (`,
    'Sync live with the official MITRE GitHub to download all 80+ techniques and relationships used by the',
    'onClick={syncLiveATLAS}',
    'data-tour="sync-atlas-settings"',
    'disabled={loadingATLAS}',
    `<RefreshCw size={14} className={loadingATLAS ? 'animate-spin-custom' : ''} style={{ marginRight: '6px' }} />`,
    `{loadingATLAS ? 'Downloading...' : 'Sync Live ATLAS'}`,
    `<span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{atlasSyncStatus}</span>`
  ]);
  assert.equal(countIn(atlasCard, `collapsedSettings['atlas']`), 2, 'the card gates its gap and body on collapsedSettings twice');
  // Props-in/events-out: no context reach, no handler definitions inside.
  assert.doesNotMatch(atlasCard, /useSettings\(/, 'the card never calls useSettings() — props-in only');
  assert.doesNotMatch(atlasCard, /useProviders\(/, 'the card never calls useProviders()');
  assert.doesNotMatch(atlasCard, /useUI\(/, 'the card never calls useUI()');
  assert.doesNotMatch(atlasCard, /const syncLiveATLAS/, 'the card never defines the sync action — it arrives as a prop');
});

test('SettingsView composes <AtlasSyncCard> at the exact position with bare-identifier wiring', () => {
  assert.match(view, /import \{ AtlasSyncCard \} from '\.\/settings\/AtlasSyncCard';/, 'the view imports AtlasSyncCard');
  assert.equal(countIn(view, '<AtlasSyncCard'), 1, 'the card is composed exactly once');
  // Card order preserved: after the Helper Models card, before the Proxy card.
  // The helper-models surface resolves across the view ∪ HelperModelsCard.jsx
  // file set (either home may own it); the cors surface across the
  // view ∪ ProxyCard.jsx set. The offsets are compared over the composed order
  // union so cross-file positions stay meaningful in either layout.
  const orderUnion = helperModule + '\n' + view + '\n' + atlasCard + '\n' + proxyModule;
  let helperCard = orderUnion.indexOf('<div className="glass-card" data-tour="helper-models"');
  let corsCard = orderUnion.indexOf('<div className="glass-card" data-tour="cors-card"');
  const mountAtUnion = orderUnion.indexOf('<AtlasSyncCard');
  assert.ok(helperCard >= 0 && mountAtUnion > helperCard, 'the atlas card mounts after the Helper Models card');
  assert.ok(corsCard >= 0 && mountAtUnion < corsCard, 'the atlas card mounts before the proxy card');
  for (const name of ['syncLiveATLAS', 'loadingATLAS', 'atlasSyncStatus', 'collapsedSettings']) {
    assert.ok(view.includes(`${name}={${name}}`), `the mount wires ${name}={${name}} (bare, referentially stable)`);
  }
  // The markers render card-side, exactly once across the union.
  for (const marker of ['data-tour="atlas-sync-settings"', 'data-tour="sync-atlas-settings"', 'onClick={syncLiveATLAS}', "{loadingATLAS ? 'Downloading...' : 'Sync Live ATLAS'}"]) {
    assert.equal(countIn(view, marker), 0, `the view no longer carries the moved atlas surface: ${marker}`);
    assert.equal(countIn(viewPlusCards, marker), 1, `the moved atlas surface renders exactly once across the view ∪ cards: ${marker}`);
  }
  // The view still binds the context surface it forwards to the card.
  const settingsBlock = /const \{([\s\S]*?)\} = useSettings\(\);/.exec(view);
  assert.ok(settingsBlock, 'the view still destructures useSettings()');
  for (const name of ['syncLiveATLAS', 'loadingATLAS', 'atlasSyncStatus']) {
    assert.match(settingsBlock[1], new RegExp(`\\b${name}\\b`), `the view keeps binding ${name} to forward to the card`);
  }
});

// ---------------------------------------------------------------------------
// The Help card is a real props-in/events-out module; the view owns the
// handler bodies and wires them in as props
// ---------------------------------------------------------------------------

test('HelpCard.jsx is the real card — named + default export, exact prop surface, verbatim body', () => {
  assert.match(helpCard, /export function HelpCard\(/, 'HelpCard is exported');
  assert.match(helpCard, /export default HelpCard;/, 'the default export exists');
  // The exact prop list — events arrive as callbacks.
  const props = /\(\{\s*([\s\S]*?)\s*\}\)/.exec(helpCard)?.[1] ?? '';
  for (const name of ['onReplayOnboarding', 'onStartTour', 'collapsedSettings']) {
    assert.match(props, new RegExp(`\\b${name}\\b`), `HelpCard receives ${name} as a prop`);
  }
  // Verbatim body: shell, header mount, collapse gates, copy, both buttons
  // with their exact labels, wired to the callback props.
  ordered(helpCard, 'help card body', [
    `<div className="glass-card" data-tour="help-onboarding" style={{ display: 'flex', flexDirection: 'column', gap: collapsedSettings['help'] ? '0' : '14px' }}>`,
    `<SettingsCardHeader settingKey="help" icon={<HelpCircle size={18} color="var(--color-primary)" />} title={'Help & Onboarding'} />`,
    `!collapsedSettings['help'] && (`,
    'New to GroundRumble? Replay the guided onboarding walkthrough or start an interactive tour of the',
    'interface to get oriented.',
    `<HelpCircle size={14} style={{ marginRight: '6px' }} /> Replay onboarding`,
    `<Info size={14} style={{ marginRight: '6px' }} /> Start interface tour`
  ]);
  assert.equal(countIn(helpCard, `collapsedSettings['help']`), 2, 'the card gates its gap and body on collapsedSettings twice');
  assert.equal(countIn(helpCard, 'onReplayOnboarding'), 1, 'the replay button calls the onReplayOnboarding prop exactly once');
  assert.equal(countIn(helpCard, 'onStartTour'), 1, 'the tour button calls the onStartTour prop exactly once');
  // Props-in/events-out: no context reach, no localStorage side effects, no
  // handler bodies inside the module.
  assert.doesNotMatch(helpCard, /useSettings\(/, 'the card never calls useSettings() — props-in only');
  assert.doesNotMatch(helpCard, /useUI\(/, 'the card never calls useUI() — events-out only');
  assert.doesNotMatch(helpCard, /useProviders\(/, 'the card never calls useProviders()');
  assert.ok(!helpCard.includes("localStorage.removeItem('atlas_onboarding_done');"), 'the card never touches localStorage — the handler body stays with the view');
});

test('SettingsView composes <HelpCard> last, keeps the handler bodies, and wires them as props', () => {
  assert.match(view, /import \{ HelpCard \} from '\.\/settings\/HelpCard';/, 'the view imports HelpCard');
  assert.equal(countIn(view, '<HelpCard'), 1, 'the card is composed exactly once');
  // The bracket compares inside the spliced union so both layouts share one
  // coordinate space.
  const mountAt = viewPlusAccountSpliced.indexOf('<HelpCard');
  // Card order preserved: the help card mounts after the Account & Data card
  // and is the view's last card. The account surface resolves across the
  // view ∪ account-card spliced union (the module, when present, is spliced in
  // at its position before the <HelpCard mount).
  const accountCard = viewPlusAccountSpliced.indexOf('<div className="glass-card" data-tour="account-data"');
  assert.ok(accountCard >= 0 && mountAt > accountCard, 'the help card mounts after the Account & Data card (view ∪ account card)');
  // The handler bodies stay view-owned (context-fed) and are wired in as
  // bare, referentially stable props.
  const replayAt = view.indexOf("localStorage.removeItem('atlas_onboarding_done');");
  const openAt = view.indexOf('setOnboardingOpen(true);');
  assert.ok(replayAt >= 0 && openAt > replayAt, 'the view keeps the replay handler: clears atlas_onboarding_done, then opens onboarding');
  assert.ok(view.includes('onReplayOnboarding={'), 'the view wires onReplayOnboarding={…}');
  // The view-side form of the start-tour body is the onStartTour callback
  // prop's inline value — the button itself renders card-side (its Info label
  // and ownership are pinned by the card walk above). The pin still holds the
  // exact body + inline-arrow wiring.
  assert.ok(view.includes("onStartTour={() => { setActiveTab('dashboard'); setTourRunning(true); }}"), 'the view keeps the start-tour handler: setActiveTab(\'dashboard\') + setTourRunning(true), wired inline as onStartTour');
  assert.ok(view.includes('onStartTour={'), 'the view wires onStartTour={…}');
  assert.ok(view.includes('collapsedSettings={collapsedSettings}'), 'the view wires collapsedSettings down to the help card');
  // The view still binds the UI surface the handlers are built from.
  const uiBlock = /const \{([\s\S]*?)\} = useUI\(\);/.exec(view);
  assert.ok(uiBlock, 'the view still destructures useUI()');
  for (const name of ['setActiveTab', 'setOnboardingOpen', 'setTourRunning']) {
    assert.match(uiBlock[1], new RegExp(`\\b${name}\\b`), `the view keeps binding ${name} for the help-card handlers`);
  }
  // The markers render card-side, exactly once across the union.
  for (const marker of ['data-tour="help-onboarding"', "'Help & Onboarding'", `<HelpCircle size={14} style={{ marginRight: '6px' }} /> Replay onboarding`, `<Info size={14} style={{ marginRight: '6px' }} /> Start interface tour`]) {
    assert.equal(countIn(view, marker), 0, `the view no longer carries the moved help surface: ${marker}`);
    assert.equal(countIn(viewPlusCards, marker), 1, `the moved help surface renders exactly once across the view ∪ cards: ${marker}`);
  }
});

// ---------------------------------------------------------------------------
// Tour anchors survive exactly once across the file set; the companion port
// suites hold the union guarantee
// ---------------------------------------------------------------------------

test('The tour anchors survive exactly once across the view ∪ cards, zero App-side', () => {
  for (const marker of ['atlas-sync-settings', 'sync-atlas-settings', 'help-onboarding']) {
    assert.equal(countIn(viewPlusCards, `data-tour="${marker}"`), 1, `the ${marker} anchor survives exactly once across the new file set`);
    assert.equal(countIn(app, `data-tour="${marker}"`), 0, `App carries no ${marker} anchor`);
  }
  // The five-card render order is preserved across the composed union:
  // providers composition → helper-models (view) → atlas (card) → cors
  // (view) → account-data (view) → help (card).
  // The five-card DOM order is asserted without relying on a plain
  // concatenation of modules: the three view-local anchors walk in order, and
  // the two card anchors bracket into their exact positions through the mount
  // pins (helper-models < <AtlasSyncCard/> < cors-card; account-data <
  // <HelpCard/>). All five anchor needles are retained. The account anchor
  // resolves across the view ∪ account-card spliced union.
  ordered(helperModule + '\n' + proxyModule + '\n' + viewPlusAccountSpliced, 'settings card order (view-local anchors)', [
    'data-tour="helper-models"',
    'data-tour="cors-card"',
    'data-tour="account-data"'
  ]);
  const atlasAnchor = atlasCard.indexOf('data-tour="atlas-sync-settings"');
  assert.ok(atlasAnchor >= 0, 'the atlas anchor renders card-side');
  // Mount-level bracketing: the helper-models, atlas and cors cards resolve
  // against their own modules, while the view-side mount order still brackets
  // <AtlasSyncCard at its position; the proxy card's slot brackets it against
  // <ProxyCard>.
  const helperAt = view.indexOf('<HelperModelsCard');
  const atlasMountAt = view.indexOf('<AtlasSyncCard');
  const corsAt = view.indexOf('<ProxyCard');
  const accountAt = viewPlusAccountSpliced.indexOf('data-tour="account-data"');
  // The bracket compares inside the spliced union (one coordinate space for
  // either layout).
  const helpMountAt = viewPlusAccountSpliced.indexOf('<HelpCard');
  const helpAnchor = helpCard.indexOf('data-tour="help-onboarding"');
  assert.ok(helperAt >= 0 && atlasMountAt > helperAt && atlasMountAt < corsAt, 'five-card order: helper-models → <AtlasSyncCard/> → cors (card bracketed at its baseline position)');
  assert.ok(accountAt >= 0 && accountAt < helpMountAt, 'five-card order: account-data → <HelpCard/> (card bracketed at its baseline position)');
  assert.ok(atlasAnchor >= 0 && helpAnchor >= 0, 'the atlas/help anchors render card-side (helper-models → atlas → cors → account-data → help across the view ∪ cards union)');
  // The companion suites exist and pin the same unions.
  const t15 = readSource('tests/settings-platform-cards.contract.test.mjs');
  assert.ok(t15.includes('AtlasSyncCard.jsx'), 't15 resolves the atlas card union (seam repair landed)');
  assert.ok(t15.includes('HelpCard.jsx'), 't15 resolves the help card union (seam repair landed)');
  // The companion platform-cards suite resolves the account-card union too.
  assert.ok(t15.includes('AccountDataCard.jsx'), 't15 resolves the account card union (T10 seam repair landed)');
});

// ---------------------------------------------------------------------------
// Net-smaller view, byte-compatible DOM, no stub debris
// ---------------------------------------------------------------------------

test('SettingsView is strictly net-smaller; the cards carry the moved surface', () => {
  const viewLines = lineCount(view);
  // The gate is set so the view stays the real view, not a stub, while also
  // shedding the Account & Data card.
  assert.ok(viewLines > 200, `the view still carries the providers composition + helper-models + cors cards (${viewLines} lines)`);
  assert.ok(viewLines < 605, `the view shed the two moved cards (baseline 605 lines); got ${viewLines}`);
  assert.ok(lineCount(atlasCard) > 20, 'AtlasSyncCard.jsx carries the moved body');
  assert.ok(lineCount(helpCard) > 25, 'HelpCard.jsx carries the moved body');
  assert.ok(!view.includes('Settings view - Configure providers, models, and application settings'), 'no placeholder-stub text remains in the view');
  assert.match(view, /export function SettingsView\(/, 'the view keeps its named export');
  assert.match(view, /export default SettingsView;/, 'the view keeps its default export');
});
