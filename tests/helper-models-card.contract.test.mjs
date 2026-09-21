// Contract: the Helper Models card — the
// data-tour="helper-models" shell with its collapse gate, the AI Judge Model
// section (provider/model selects with the no-provider option and the
// custom-model injection, the test button with its busy gate), the divider
// and the Test Generator Model section (paragraph copy, the shared
// GenModelSelector mount, the test button) — renders from
// src/components/views/settings/HelperModelsCard.jsx following the
// ProvidersCard pattern (props-in/events-out, no context reach), while
// SettingsView composes it with the full bare-identifier wiring at the exact
// position between the Providers card and the ATLAS card, and App keeps its
// SettingsView prop wiring unchanged.
//
// Source-text level because Node cannot import JSX/extensionless specifiers
// under bare node:test (repo convention: see tests/settings-view.contract.test.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CARD_PATH = 'src/components/views/settings/HelperModelsCard.jsx';
const VIEW_PATH = 'src/components/views/SettingsView.jsx';
const APP_PATH = 'src/App.jsx';
const TOUR_PATH = 'src/utils/tour-steps.js';
const HEADER_PATH = 'src/components/views/settings/SettingsCardHeader.jsx';

const readSource = (relPath) => readFileSync(join(root, relPath), 'utf8').replace(/\r\n/g, '\n');
const readIfExists = (relPath) => { try { return readSource(relPath); } catch { return ''; } };

let card = '', view = '', app = '', tour = '', cardHeader = '';
try {
  view = readSource(VIEW_PATH);
  app = readSource(APP_PATH);
  tour = readSource(TOUR_PATH);
  cardHeader = readSource(HEADER_PATH);
} catch { /* missing files fail their first assertion */ }
// When the card module is absent, its pins fail their first assertion against
// the empty string.
if (existsSync(join(root, CARD_PATH))) card = readSource(CARD_PATH);

