// Contract: the generator/judge model selectors and the
// active-model chip are real components — src/components/
// GenModelSelector.jsx, JudgeModelSelector.jsx and ActiveModelChip.jsx each
// export one props-in/events-out component (every SettingsContext/
// ProvidersContext value arrives as a prop from the render site; every edit
// flows out through the save callbacks; zero context reach, zero local
// state). App.jsx holds no render-prop helpers; its two pass-through wirings
// (TestsView + RunnerView keep consuming callables because those views use
// the callable prop contract) become inline component mounts, and the
// in-scope consumers adopt the components directly via imports:
// SettingsView's helper-models card (gen selector), the wizard modal's config
// step (gen selector + chip) and AiGenWizardResults' running step (chip).
// ProvidersContext carries no dead selector duplicates and they stay
// unconsumed.
//
// Structural parity: the component bodies are the same helpers — same
// grids, labels, disabled/pointer-events dimming, running gate,
// no-provider-configured option, unlisted-model option injection and chip
// styling — pinned with the exact normalized strings, so the swap renders
// byte-compatible DOM.
//
// Source-text level because Node cannot import JSX/extensionless specifiers
// under bare node:test (repo convention: see tests/tests-view.contract.test.mjs,
// tests/runner-view.contract.test.mjs). Hermetic: no dev server, no network,
// no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const GEN_PATH = 'src/components/GenModelSelector.jsx';
const JUDGE_PATH = 'src/components/JudgeModelSelector.jsx';
const CHIP_PATH = 'src/components/ActiveModelChip.jsx';

const readSource = (relPath) => readFileSync(join(root, relPath), 'utf8').replace(/\r\n/g, '\n');
const readIfExists = (relPath) => { try { return readSource(relPath); } catch { return ''; } };
let app = '', providersCtx = '', testsView = '', runnerView = '', settingsView = '', wizardModal = '', wizardResults = '';
let genSrc = '', judgeSrc = '', chipSrc = '';
try {
  app = readSource('src/App.jsx');
  providersCtx = readSource('src/context/ProvidersContext.jsx');
  testsView = readSource('src/components/views/TestsView.jsx');
  runnerView = readSource('src/components/views/RunnerView.jsx');
  settingsView = readSource('src/components/views/SettingsView.jsx');
  wizardModal = readSource('src/components/modals/AiGenWizardModal.jsx');
  wizardResults = readSource('src/components/modals/AiGenWizardResults.jsx');
} catch { /* missing files fail their first assertion */ }
genSrc = readIfExists(GEN_PATH);
judgeSrc = readIfExists(JUDGE_PATH);
chipSrc = readIfExists(CHIP_PATH);
// The Helper Models card may live in its own file. The GenModelSelector
// adoption pins below resolve across the view ∪ helper-card file set either
// way.
const HELPER_CARD_PATH = 'src/components/views/settings/HelperModelsCard.jsx';
const helperCard = readIfExists(HELPER_CARD_PATH);
const viewPlusHelper = settingsView + '\n' + helperCard;

