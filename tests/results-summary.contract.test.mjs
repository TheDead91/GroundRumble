// Contract: App.jsx keeps only live bindings — the useAIGen destructure
// shrinks to the consumed names, the useTests destructure drops the dead
// aliases, the payload/audit-record/vault imports carry only live
// specifiers, and the adoption-contract minimum stays resolvable.
//
// Source-text level because Node cannot import JSX/extensionless specifiers
// under bare node:test (repo convention). Regions are located by content,
// never by line numbers. Fully hermetic: no server, no network, no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP_PATH = 'src/App.jsx';

const sourceOf = (relPath) => readFileSync(join(root, relPath), 'utf8').replace(/\r\n/g, '\n');
const app = sourceOf(APP_PATH);
let workspace = '';
try { workspace = sourceOf('src/components/views/prompts/PromptWorkspace.jsx'); } catch { /* workspace not present */ }
const workspaceLanded = /export (?:default )?function PromptWorkspace\(\{/.test(workspace);

function destructureBlockOf(closerMark) {
  const end = app.indexOf(closerMark);
  assert.ok(end > 0 && !app.slice(0, end).includes(closerMark), `App destructures ${closerMark}`);
  const text = app.slice(0, end + closerMark.length);
  const first = text.lastIndexOf('const {');
  assert.ok(first > 0, `the ${closerMark} destructure has a const { opener`);
  return app.slice(first, end + closerMark.length);
}
const aiGenBlock = destructureBlockOf('} = useAIGen();');
const testsBlock = destructureBlockOf('} = useTests();');
const intakeBlock = destructureBlockOf('} = useAIGeneration({');

// Comment-stripped copy for live-reference accounting (imports excluded; the
// destructure lines bind, not read).
const appCode = app
  .split(aiGenBlock).join('')
  .split(testsBlock).join('')
  .split(intakeBlock).join('')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((l) => !/^\s*import\b/.test(l))
  .map((l) => l.replace(/(?<![:'"])\/\/.*$/, ''))
  .join('\n');
const countIn = (hay, needle) => hay.split(needle).length - 1;
const refCount = (name) => countIn(appCode, name);

const appLines = app.split('\n');
const lineCount = (source) => source.replace(/\n+$/, '').split('\n').length;

// --- the dead mirrors are gone, the survivors remain ------------------------

test('the useAIGen destructure shrinks to exactly the consumed names', () => {
  const block = /const \{([^}]*)\}\s*=\s*useAIGen\(\)/.exec(app);
  assert.ok(block, 'App still consumes the single useAIGen() call');
  const names = block[1].split(',').map((t) => t.trim()).filter(Boolean);
  assert.deepEqual(names, [
    'aiGenUrls', 'setAiGenUrls',
    'aiAddSourceOpen',
    'setAiGeneratedCount',
    'aiWizardOpen',
    'aiPreview', 'setAiPreview',
    'aiPreviewSelected', 'setAiPreviewSelected',
    'recentlyGeneratedIds', 'setRecentlyGeneratedIds',
    'aiRunCtxRef',
  ], 'the destructure binds exactly the twelve consumed names, in order');
});

test('every underscore mirror alias is fully App-gone (A2)', () => {
  for (const alias of [
    '_aiGenSourceKeys', '_setAiGenSourceKeys', '_setAiSourceAssessing', '_aiGenCount',
    '_setAiGenCount', '_aiGenCountInput', '_setAiGenCountInput', '_commitAiGenCount',
    '_updateAiGenCountInput', '_aiGenCollapsed', '_setAiGenCollapsed', '_testsCollapsed',
    '_setTestsCollapsed', '_aiGenerating', '_setAiGenerating', '_aiGenStage', '_setAiGenStage',
    '_aiGenStageDetail', '_setAiGenStageDetail', '_aiGenProgress', '_setAiGenProgress',
    '_aiGenMode', '_setAiGenMode', '_aiSourceProfiles', '_setAiSourceProfiles',
    '_expandedSourceIds', '_toggleSourceExpanded', '_setAiAddSourceOpen', '_setAiAddBusy',
    '_openAddSourceDialog', '_aiGeneratedCount', '_setAiWizardOpen', '_aiWizardStep',
    '_setAiWizardStep', '_aiFineTune', '_setAiFineTune', '_aiRefining', '_setAiRefining',
    '_aiWizardError', '_setAiWizardError', '_aiUsedGuidance', '_setAiUsedGuidance',
    '_aiUsedFineTune', '_setAiUsedFineTune', '_aiDraft', '_setAiDraft', '_aiProfileEdits',
    '_setAiProfileEdits', '_aiProfileExpanded', '_setAiProfileExpanded', '_aiGenBatch',
    '_setAiGenBatch', '_aiGenBudget', '_setAiGenBudget', '_aiAdvancedMode',
    '_setAiAdvancedMode', '_aiGenElapsed', '_setAiGenElapsed',
  ]) {
    assert.ok(!app.includes(alias), `${alias} is fully shed from App.jsx`);
  }
  for (const name of ['_testSortKey', '_testSortDir', '_coveredTechniqueIds', '_autoTests', '_disabledSet', '_runAiCritique', '_validTechniqueIds']) {
    assert.ok(!app.includes(name), `${name} is fully shed from App.jsx`);
  }
});

test('the useTests destructure loses exactly the five aliases and keeps the contract surface', () => {
  const block = /const \{([\s\S]*?)\} = useTests\(\);/.exec(app);
  assert.ok(block, 'App still destructures useTests()');
  const names = block[1].split(/[\n,]+/).map((t) => t.trim().replace(/^\/\/.*$/, '').trim()).filter((t) => t && !t.startsWith('//'));
  assert.ok(!names.includes('testSortKey: _testSortKey'), 'the _testSortKey alias is shed');
  assert.ok(!names.includes('testSortDir: _testSortDir'), 'the _testSortDir alias is shed');
  assert.ok(!names.includes('coveredTechniqueIds: _coveredTechniqueIds'), 'the coveredTechniqueIds alias is shed');
  assert.ok(!names.includes('autoTests: _autoTests'), 'the autoTests alias is shed');
  assert.ok(!names.includes('disabledSet: _disabledSet'), 'the disabledSet alias is shed');
  for (const name of ['customTests', 'disabledTestIds', 'setCustomTests', 'presets', 'presetFeedback', 'savePresets', 'applyPreset', 'saveCurrentAsPreset', 'removePreset', 'selectedTests', 'setSelectedTests', 'toggleTest', 'selectAllTests', 'openAddTest', 'resetTestSuite', 'setNewMarkerReset', 'openEditTest', 'testFilterQ', 'setTestFilterQ', 'testFilterSource', 'setTestFilterSource', 'testFilterTechnique', 'setTestFilterTechnique', 'testFilterEnabled', 'setTestFilterEnabled', 'testSortIndicator', 'clickTestSort', 'sortedTests', 'testFilterOptions', 'filteredSortedTests', 'allTestsById', 'allTestsWithDisabled', 'allTests', 'evalMode', 'setEvalMode']) {
    assert.ok(names.includes(name), `App keeps binding ${name} (owning pins demand presence — T03/T05 contract surface intact)`);
  }
});

test('the useAIGeneration destructure sheds the critique and allow-list aliases', () => {
  assert.ok(/startAiGeneration, runAiGeneration, confirmAiPreview,/.test(intakeBlock), 'the shared hook destructure line carries the post-dedup shape');
  assert.ok(!intakeBlock.includes('runAiCritique'), 'runAiCritique is shed App-side (hook-side flow since T05)');
  assert.ok(!intakeBlock.includes('validTechniqueIds'), 'validTechniqueIds is shed App-side (hook-derived since T04)');
});

test('atlasMatrix stays in exactly its two sanctioned slots (t16 binding survives)', () => {
  assert.equal(refCount('atlasMatrix'), 2, 'atlasMatrix appears exactly twice (useSettings destructure + useAIGeneration deps bag)');
  assert.match(app, /^    atlasMatrix,$/m, 'the useSettings destructure keeps the atlasMatrix line');
});

test('the useTests contract surface (bindCensus) is untouched', () => {
  const bindCensus = app
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*import\b/.test(l))
    .map((l) => l.replace(/(?<![:'"])\/\/.*$/, ''))
    .join('\n');
  for (const name of ['toggleTest', 'selectAllTests', 'openAddTest', 'resetTestSuite', 'setNewMarkerReset', 'disabledTestIds', 'presetFeedback', 'testFilterQ', 'setTestFilterQ', 'testFilterSource', 'setTestFilterSource', 'testFilterTechnique', 'setTestFilterTechnique', 'testFilterEnabled', 'setTestFilterEnabled', 'testSortIndicator', 'clickTestSort', 'sortedTests', 'testFilterOptions', 'filteredSortedTests', 'allTestsWithDisabled', 'setEvalMode', 'customTests', 'setCustomTests', 'presets', 'selectedTests', 'setSelectedTests', 'openEditTest', 'allTestsById', 'allTests', 'evalMode']) {
    assert.ok(countIn(bindCensus, name) >= 1, `${name} stays bound App-side (the T03/T05 owning pins demand presence)`);
  }
});

// --- the import specifiers --------------------------------------------------

test('the payloads import keeps exactly ATLAS_TACTICS', () => {
  assert.equal(countIn(app, /^import .+from '\.\/data\/payloads';$/m), 1, 'exactly one payloads import');
  const line = appLines.find((l) => /^import \{ ATLAS_TACTICS \} from '\.\/data\/payloads';$/.test(l));
  assert.ok(line, `the payloads import line is exactly \`import { ATLAS_TACTICS } from './data/payloads';\``);
  const idx = appLines.findIndex((l) => l.includes("} from './data/payloads';"));
  assert.equal(appLines[idx - 1], '// oxlint-disable-next-line no-unused-vars', 'the oxlint-disable line survives (the payload import is intentionally retained)');
  for (const spec of ['PRESET_TESTS', 'generateTestsForMatrix']) {
    assert.ok(!appCode.includes(spec), `${spec} has zero live reads in App.jsx (zero live refs confirmed pre-landing)`);
  }
});

test('the audit-record import is fully shed (PROMPT_SOURCING-style module sourcing moved provider-side)', () => {
  assert.ok(!app.includes("from './utils/audit-record';"), 'App sources no audit-record module anymore');
  for (const spec of ['redactAuditRecord', 'redactAuditResult', 'summarizeAuditRecord']) {
    assert.ok(!app.includes(spec), `${spec} is fully shed from App.jsx`);
  }
});

test('the vault import keeps exactly vaultSupported + saveSourceUrls', () => {
  assert.match(app, /^import \{ vaultSupported, saveSourceUrls \} from '\.\/utils\/vault';$/m, 'the post-dedup vault import line is byte-pinned');
  assert.equal(refCount('loadAuditHistory'), 0, 'loadAuditHistory has zero live reads and is App-gone');
  assert.equal(refCount('saveAuditHistory'), 0, 'saveAuditHistory has zero live reads and is App-gone');
  const idx = appLines.findIndex((l) => l.includes("} from './utils/vault';"));
  assert.equal(appLines[idx - 1], '// oxlint-disable-next-line no-unused-vars', 'the vault oxlint-disable line survives (the vault import is intentionally retained)');
  assert.ok(refCount('vaultSupported') >= 1, 'vaultSupported stays live (resetAllData)');
});

// --- consumed surface + strictly-net-smaller gate ---------------------------

test('every consumed name is still read outside the destructures', () => {
  for (const name of ['aiGenUrls', 'setAiGenUrls', 'aiAddSourceOpen', 'setAiGeneratedCount', 'aiWizardOpen', 'aiPreview', 'setAiPreview', 'aiPreviewSelected', 'setAiPreviewSelected', 'recentlyGeneratedIds', 'setRecentlyGeneratedIds', 'aiRunCtxRef']) {
    assert.ok(refCount(name) >= 1, `${name} is consumed App-side`);
  }
  assert.equal(countIn(app, 'useAIGen()'), 1, 'exactly one useAIGen() call');
  assert.ok(refCount('toggleAiGenSource') >= 1 && refCount('openAiWizard') >= 1, 'the hook-based actions still bind');
  assert.ok(refCount('runAiGeneration') >= 1 && refCount('startAiGeneration') >= 1, 'the pipeline actions still bind');
});

test('App.jsx is strictly net-smaller by the sanctioned 52-line dedupe shed', () => {
  assert.ok(lineCount(app) > 0, 'App.jsx readable');
  if (workspaceLanded) {
    // The budget allows 11 lines for transactional setting/error reporting
    // and 2 lines for the insecure-transport consent handler import and its
    // askConfirm wiring; the rest stays within the dedupe line budget.
    assert.ok(lineCount(app) - 11 - 2 < 907, `App.jsx stays within the extraction budget plus approved persistence/consent handling (landed ${lineCount(app)})`);
    assert.ok(lineCount(workspace) > 40, `PromptWorkspace carries the moved state, hook and child mounts (landed ${lineCount(workspace)} lines)`);
    assert.equal(countIn(app, '<PromptWorkspace'), 1, 'App mounts the real workspace exactly once');
    assert.equal(countIn(workspace, 'const [promptDraft, setPromptDraft] = useState({});'), 1, 'workspace mass includes the moved draft ownership');
    assert.equal(countIn(workspace, '= usePromptUpdate({'), 1, 'workspace mass includes the moved hook adoption');
  } else {
    assert.equal(lineCount(app), 905, `App.jsx shrank exactly to 905 lines by the sanctioned dedupe shed (landed ${lineCount(app)})`);
  }
});
