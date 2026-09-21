// Contract: src/hooks/useModelPingTests.js owns the model
// connectivity tests — the AI Judge ping (testJudge) and the Test Generator
// ping (testGenerator), including the read-only vault gates with their exact
// toast copy, the shared-config pingModel calls, the redacted error toasts and
// the testingJudge/testingGen busy states. App.jsx consumes the hook through a
// four-name destructure, declares no duplicate bodies and imports no pingModel,
// and keeps the SettingsView wiring byte-identical.
//
// The handler bodies are byte-pinned to the exact source, so any drift fails.
//
// Source-text level because Node cannot import JSX/extensionless specifiers
// under bare node:test (repo convention: see the sibling hook suites,
// tests/judge-merge.unit.test.mjs). Regions are located by content, never by
// line numbers. Fully hermetic: no server, no network, no dev server.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const HOOK_PATH = 'src/hooks/useModelPingTests.js';
const APP_PATH = 'src/App.jsx';

const sourceOf = (relPath) => readFileSync(join(root, relPath), 'utf8').replace(/\r\n/g, '\n');
const readIfExists = (relPath) => { try { return sourceOf(relPath); } catch { return ''; } };
const hook = readIfExists(HOOK_PATH);
const app = sourceOf(APP_PATH);

// --- byte pins (exact source, hook-side) ------------------------------------

const EXPECTED_TEST_JUDGE = [
  '  const testJudge = async () => {',
  '    if (vaultLocked) {',
  "      addToast('The AI Judge is disabled in read-only mode. Unlock your API keys to use it.');",
  '      return;',
  '    }',
  '    setTestingJudge(true);',
  '    try {',
  "      const reply = await pingModel(judgeConfig, 'AI Judge', providers);",
  '      addToast(reply ? `AI Judge OK — replied "${reply.slice(0, 80)}"` : \'AI Judge OK — model responded.\');',
  '    } catch (err) {',
  "      addToast(`Judge test failed: ${projectDiagnosticTextStrict(err)}`, 'error');",
  '    } finally {',
  '      setTestingJudge(false);',
  '    }',
  '  };',
].join('\n');

const EXPECTED_TEST_GENERATOR = [
  '  const testGenerator = async () => {',
  '    if (vaultLocked) {',
  "      addToast('The Test Generator is disabled in read-only mode. Unlock your API keys to use it.');",
  '      return;',
  '    }',
  '    setTestingGen(true);',
  '    try {',
  "      const reply = await pingModel(effectiveGenConfig, 'Test Generator', providers);",
  '      addToast(reply ? `Test Generator OK — replied "${reply.slice(0, 80)}"` : \'Test Generator OK — model responded.\');',
  '    } catch (err) {',
  "      addToast(`Generator test failed: ${projectDiagnosticTextStrict(err)}`, 'error');",
  '    } finally {',
  '      setTestingGen(false);',
  '    }',
  '  };',
].join('\n');

// Extracts a hook-body handler (2-space indent) by declaration content: from
// its `  const <name> = async () => {` line through the handler-closing
// `  };` line (the first such line at exactly that indent).
const extractHandler = (source, name) => {
  const re = new RegExp(`^  const ${name} = async \\(\\) => \\{\\n(?:.*\\n)*?^  \\};$`, 'm');
  const m = re.exec(source);
  assert.ok(m, `handler ${name} found at the hook-body indent`);
  return m[0];
};

// Walks src/ and reports every file containing a needle (declaration sites).
const declarationSites = (needle) => {
  const sites = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const absPath = join(dir, entry.name);
      if (entry.isDirectory()) { walk(absPath); continue; }
      if (!/\.(js|jsx)$/.test(entry.name)) continue;
      const count = readFileSync(absPath, 'utf8').replace(/\r\n/g, '\n').split(needle).length - 1;
      if (count > 0) sites.push({ relPath: absPath.slice(root.length + 1), count });
    }
  };
  walk(join(root, 'src'));
  return sites;
};

const expectSingleSite = (needle, relPath, label) => {
  const sites = declarationSites(needle);
  assert.deepEqual(
    sites.map((s) => `${s.relPath} (${s.count}x)`),
    [`${relPath} (1x)`],
    `${label} must live exactly once, in ${relPath}`
  );
};

// --- the hook owns the connectivity block -----------------------------------

test('useModelPingTests exists with the declared deps bag and helper imports', () => {
  assert.ok(hook, 'src/hooks/useModelPingTests.js exists (T05 extraction landed)');
  assert.ok(hook.includes('export function useModelPingTests({ judgeConfig, effectiveGenConfig, providers, vaultLocked, addToast }) {'),
    'the hook takes exactly the declared deps bag: { judgeConfig, effectiveGenConfig, providers, vaultLocked, addToast }');
  assert.ok(hook.includes("import { pingModel } from '../utils/judge-config';"),
    'the hook imports pingModel from the judge-config module');
  assert.ok(hook.includes("import { projectDiagnosticTextStrict } from '../utils/project-diagnostic.js';"),
    'the hook imports projectDiagnosticTextStrict for the projected error toasts');
  assert.ok(/^import \{ useState \} from 'react';$/m.test(hook),
    'the hook owns the busy states, so it imports useState');
});

