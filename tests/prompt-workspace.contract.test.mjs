import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readSource = (path) => readFileSync(join(root, path), 'utf8').replace(/\r\n/g, '\n');
const countIn = (source, needle) => source.split(needle).length - 1;
const normalize = (source) => source.replace(/\s+/g, ' ').trim();
const lineCount = (source) => source.replace(/\n+$/, '').split('\n').length;

const app = readSource('src/App.jsx');
const workspace = readSource('src/components/views/prompts/PromptWorkspace.jsx');
const view = readSource('src/components/views/PromptsView.jsx');
const dialog = readSource('src/components/modals/PromptUpdateDialog.jsx');
const hook = readSource('src/hooks/usePromptUpdate.js');

const WORKSPACE_PROPS = [
  'active', 'buildJudge', 'judgeConfig', 'getPrompt', 'getPromptOverrides',
  'confirmJudgeRewriteApply', 'addToast', 'vaultLocked', 'vaultPassphraseSet',
];
const UPDATE_NAMES = [
  'promptUpdate', 'setPromptUpdate', 'closePromptUpdate', 'applyPromptUpdate',
  'rerunPromptUpdateCanaries', 'runPromptUpdate', 'refinePromptUpdate',
];

test('PromptWorkspace owns the persistent draft and prompt-update state machine', () => {
  assert.match(workspace, /export (?:default )?function PromptWorkspace\(\{/, 'the target exports PromptWorkspace');
  assert.equal(countIn(workspace, 'const [promptDraft, setPromptDraft] = useState({});'), 1, 'one workspace-owned draft survives child remounts');
  assert.equal(countIn(workspace, '= usePromptUpdate({'), 1, 'the workspace adopts the update state machine once');
  const adoptionAt = workspace.indexOf('= usePromptUpdate({');
  const destructure = workspace.slice(workspace.lastIndexOf('const {', adoptionAt), adoptionAt);
  for (const name of UPDATE_NAMES) assert.match(destructure, new RegExp(`\\b${name}\\b`), `workspace binds ${name}`);
  const bag = workspace.slice(adoptionAt, workspace.indexOf('});', adoptionAt));
  for (const dep of ['buildJudge', 'judgeConfig', 'getPrompt', 'setPrompt', 'setPromptDraft', 'confirmJudgeRewriteApply', 'addToast']) {
    assert.match(bag, new RegExp(`\\b${dep}\\b`), `workspace passes ${dep} to usePromptUpdate`);
  }
});

test('App always mounts one workspace and delegates only prompt-tab visibility', () => {
  assert.equal(countIn(app, "import PromptWorkspace from './components/views/prompts/PromptWorkspace';"), 1);
  assert.equal(countIn(app, '<PromptWorkspace'), 1);
  const sectionStart = app.indexOf('/* 4. AI PROMPTS VIEW');
  const sectionEnd = app.indexOf('/* 5. SETTINGS VIEW', sectionStart);
  const section = app.slice(sectionStart, sectionEnd);
  assert.ok(sectionStart > 0 && sectionEnd > sectionStart, 'prompt section remains content-addressable');
  assert.equal(countIn(section, "{activeTab === 'prompts' && ("), 0, 'the workspace itself is not tab-gated');
  const mountStart = section.indexOf('<PromptWorkspace');
  const mount = section.slice(mountStart, section.indexOf('/>', mountStart) + 2);
  const names = [...mount.matchAll(/\b([A-Za-z_$][\w$]*)=\{/g)].map((match) => match[1]);
  assert.deepEqual(names.sort(), [...WORKSPACE_PROPS].sort(), 'App passes exactly the workspace contract');
  assert.equal(countIn(mount, "active={activeTab === 'prompts'}"), 1, 'visibility is data, not workspace lifetime');
});

test('Workspace composes the props-only view and global dialog with exact child contracts', () => {
  assert.match(workspace, /import PromptsView from '\.\.\/PromptsView(?:\.jsx)?';/);
  assert.match(workspace, /import PromptUpdateDialog from '\.\.\/\.\.\/modals\/PromptUpdateDialog(?:\.jsx)?';/);
  assert.match(workspace, /import \{ usePromptUpdate \} from '\.\.\/\.\.\/\.\.\/hooks\/usePromptUpdate(?:\.js)?';/);
  assert.match(workspace, /import \{ setPrompt \} from '\.\.\/\.\.\/\.\.\/utils\/prompts(?:\.js)?';/);
  assert.equal(countIn(workspace, '<PromptsView'), 1);
  assert.equal(countIn(workspace, '<PromptUpdateDialog'), 1);

  const activeGate = workspace.indexOf('{active && (');
  const viewAt = workspace.indexOf('<PromptsView');
  const dialogGate = workspace.indexOf('{promptUpdate && (');
  assert.ok(activeGate > 0 && viewAt > activeGate, 'only PromptsView is visibility-gated');
  assert.ok(dialogGate > viewAt, 'the dialog gate is independent of active so it survives tab changes');

  const viewMount = normalize(workspace.slice(viewAt, workspace.indexOf('/>', viewAt) + 2));
  assert.equal(viewMount, '<PromptsView promptDraft={promptDraft} setPromptDraft={setPromptDraft} setPromptUpdate={setPromptUpdate} getPromptOverrides={getPromptOverrides} vaultLocked={vaultLocked} vaultPassphraseSet={vaultPassphraseSet} addToast={addToast} judgeConfigured={judgeConfigured} />');
  const dialogAt = workspace.indexOf('<PromptUpdateDialog');
  const dialogMount = normalize(workspace.slice(dialogAt, workspace.indexOf('/>', dialogAt) + 2));
  assert.equal(dialogMount, `<PromptUpdateDialog ${UPDATE_NAMES.map((name) => `${name}={${name}}`).join(' ')} promptDraft={promptDraft} getPromptOverrides={getPromptOverrides} vaultLocked={vaultLocked} vaultPassphraseSet={vaultPassphraseSet} />`);
});

test('Blur, read-only, fallback, canary, apply and toast behavior remain in the existing children', () => {
  for (const needle of [
    'value={promptDraft[key] !== undefined ? promptDraft[key] : getPromptOverrides()[key] ?? def}',
    'onBlur={() => { setPrompt(key, promptDraft[key] !== undefined ? promptDraft[key] : def); }}',
    "onClick={() => { resetPrompt(key); setPromptDraft(prev => ({ ...prev, [key]: def })); addToast('Prompt reset to default.'); }}",
    "onClick={() => setPromptUpdate({ key, state: 'feedback', feedback: '', skipCanaries: false, fineTuneFeedback: '', next: '', error: '' })}",
  ]) assert.equal(countIn(view, needle), 1, needle);
  assert.equal(countIn(view, 'disabled={vaultLocked && (vaultPassphraseSet ?? false)}'), 1, 'the reset action keeps the read-only gate');
  assert.equal(countIn(view, 'disabled={(vaultLocked && (vaultPassphraseSet ?? false)) || !judgeConfigured}'), 1, 'the AI-update action adds the helper-model gate');
  assert.equal(countIn(dialog, 'value={promptDraft[promptUpdate.key] !== undefined ? promptDraft[promptUpdate.key] : getPromptOverrides()[promptUpdate.key] ?? DEFAULT_PROMPTS[promptUpdate.key]}'), 2, 'both dialog fallbacks remain');
  assert.equal(countIn(dialog, 'onRerun={rerunPromptUpdateCanaries}'), 1, 'canary rerun remains wired');
  assert.equal(countIn(dialog, '<button onClick={closePromptUpdate} className="btn-secondary">Cancel</button>'), 2, 'both close actions remain wired');
  for (const needle of [
    "if (!next) { addToast('The prompt cannot be empty.'); return; }",
    'if (!(await confirmJudgeRewriteApply(next, promptUpdate.canaries, promptUpdate.canarySource))) return;',
    'if (!setPrompt(promptUpdate.key, next)) {',
    "addToast('Prompt updated with your feedback.', 'success');",
    "const combinedFeedback = `${feedback}\\n\\nAdditional fine-tuning: ${fineTune}`;",
  ]) assert.equal(countIn(hook, needle), 1, needle);
});

test('App sheds direct prompt ownership and is net smaller', () => {
  assert.equal(countIn(app, 'const [promptDraft, setPromptDraft] = useState({});'), 0);
  assert.equal(countIn(app, '= usePromptUpdate({'), 0);
  assert.equal(countIn(app, '<PromptsView'), 0);
  assert.equal(countIn(app, '<PromptUpdateDialog'), 0);
  assert.doesNotMatch(app, /import PromptsView from/);
  assert.doesNotMatch(app, /import PromptUpdateDialog from/);
  assert.doesNotMatch(app, /import \{ usePromptUpdate \}/);
  const promptsImport = /import \{([^}]*)\} from '\.\/utils\/prompts';/.exec(app);
  assert.ok(promptsImport, 'App retains its non-workspace prompt utility surface');
  assert.doesNotMatch(promptsImport[1], /\bsetPrompt\b/, 'workspace-only setPrompt leaves App');
  for (const kept of ['DEFAULT_PROMPTS', 'getPrompt', 'getPromptOverrides']) assert.match(promptsImport[1], new RegExp(`\\b${kept}\\b`));
  // The budget allows 11 lines for transactional setting/error reporting and 2
  // lines for insecure-transport consent-handler wiring; the workspace owns all
  // prompt state, so no prompt ownership moves back to App.
  assert.ok(lineCount(app) - 11 - 2 < 907, `App stays within the extraction budget plus approved persistence/consent handling; got ${lineCount(app)}`);
  assert.ok(lineCount(workspace) > 40, `workspace carries meaningful ownership and composition; got ${lineCount(workspace)}`);
  assert.doesNotMatch(view, /usePromptUpdate\(|useUI\(|useProviders\(/, 'PromptsView remains props-in/events-out');
});