const norm = (text) => text.replace(/\s+/g, ' ').trim();
const countIn = (source, needle) => source.split(needle).length - 1;
// Comment-stripping census: count pins measure CODE tokens (repo convention:
// see tests/model-selector.contract.test.mjs) so docblock wording
// cannot skew the exactly-once guarantees.
const codeOf = (source) => source.split('\n')
  .filter((l) => { const t = l.trim(); return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')); })
  .join('\n');
const lineCount = (source) => source.replace(/\n+$/, '').split('\n').length;
const viewPlusCard = view + '\n' + card;
const codeUnion = codeOf(viewPlusCard);

// Ordered-substring helper over a normalized body: pins presence AND order.
const ordered = (body, label, needles) => {
  let cursor = -1;
  for (const needle of needles) {
    const at = body.indexOf(norm(needle), cursor + 1);
    assert.ok(at > cursor, `${label}: expected ${JSON.stringify(norm(needle))} after offset ${cursor} (ordering pin)`);
    cursor = at;
  }
  return cursor;
};

const CARD_PROPS = [
  'judgeConfig', 'saveJudgeConfig', 'providers', 'helperProviderSelectable',
  'selectedJudgeProvider', 'judgeModelList', 'effectiveGenConfig',
  'selectedGenProvider', 'genModelList', 'saveGenConfig',
  'testJudge', 'testGenerator', 'testingJudge', 'testingGen',
  'vaultLocked', 'collapsedSettings'
];

// ---------------------------------------------------------------------------
// the card body (shell, judge section, divider, gen section) — the exact
// constants the view-side pins expect
// ---------------------------------------------------------------------------

test('The Helper Models card renders the moved shell, header identity and collapse gate verbatim', () => {
  ordered(norm(card), 'helper-models shell', [
    '<div className="glass-card" data-tour="helper-models"',
    "gap: collapsedSettings['helper-models'] ? '0' : '16px'",
    '<SettingsCardHeader settingKey="helper-models"',
    '<Cpu size={18} color="var(--color-primary)" />',
    "title={'Helper Models'}",
    "!collapsedSettings['helper-models'] && ("
  ]);
  assert.equal(countIn(card, 'data-tour="helper-models"'), 1, 'the helper-models anchor renders exactly once card-side');
  assert.equal(countIn(card, 'settingKey="helper-models"'), 1, 'the card header routes through the shared card header exactly once');
  assert.equal(countIn(card, "collapsedSettings['helper-models']"), 2, 'the card gates its gap and body on collapsedSettings exactly twice');
  assert.ok(card.includes("import { SettingsCardHeader } from './SettingsCardHeader';"), 'the card imports the shared header component');
  assert.equal(countIn(card, '<SettingsCardHeader'), 1, 'the card mounts the shared header exactly once');
});

test('The AI Judge Model section keeps its verbatim structure and bindings card-side', () => {
  ordered(norm(card), 'judge section', [
    '<div data-tour="judge-config"',
    '<ShieldCheck size={18} color="var(--color-secondary)" />',
    "fontSize: '1.15rem', fontWeight: 800",
    '>AI Judge Model</h3>',
    'Choose which model acts as the security evaluator.',
    'judge with a low-cost local host to avoid rate limits, or a fast model for large suites',
    "gridTemplateColumns: '1fr 1fr', gap: '24px'",
    '<label className="form-label">Judge Provider</label>',
    'value={judgeConfig.provider}',
    "onChange={(e) => saveJudgeConfig({ provider: e.target.value, model: '' })}",
    '{!helperProviderSelectable(judgeConfig.provider) && (',
    '<option value={judgeConfig.provider} disabled>No provider configured — add one in Settings → Providers</option>',
    '{providers.filter(cp => cp.enabled !== false).map(cp => (',
    '<option key={cp.id} value={cp.id}>{cp.name}</option>',
    '<label className="form-label">Judge Model</label>',
    '{selectedJudgeProvider ? (',
    'selectedJudgeProvider.models.length > 0 ? (',
    'value={judgeConfig.model}',
    "onChange={(e) => saveJudgeConfig({ ...judgeConfig, model: e.target.value })}",
    '{selectedJudgeProvider.models.map(m => (',
    '<option key={m} value={m}>{m}</option>',
    'placeholder="e.g. gpt-4o"',
    '{judgeConfig.model && !judgeModelList.includes(judgeConfig.model) && (',
    '<option value={judgeConfig.model}>{judgeConfig.model}</option>',
    '{judgeModelList.map(m => (',
    '<button onClick={testJudge} className="btn-secondary" disabled={testingJudge || vaultLocked || !judgeModelSet}',
    "testingJudge ? 'Testing…' : 'Test model'"
  ]);
  assert.equal(countIn(card, "onChange={(e) => saveJudgeConfig({ ...judgeConfig, model: e.target.value })}"), 3,
    'all three judge-model branches save through the spread form exactly three times');
  assert.ok(card.includes('<input') && card.includes('type="text"'), 'the custom-model injection keeps its text input branch');
  assert.ok(card.includes('className="animate-spin-custom"'), 'the busy state spins the RefreshCw icon');
  assert.ok(card.includes('<Sparkles size={14}'), 'the idle state renders the Sparkles icon');
});

test('The divider separates the judge and generator sections card-side', () => {
  const divider = '<div style={{ height: \'1px\', background: \'var(--border-subtle)\' }} />';
  assert.equal(countIn(card, divider), 1, 'the helper card carries exactly one section divider');
  const body = norm(card);
  const dividerAt = body.indexOf(norm(divider));
  const judgeH3At = body.indexOf(norm('>AI Judge Model</h3>'));
  const genH3At = body.indexOf(norm('>Test Generator Model</h3>'));
  assert.ok(judgeH3At >= 0 && genH3At >= 0, 'both section headings are present');
  assert.ok(dividerAt > judgeH3At && dividerAt < genH3At, 'the divider sits between the judge and generator headings');
});

test('The Test Generator Model section keeps its copy, the shared GenModelSelector and its test button', () => {
  ordered(norm(card), 'gen section', [
    '<div data-tour="gen-config"',
    '<Wand2 size={18} color="var(--color-primary)" />',
    '>Test Generator Model</h3>',
    'Choose which model drafts new attack payloads in "AI Test Generation".',
    'a stronger or more capable model tends to produce more precise and',
    '<GenModelSelector',
    'effectiveGenConfig={effectiveGenConfig}',
    'selectedGenProvider={selectedGenProvider}',
    'genModelList={genModelList}',
    'saveGenConfig={saveGenConfig}',
    'providers={providers}',
    'helperProviderSelectable={helperProviderSelectable}',
    '/>',
    '<button onClick={testGenerator} className="btn-secondary" disabled={testingGen || vaultLocked || !genModelSet}',
    "testingGen ? 'Testing…' : 'Test model'"
  ]);
  assert.ok(card.includes("import { GenModelSelector } from '../../GenModelSelector';"), 'the card imports the shared generator selector at the settings/ depth');
  assert.equal(countIn(card, '<GenModelSelector'), 1, 'the card renders the shared generator selector exactly once');
  assert.ok(card.includes('<Wand2 size={14}'), 'the gen idle state renders the Wand2 icon');
});

// ---------------------------------------------------------------------------
// props-in/events-out over the exact declared surface (ProvidersCard
// pattern) — no context reach, no local redefinitions
// ---------------------------------------------------------------------------

test('HelperModelsCard is props-in/events-out over the exact declared 16-prop surface', () => {
  assert.match(card, /export function HelperModelsCard\(/, 'the card is a named export');
  assert.match(card, /export default HelperModelsCard;/, 'the default export stays');
  const signature = /export function HelperModelsCard\(\{([\s\S]*?)\}\) \{/.exec(card);
  assert.ok(signature, 'the card destructures its props bag');
  for (const name of CARD_PROPS) {
    assert.equal(countIn(signature[1], name), 1, `the card takes exactly one ${name} prop`);
  }
  assert.doesNotMatch(signature[1], /=|\.\.\./, 'the props bag carries bare identifiers only (no defaults, no rest)');
  assert.doesNotMatch(card, /useProviders|useSettings|useUI|useAIGen|useContext|useState|useEffect|useRef|useCallback|useMemo|useReducer/, 'the card never reaches a context or hook — everything arrives via props');
  assert.doesNotMatch(card, /from '\.\.\/\.\.\/context|from '\.\.\/context|from '\.\.\/\.\.\/hooks|from '\.\.\/hooks/, 'the card imports no context/hook module');
  for (const name of ['helperProviderSelectable', 'selectedJudgeProvider', 'judgeModelList', 'selectedGenProvider', 'genModelList', 'effectiveGenConfig']) {
    assert.equal((card.match(new RegExp(`const ${name} =`, 'g')) || []).length, 0, `${name} has no local definition in the card (arrives wired)`);
  }
  const declaredImports = card.slice(0, card.indexOf('/**'));
  for (const needed of ["import React from 'react';", 'from \'lucide-react\';']) {
    assert.ok(declaredImports.includes(needed), `the card header imports ${needed}`);
  }
  assert.ok(declaredImports.includes("import { Cpu } from 'lucide-react';") || declaredImports.includes('Cpu'), 'the card imports its Cpu icon');
});

// ---------------------------------------------------------------------------
// SettingsView composes the card with the full wiring at the exact
// position; the view keeps no duplicate surface and keeps its forwarded
// destructures; App keeps its prop wiring unchanged
// ---------------------------------------------------------------------------

test('SettingsView imports and composes <HelperModelsCard> with the full bare-identifier wiring', () => {
  assert.match(view, /import \{ HelperModelsCard \} from '\.\/settings\/HelperModelsCard';/, 'the view imports the extracted card');
  assert.equal(countIn(view, '<HelperModelsCard'), 1, 'the card is composed exactly once');
  const mountAt = view.indexOf('<HelperModelsCard');
  const mountEnd = view.indexOf('/>', mountAt);
  const mount = view.slice(mountAt, mountEnd + 2);
  for (const name of CARD_PROPS) {
    assert.ok(mount.includes(`${name}={${name}}`), `the mount wires ${name}={${name}} (bare, referentially stable)`);
  }
  // Position: after the ProvidersCard mount, before the ATLAS card.
  // The ATLAS card's body may live in AtlasSyncCard.jsx, so the ATLAS anchor
  // resolves across the view ∪ atlas union either way (view-side when the body
  // is still inline, AtlasSyncCard.jsx once the card exists).
  const providersAt = view.indexOf('<ProvidersCard');
  const atlasCardT12 = readIfExists('src/components/views/settings/AtlasSyncCard.jsx');
  const orderUnion = view + '\n' + atlasCardT12;
  const atlasAt = orderUnion.indexOf('data-tour="atlas-sync-settings"');
  assert.ok(providersAt >= 0 && atlasAt >= 0 && atlasAt > view.length, `the ATLAS anchor renders card-side after the split: ${atlasAt}`);
  assert.ok(mountAt > providersAt && mountAt < atlasAt, 'the Helper Models mount sits between the Providers card and the ATLAS card (baseline card order preserved)');
});

test('The view sheds the moved helper surface (byte-compatible DOM) and keeps its forwarded destructures', () => {
  for (const marker of [
    'data-tour="helper-models"',
    'data-tour="judge-config"',
    'data-tour="gen-config"',
    'AI Judge Model',
    'Test Generator Model',
    'Choose which model drafts new attack payloads in "AI Test Generation".',
    "onChange={(e) => saveJudgeConfig({ provider: e.target.value, model: '' })}",
    'providers.filter(cp => cp.enabled !== false).map(cp => (',
    "gap: collapsedSettings['helper-models'] ? '0' : '16px'",
    "!collapsedSettings['helper-models'] && ("
  ]) {
    assert.equal(countIn(codeOf(view), marker), 0, `the view sheds the moved marker: ${marker}`);
    assert.equal(countIn(codeUnion, marker), 1, `the moved marker survives exactly once across the view ∪ card: ${marker}`);
  }
  assert.equal(countIn(codeOf(view), '<GenModelSelector'), 0, 'the view no longer renders the gen selector directly (the card owns the mount)');
  assert.equal(countIn(view, "from '../GenModelSelector'"), 0, 'the view drops its GenModelSelector import (the card imports it)');
  // The view keeps destructuring every forwarded context name (the props-in
  // wiring forwards them, so the context-consumption pins stay unchanged).
  const settingsBlock = /const \{([\s\S]*?)\n  \} = useSettings\(\);/.exec(view) || /const \{([\s\S]*?)\} = useSettings\(\);/.exec(view);
  assert.ok(settingsBlock, 'the view destructures useSettings()');
  for (const name of ['judgeConfig', 'saveJudgeConfig', 'effectiveGenConfig', 'collapsedSettings']) {
    assert.match(settingsBlock[1], new RegExp(`\\b${name}\\b`), `the view keeps forwarding SettingsContext's ${name}`);
  }
  const providersBlock = /const \{([\s\S]*?)\n  \} = useProviders\(\);/.exec(view) || /const \{([\s\S]*?)\} = useProviders\(\);/.exec(view);
  assert.ok(providersBlock, 'the view destructures useProviders()');
  for (const name of ['providers', 'vaultLocked']) {
    assert.match(providersBlock[1], new RegExp(`\\b${name}\\b`), `the view keeps forwarding ProvidersContext's ${name}`);
  }
});

test('App keeps its SettingsView prop wiring unchanged', () => {
  const wireStart = app.indexOf('<SettingsView');
  assert.ok(wireStart >= 0, 'App mounts <SettingsView');
  const tagIndent = /^[\t ]*/.exec(app.slice(app.lastIndexOf('\n', wireStart) + 1))[0];
  const wireEnd = app.indexOf(`\n${tagIndent}/>`, wireStart);
  const wire = app.slice(wireStart, wireEnd);
  for (const name of ['testJudge', 'testGenerator', 'testingJudge', 'testingGen', 'helperProviderSelectable', 'selectedJudgeProvider', 'judgeModelList', 'selectedGenProvider', 'genModelList']) {
    assert.ok(wire.includes(`${name}={${name}}`), `App still wires ${name}={${name}} into the view (bare, referentially stable)`);
  }
  // The selector derivations stay hook/App-owned — exactly one definition
  // across App + view + sync hook, none in the card.
  const syncHook = readIfExists('src/hooks/useProviderModelSync.js');
  for (const name of ['helperProviderSelectable', 'providerSelectable', 'judgeModelList', 'genModelList', 'selectedJudgeProvider', 'selectedGenProvider']) {
    assert.equal(countIn(`${app}\n${view}\n${syncHook}\n${card}`, `const ${name} =`), 1, `${name} keeps exactly one definition across App + view + sync hook + card`);
  }
  assert.equal(countIn(card, 'const settingsCardHeader ='), 0, 'no render-prop reimplementation creeps into the card');
  assert.equal(countIn(cardHeader, 'export function SettingsCardHeader('), 1, 'the shared header keeps exactly one definition module-side');
});

// ---------------------------------------------------------------------------
// anchors byte-compatible, tour untouched, shrink gates
// ---------------------------------------------------------------------------

test('The tour config is untouched — judge-config stays targeted, no helper/gen steps added', () => {
  assert.ok(tour.includes("'[data-tour=\"judge-config\"]'"), 'tour-steps.js still targets the judge-config anchor');
  assert.equal(countIn(tour, 'gen-config'), 0, 'the gen-config anchor is still not a tour target');
  assert.equal(countIn(tour, 'helper-models'), 0, 'the helper-models card is still not a tour target');
});

test('The split is strictly net-smaller for the view; the card carries the moved region', () => {
  assert.ok(lineCount(view) < 583, `SettingsView.jsx must shed the moved region (583 at the T08 baseline); got ${lineCount(view)}`);
  assert.ok(lineCount(card) > 90, `HelperModelsCard.jsx carries the moved surface (handlers + sections + card JSX); got ${lineCount(card)}`);
  // The anchors survive byte-compat across the view ∪ card pair.
  for (const anchor of ['data-tour="helper-models"', 'data-tour="judge-config"', 'data-tour="gen-config"']) {
    assert.equal(countIn(codeUnion, anchor), 1, `the ${anchor} anchor survives the split exactly once (view ∪ card)`);
    assert.equal(countIn(codeOf(app.replace(/\[data-tour="[^"]+"\]/g, '')), anchor), 0, `App keeps none of the anchor: ${anchor}`);
  }
});