const countIn = (source, needle) => source.split(needle).length - 1;
// Token gates count CODE tokens: comment lines (section headers that name
// render-prop components) are stripped before counting.
const codeOf = (source) => source.split('\n')
  .filter((l) => { const t = l.trim(); return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')); })
  .join('\n');
const norm = (text) => text.replace(/\s+/g, ' ').trim();

// Tree-wide census over src/ (root-relative paths) — the dead-pin below
// asserts the shed across the whole tree, not just the context file.
function listSourceFiles(dir = 'src') {
  const out = [];
  for (const entry of readdirSync(join(root, dir))) {
    const rel = `${dir}/${entry}`;
    if (statSync(join(root, rel)).isDirectory()) out.push(...listSourceFiles(rel));
    else if (/\.(js|jsx|mjs)$/.test(entry)) out.push(rel);
  }
  return out;
}

// Extracts a named exported component's source: from its `export function
// NAME(` line to the next top-level `export ` marker (or EOF).
function componentOf(source, name) {
  const start = source.indexOf(`export function ${name}(`);
  assert.ok(start >= 0, `${name} is exported from its own component file`);
  let end = source.indexOf('\nexport ', start + 1);
  if (end === -1) end = source.length;
  return source.slice(start, end);
}

// Ordered-substring helper over a normalized body: pins presence AND order.
const ordered = (body, label, needles) => {
  let cursor = -1;
  for (const needle of needles) {
    const at = body.indexOf(needle, cursor + 1);
    assert.ok(at > cursor, `${label}: expected ${JSON.stringify(needle)} after offset ${cursor} (ordering pin)`);
    cursor = at;
  }
  return cursor;
};

// Mount-wiring block extractor over App.jsx: from `<Name` to the first
// self-closing `/>`.
function wiringBlock(source, mount) {
  const start = source.indexOf(`<${mount}`);
  assert.ok(start >= 0, `App.jsx mounts <${mount}`);
  // App mount blocks can nest self-closing component mounts (the inline
  // selector mounts) — the outer close is the `/>` at the mount tag's own
  // indentation level.
  const tagIndent = /^[\t ]*/.exec(source.slice(source.lastIndexOf('\n', start) + 1))[0];
  const end = source.indexOf(`\n${tagIndent}/>`, start);
  assert.ok(end > start, `the <${mount} mount closes at its own indentation level`);
  return source.slice(start, end + `\n${tagIndent}/>`.length);
}

const GEN_PROPS = '{ effectiveGenConfig, selectedGenProvider, genModelList, saveGenConfig, providers, helperProviderSelectable }';
const JUDGE_PROPS = '{ judgeConfig, selectedJudgeProvider, judgeModelList, saveJudgeConfig, providers, helperProviderSelectable, disabled = false, running = false }';
const CHIP_PROPS = '{ label, cfg, providerLabel }';

// ---------------------------------------------------------------------------
// the three component files exist with one exported component each
// (props-in, events-out, zero context reach)
// ---------------------------------------------------------------------------

test('GenModelSelector.jsx exports exactly one props-in component with the six selector inputs', () => {
  assert.equal(countIn(genSrc, 'export function GenModelSelector('), 1, 'GenModelSelector is exported exactly once from its own file');
  assert.ok(genSrc.split('\n').length > 55, `the file carries the moved selector surface (got ${genSrc.split('\n').length} lines)`);
  assert.ok(genSrc.includes("import React from 'react';"), 'the component file imports React');
  assert.equal(countIn(genSrc, GEN_PROPS), 1, 'GenModelSelector takes exactly the six selector inputs as props');
  assert.doesNotMatch(genSrc, /useProviders|useSettings|useAIGen|useUI|useContext|useState|useEffect|useRef|useCallback|useMemo/, 'the component never reaches a context, hook or state — everything arrives via props');
  assert.doesNotMatch(genSrc, /from '\.\.\/context|from '\.\.\/\.\.\/context|from '\.\.\/hooks/, 'the component imports no context/hook module');
});

test('JudgeModelSelector.jsx exports exactly one props-in component with the gate inputs', () => {
  assert.equal(countIn(judgeSrc, 'export function JudgeModelSelector('), 1, 'JudgeModelSelector is exported exactly once from its own file');
  assert.ok(judgeSrc.split('\n').length > 55, `the file carries the moved selector surface (got ${judgeSrc.split('\n').length} lines)`);
  assert.ok(judgeSrc.includes("import React from 'react';"), 'the component file imports React');
  assert.equal(countIn(judgeSrc, JUDGE_PROPS), 1, 'JudgeModelSelector takes the selector inputs + the disabled/running gate as props');
  assert.doesNotMatch(judgeSrc, /useProviders|useSettings|useAIGen|useUI|useContext|useState|useEffect|useRef|useCallback|useMemo/, 'the component never reaches a context, hook or state — everything arrives via props');
  assert.doesNotMatch(judgeSrc, /from '\.\.\/context|from '\.\.\/\.\.\/context|from '\.\.\/hooks/, 'the component imports no context/hook module');
});

test('ActiveModelChip.jsx exports exactly one props-in component (label, cfg, providerLabel)', () => {
  assert.equal(countIn(chipSrc, 'export function ActiveModelChip('), 1, 'ActiveModelChip is exported exactly once from its own file');
  assert.ok(chipSrc.split('\n').length > 10, `the file carries the moved chip (got ${chipSrc.split('\n').length} lines)`);
  assert.ok(chipSrc.includes("import React from 'react';"), 'the component file imports React');
  assert.ok(chipSrc.includes("import { Cpu } from 'lucide-react';"), 'the chip imports its Cpu icon');
  assert.equal(countIn(chipSrc, CHIP_PROPS), 1, 'ActiveModelChip takes label + cfg + the providerLabel formatter as props');
  assert.doesNotMatch(chipSrc, /useProviders|useSettings|useAIGen|useUI|useContext|useState|useEffect|useRef|useCallback|useMemo/, 'the component never reaches a context, hook or state — everything arrives via props');
});

// ---------------------------------------------------------------------------
// structural parity — the component bodies are the same helpers
// ---------------------------------------------------------------------------

test('GenModelSelector keeps the generator grid verbatim (labels, branches, unlisted-model injection)', () => {
  const body = norm(componentOf(genSrc, 'GenModelSelector'));
  ordered(body, 'GenModelSelector', [
    `display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', alignItems: 'start'`,
    'Generator Provider',
    'value={effectiveGenConfig.provider}',
    "onChange={(e) => saveGenConfig({ provider: e.target.value, model: '' })}",
    '{!helperProviderSelectable(effectiveGenConfig.provider) && (',
    'No provider configured — add one in Settings → Providers',
    '<option key={cp.id} value={cp.id}>{cp.name}</option>',
    'Generator Model',
    'selectedGenProvider ?',
    'selectedGenProvider.models.length > 0 ?',
    'value={effectiveGenConfig.model}',
    '<option key={m} value={m}>{m}</option>',
    'placeholder="e.g. gpt-4o"',
    '{effectiveGenConfig.model && !genModelList.includes(effectiveGenConfig.model) && (',
    '<option value={effectiveGenConfig.model}>{effectiveGenConfig.model}</option>',
    '{genModelList.map(m => ('
  ]);
  assert.equal(countIn(body, 'saveGenConfig({ ...effectiveGenConfig, model: e.target.value })'), 3, 'all three generator-model branches save through the spread form exactly three times');
  assert.equal(countIn(body, 'className="form-input"'), 4, 'all four form controls keep the form-input class');
  assert.equal(countIn(body, "style={{ width: '100%' }}"), 4, 'all four form controls stretch full width');
  assert.equal(countIn(body, 'helperProviderSelectable(effectiveGenConfig.provider)'), 1, 'the helper-provider gate is called single-arg exactly once (parity with the App helper)');
});

test('JudgeModelSelector keeps the dimming + running gate verbatim', () => {
  const body = norm(componentOf(judgeSrc, 'JudgeModelSelector'));
  ordered(body, 'JudgeModelSelector', [
    `opacity: disabled ? 0.55 : 1, pointerEvents: disabled ? 'none' : 'auto'`,
    'Judge Provider',
    'value={judgeConfig.provider}',
    "onChange={(e) => saveJudgeConfig({ provider: e.target.value, model: '' })}",
    '{!helperProviderSelectable(judgeConfig.provider) && (',
    'No provider configured — add one in Settings → Providers',
    'Judge Model',
    'selectedJudgeProvider ?',
    'selectedJudgeProvider.models.length > 0 ?',
    'value={judgeConfig.model}',
    '{judgeConfig.model && !judgeModelList.includes(judgeConfig.model) && (',
    '<option value={judgeConfig.model}>{judgeConfig.model}</option>',
    '{judgeModelList.map(m => ('
  ]);
  assert.equal(countIn(body, 'disabled={disabled || running}'), 4, 'all four judge form controls carry the disabled||running gate');
  assert.equal(countIn(body, 'saveJudgeConfig({ ...judgeConfig, model: e.target.value })'), 3, 'all three judge-model branches save through the spread form exactly three times');
  assert.equal(countIn(body, 'className="form-input"'), 4, 'all four judge controls keep the form-input class');
  assert.equal(countIn(body, 'helperProviderSelectable(judgeConfig.provider)'), 1, 'the helper-provider gate is called single-arg exactly once (parity with the App helper)');
});

test('ActiveModelChip keeps the compact chip styling verbatim', () => {
  const body = norm(componentOf(chipSrc, 'ActiveModelChip'));
  ordered(body, 'ActiveModelChip', [
    `display: 'inline-flex', alignItems: 'center', gap: '6px'`,
    `padding: '4px 10px', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 700`,
    `background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.35)', color: 'var(--color-secondary)'`,
    "whiteSpace: 'nowrap'",
    '<Cpu size={12} />',
    "{label}{cfg && cfg.provider ? ` ${providerLabel(cfg.provider).replace(/ \\(\\d+ models\\)$/, '')}/${cfg.model || 'default'}` : ''}"
  ]);
});

// ---------------------------------------------------------------------------
// the in-scope consumers adopt the components via imports
// ---------------------------------------------------------------------------

test('SettingsView adopts GenModelSelector via import at the helper-models card', () => {
  // The adoption may live in
  // src/components/views/settings/HelperModelsCard.jsx — the mount count,
  // the exact prop feeds and the import pin resolve across the view ∪
  // helper-card file set either way.
  assert.equal(countIn(viewPlusHelper, '<GenModelSelector'), 1, 'the helper-models card renders the shared generator selector exactly once (view ∪ helper card, gen-config sub-card)');
  const jsxStart = viewPlusHelper.indexOf('<GenModelSelector');
  const jsxEnd = viewPlusHelper.indexOf('/>', jsxStart);
  const jsx = viewPlusHelper.slice(jsxStart, jsxEnd + 2);
  for (const prop of ['effectiveGenConfig={effectiveGenConfig}', 'selectedGenProvider={selectedGenProvider}', 'genModelList={genModelList}', 'saveGenConfig={saveGenConfig}', 'providers={providers}', 'helperProviderSelectable={helperProviderSelectable}']) {
    assert.ok(jsx.includes(prop), `the helper-models surface feeds GenModelSelector ${prop}`);
  }
  assert.ok(settingsView.includes("import { GenModelSelector } from '../GenModelSelector';") || helperCard.includes("import { GenModelSelector } from '../../GenModelSelector';"), 'SettingsView (or the extracted helper card) imports the shared component');
  for (const helper of ['renderGenSelector', 'renderJudgeSelector', 'renderActiveModelChip']) {
    assert.equal(countIn(codeOf(viewPlusHelper), helper), 0, `SettingsView carries zero ${helper} code tokens`);
  }
});

test('The wizard modal adopts GenModelSelector + ActiveModelChip via imports at the config step', () => {
  assert.equal(countIn(wizardModal, '<GenModelSelector'), 1, 'the modal renders the shared generator selector exactly once (config step)');
  const jsxStart = wizardModal.indexOf('<GenModelSelector');
  const jsxEnd = wizardModal.indexOf('/>', jsxStart);
  const jsx = wizardModal.slice(jsxStart, jsxEnd + 2);
  for (const prop of ['effectiveGenConfig={effectiveGenConfig}', 'selectedGenProvider={selectedGenProvider}', 'genModelList={genModelList}', 'saveGenConfig={saveGenConfig}', 'providers={providers}', 'helperProviderSelectable={helperProviderSelectable}']) {
    assert.ok(jsx.includes(prop), `the modal feeds GenModelSelector ${prop}`);
  }
  assert.equal(countIn(wizardModal, "<ActiveModelChip label=\"\" cfg={effectiveGenConfig} providerLabel={providerLabel} />"), 1, 'the modal renders the config-step chip with an empty label exactly once');
  assert.ok(wizardModal.includes("import { GenModelSelector } from '../GenModelSelector';"), 'the modal imports the shared generator selector');
  assert.ok(wizardModal.includes("import { ActiveModelChip } from '../ActiveModelChip';"), 'the modal imports the shared chip');
  for (const helper of ['renderGenSelector', 'renderJudgeSelector', 'renderActiveModelChip']) {
    assert.equal(countIn(codeOf(wizardModal), helper), 0, `the modal carries zero ${helper} code tokens`);
  }
  // App's modal mount swaps the two render-props for the six data props.
  const wire = wiringBlock(app, 'AiGenWizardModal');
  for (const prop of ['selectedGenProvider={selectedGenProvider}', 'genModelList={genModelList}', 'saveGenConfig={saveGenConfig}', 'providers={providers}', 'helperProviderSelectable={helperProviderSelectable}', 'providerLabel={providerLabel}']) {
    assert.ok(wire.includes(prop), `App wires ${prop} into the wizard modal`);
  }
  assert.ok(!wire.includes('renderGenSelector'), 'App no longer passes a renderGenSelector prop into the modal');
  assert.ok(!wire.includes('renderActiveModelChip'), 'App no longer passes a renderActiveModelChip prop into the modal');
});

test('AiGenWizardResults adopts ActiveModelChip via import at the running step', () => {
  assert.equal(countIn(wizardResults, "<ActiveModelChip label=\"Generating with\" cfg={effectiveGenConfig} providerLabel={providerLabel} />"), 1, 'the results surface renders the generating chip exactly once');
  assert.ok(wizardResults.includes("import { ActiveModelChip } from '../ActiveModelChip';"), 'the results surface imports the shared chip');
  for (const helper of ['renderGenSelector', 'renderJudgeSelector', 'renderActiveModelChip']) {
    assert.equal(countIn(codeOf(wizardResults), helper), 0, `AiGenWizardResults carries zero ${helper} code tokens`);
  }
  assert.ok(!/renderActiveModelChip,/.test(wizardResults), 'the results state hook no longer takes the chip helper as a binding');
  // The modal's forwarded bindings drop the chip (the component import owns it now).
  const bindings = wizardModal.slice(wizardModal.indexOf('const resultsBindings = {'), wizardModal.indexOf('};', wizardModal.indexOf('const resultsBindings = {')));
  assert.ok(bindings.length > 0, 'resultsBindings is defined modal-side');
  assert.ok(!bindings.includes('renderActiveModelChip'), 'resultsBindings no longer forwards the chip helper');
});

// ---------------------------------------------------------------------------
// the out-of-scope consumers keep the prop contract — App mounts the
// components inline so the untouched views keep working
// ---------------------------------------------------------------------------

test('App mounts the components inline for the out-of-scope view wirings (RunnerView + TestsView)', () => {
  assert.equal(countIn(app, 'const renderGenSelector'), 0, 'App no longer defines renderGenSelector');
  assert.equal(countIn(app, 'const renderJudgeSelector'), 0, 'App no longer defines renderJudgeSelector');
  assert.equal(countIn(app, 'const renderActiveModelChip'), 0, 'App no longer defines renderActiveModelChip');
  assert.ok(app.includes("import { JudgeModelSelector } from './components/JudgeModelSelector';"), 'App imports the judge selector component');
  assert.ok(app.includes("import { ActiveModelChip } from './components/ActiveModelChip';"), 'App imports the chip component');
  // The judge selector wiring becomes an inline component mount with the full
  // input set — the untouched RunnerView call site keeps its exact semantics.
  assert.equal(countIn(app, 'renderJudgeSelector={(disabled = false) => ('), 1, 'App wires the judge selector as exactly one inline component mount');
  const judgeWire = app.slice(app.indexOf('renderJudgeSelector={(disabled = false) => ('), app.indexOf(')}', app.indexOf('renderJudgeSelector={(disabled = false) => (')));
  for (const prop of ['judgeConfig={judgeConfig}', 'selectedJudgeProvider={selectedJudgeProvider}', 'judgeModelList={judgeModelList}', 'saveJudgeConfig={saveJudgeConfig}', 'providers={providers}', 'helperProviderSelectable={helperProviderSelectable}', 'disabled={disabled}', 'running={running}']) {
    assert.ok(judgeWire.includes(prop), `the inline judge mount passes ${prop}`);
  }
  assert.ok(judgeWire.includes('<JudgeModelSelector'), 'the inline judge mount renders JudgeModelSelector');
  // The chip wiring becomes two identical inline component mounts (TestsView
  // + RunnerView both keep consuming a callable prop).
  assert.equal(countIn(app, 'renderActiveModelChip={(label, cfg) => ('), 2, 'App wires the chip as exactly two inline component mounts (TestsView + RunnerView)');
  assert.equal(countIn(app, '<ActiveModelChip label={label} cfg={cfg} providerLabel={providerLabel} />'), 2, 'both inline chip mounts feed label/cfg/providerLabel through');
  assert.ok(wiringBlock(app, 'RunnerView').includes('renderJudgeSelector={(disabled = false) => ('), 'the RunnerView mount carries the inline judge mount');
  assert.ok(wiringBlock(app, 'TestsView').includes('renderActiveModelChip={(label, cfg) => ('), 'the TestsView mount carries an inline chip mount');
  assert.ok(wiringBlock(app, 'RunnerView').includes('renderActiveModelChip={(label, cfg) => ('), 'the RunnerView mount carries an inline chip mount');
  // The out-of-scope call sites keep their exact baseline shape.
  assert.equal(countIn(runnerView, "{renderJudgeSelector(evalMode !== 'judge')}"), 1, 'RunnerView keeps its judge selector call site (dimmed when evalMode is off-judge)');
  assert.equal(countIn(runnerView, "{running && renderActiveModelChip(\n"), 1, 'RunnerView keeps its running chip call site (engine-aware label)');
  assert.equal(countIn(runnerView, "'Heuristic Keywords (offline)'"), 1, 'RunnerView labels heuristic runs on the running chip');
  assert.equal(countIn(runnerView, "'Judge: Not configured'"), 1, 'RunnerView labels unconfigured-judge runs on the running chip');
  assert.equal(countIn(testsView, "{renderActiveModelChip('Generating with', effectiveGenConfig)}"), 1, 'TestsView keeps its generating chip call site');
  // SettingsView gets the gen selector inputs as data props (it imports the component).
  const settingsWire = wiringBlock(app, 'SettingsView');
  assert.ok(settingsWire.includes('selectedGenProvider={selectedGenProvider}'), 'SettingsView receives the gen sync derivation');
  assert.ok(settingsWire.includes('genModelList={genModelList}'), 'SettingsView receives the gen model list');
  assert.ok(!settingsWire.includes('renderGenSelector'), 'App no longer passes a renderGenSelector prop into SettingsView');
});

// ---------------------------------------------------------------------------
// shrink gate + the scoped grep gate — the render-prop names survive ONLY
// in their sanctioned homes
// ---------------------------------------------------------------------------

test('App.jsx is strictly net-smaller after the deletion + inline mounts', () => {
  const appLines = app.split('\n').length;
  assert.ok(appLines < 1857, `App.jsx is strictly net-smaller than the 1857-line baseline (807b69c); got ${appLines}`);
});

test('Scoped grep gate — the render-prop names survive only in their sanctioned homes', () => {
  // In-scope consumers are fully clean.
  for (const [label, src] of [['SettingsView', settingsView], ['AiGenWizardModal', wizardModal], ['AiGenWizardResults', wizardResults]]) {
    for (const helper of ['renderGenSelector', 'renderJudgeSelector', 'renderActiveModelChip']) {
      assert.equal(countIn(codeOf(src), helper), 0, `${label} carries zero ${helper} code tokens`);
    }
  }
  // App: zero definitions; the judge/chip names survive only as wiring props.
  assert.equal(countIn(app, 'const renderGenSelector'), 0, 'App has zero renderGenSelector definitions');
  assert.equal(countIn(app, 'const renderJudgeSelector'), 0, 'App has zero renderJudgeSelector definitions');
  assert.equal(countIn(app, 'const renderActiveModelChip'), 0, 'App has zero renderActiveModelChip definitions');
  const appCode = codeOf(app);
  assert.equal(countIn(appCode, 'renderGenSelector'), 0, 'App carries zero renderGenSelector tokens (both consumers import the component)');
  assert.equal(countIn(appCode, 'renderJudgeSelector='), 1, 'App carries exactly the one judge wiring token');
  assert.equal(countIn(appCode, 'renderActiveModelChip='), 2, 'App carries exactly the two chip wiring tokens');
  // Out-of-scope homes: the untouched views keep their call sites.
  assert.equal(countIn(runnerView, 'renderJudgeSelector'), 2, 'RunnerView keeps exactly its judge selector prop destructure + call site');
  assert.equal(countIn(runnerView, 'renderActiveModelChip'), 2, 'RunnerView keeps exactly its chip prop destructure + call site');
  assert.equal(countIn(testsView, 'renderActiveModelChip'), 2, 'TestsView keeps exactly its chip prop destructure + call site');
});

// ---------------------------------------------------------------------------
// the ProvidersContext duplicates are absent — zero definitions tree-wide and
// still unconsumed
// ---------------------------------------------------------------------------

test('ProvidersContext dead selector duplicates are gone (T13 deleted them) and stay unconsumed', () => {
  // Tree-wide census: zero definitions of any dead render-prop anywhere in
  // src — the live components (export function GenModelSelector(, etc.) are
  // the only sanctioned selector implementations.
  for (const name of ['renderGenSelector', 'renderJudgeSelector', 'renderActiveModelChip']) {
    let treeWide = 0;
    for (const file of listSourceFiles()) {
      treeWide += countIn(readSource(file), `const ${name} =`);
    }
    assert.equal(treeWide, 0, `tree-wide census: zero ${name} definitions after T13 (got ${treeWide})`);
    assert.equal(countIn(providersCtx, `const ${name} =`), 0, `the context ${name} duplicate is fully deleted (T13)`);
  }
  const value = providersCtx.slice(providersCtx.indexOf('const value = {'), providersCtx.indexOf('return ('));
  for (const name of ['renderGenSelector', 'renderJudgeSelector', 'renderActiveModelChip']) {
    assert.ok(!value.includes(`    ${name},`), `the context value no longer exposes ${name} (T13 shed it)`);
  }
  // The deletion stays behavior-safe: no consumer pulls them from
  // useProviders() — every in-scope consumer imports the component, every
  // out-of-scope consumer receives a callable prop.
  for (const [label, src] of [['TestsView', testsView], ['RunnerView', runnerView], ['SettingsView', settingsView], ['AiGenWizardResults', wizardResults]]) {
    const idx = src.indexOf('} = useProviders();');
    if (idx === -1) continue;
    const destructureStart = src.lastIndexOf('const {', idx);
    const destructure = src.slice(destructureStart, idx);
    for (const helper of ['renderGenSelector', 'renderJudgeSelector', 'renderActiveModelChip']) {
      assert.ok(!destructure.includes(helper), `${label} does not pull ${helper} from useProviders()`);
    }
  }
});