test('the busy states are hook-owned with their exact useState(false) shape', () => {
  assert.ok(hook.includes('  const [testingJudge, setTestingJudge] = useState(false);'),
    'testingJudge busy state declared at the hook-body indent');
  assert.ok(hook.includes('  const [testingGen, setTestingGen] = useState(false);'),
    'testingGen busy state declared at the hook-body indent');
  assert.ok(!app.includes('const [testingJudge, setTestingJudge]') && !app.includes('const [testingGen, setTestingGen]'),
    'App no longer declares the busy states (hook-side since T05)');
});

test('testJudge body is byte-identical to the characterized App source, hook-side', () => {
  const body = extractHandler(hook, 'testJudge');
  assert.equal(body, EXPECTED_TEST_JUDGE, 'testJudge drifted from the byte pin');
  const idxGate = body.indexOf('The AI Judge is disabled in read-only mode');
  const idxBusyOn = body.indexOf('setTestingJudge(true)');
  const idxPing = body.indexOf("await pingModel(judgeConfig, 'AI Judge', providers)");
  const idxBusyOff = body.indexOf('setTestingJudge(false)');
  assert.ok(idxBusyOn > idxGate && idxPing > idxBusyOn && idxBusyOff > idxPing,
    'testJudge ordering: gate → setTestingJudge(true) → pingModel → finally setTestingJudge(false)');
});

test('testGenerator body is byte-identical to the characterized App source, hook-side', () => {
  const body = extractHandler(hook, 'testGenerator');
  assert.equal(body, EXPECTED_TEST_GENERATOR, 'testGenerator drifted from the byte pin');
  const idxGate = body.indexOf('The Test Generator is disabled in read-only mode');
  const idxBusyOn = body.indexOf('setTestingGen(true)');
  const idxPing = body.indexOf("await pingModel(effectiveGenConfig, 'Test Generator', providers)");
  const idxBusyOff = body.indexOf('setTestingGen(false)');
  assert.ok(idxBusyOn > idxGate && idxPing > idxBusyOn && idxBusyOff > idxPing,
    'testGenerator ordering: gate → setTestingGen(true) → pingModel → finally setTestingGen(false)');
});

test('the pingModel calls read the shared configs through the declared deps', () => {
  assert.ok(hook.includes("const reply = await pingModel(judgeConfig, 'AI Judge', providers);"),
    'testJudge pings the shared judge config');
  assert.ok(hook.includes("const reply = await pingModel(effectiveGenConfig, 'Test Generator', providers);"),
    'testGenerator pings the shared effective generator config');
});

test('the hook returns the four names App destructures', () => {
  assert.ok(hook.includes('return { testJudge, testGenerator, testingJudge, testingGen };'),
    'the hook exposes { testJudge, testGenerator, testingJudge, testingGen }');
});

// --- App consumes the hook and keeps the view wiring ------------------------

test('App destructures the four names from useModelPingTests with the declared deps bag', () => {
  assert.ok(/const \{ testJudge, testGenerator, testingJudge, testingGen \} = useModelPingTests\(\{ judgeConfig, effectiveGenConfig, providers, vaultLocked, addToast \}\);/.test(app),
    'App consumes the hook: const { testJudge, testGenerator, testingJudge, testingGen } = useModelPingTests({ judgeConfig, effectiveGenConfig, providers, vaultLocked, addToast });');
});

test('App sheds the moved bodies and the now-unused pingModel import', () => {
  assert.ok(!app.includes('const testJudge =') && !app.includes('const testGenerator ='),
    'App no longer declares testJudge/testGenerator (hook-side since T05)');
  assert.ok(/^import \{ buildJudge \} from '\.\/utils\/judge-config';$/m.test(app),
    'App keeps buildJudge (pipeline dep bags) and sheds pingModel from the judge-config import');
});

test('the SettingsView wiring of the four names is byte-identical', () => {
  for (const wiring of [
    'testJudge={testJudge}',
    'testGenerator={testGenerator}',
    'testingJudge={testingJudge}',
    'testingGen={testingGen}',
  ]) {
    assert.ok(app.includes(wiring), `App still wires ${wiring} into SettingsView`);
  }
});

// --- the bodies are pinned exactly once -------------------------------------

test('the connectivity bodies are defined exactly once tree-wide, in the hook', () => {
  expectSingleSite('const testJudge =', HOOK_PATH, 'testJudge');
  expectSingleSite('const testGenerator =', HOOK_PATH, 'testGenerator');
  expectSingleSite('const [testingJudge, setTestingJudge]', HOOK_PATH, 'the testingJudge busy state');
  expectSingleSite('const [testingGen, setTestingGen]', HOOK_PATH, 'the testingGen busy state');
});
