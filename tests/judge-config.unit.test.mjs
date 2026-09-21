// Contract: the AI-judge support helpers live in pure utility modules —
//   src/utils/judge-config.js   → buildJudge(cfg, providers), pingModel(cfg, label, providers)
//   src/utils/judge-canaries.js → runJudgeCanaries(judge, systemPrompt, userPromptTemplate = null)
// and src/App.jsx imports them instead of declaring them inside the component.
// `providers` is a parameter; every other byte of the three helpers is
// byte-pinned below, modulo the 4-space → 2-space indentation and pingModel's
// internal `buildJudge(cfg, providers)` call.
//
// Behavioral cases run the REAL modules:
// - buildJudge is exercised through its real resolveOpenAIEndpoint import;
// - pingModel is exercised end-to-end through the real queryModel against a
//   local 127.0.0.1 mock (localhost is exempt from the insecure-transport and
//   private-network gates), capturing the exact request bytes it sends;
// - runJudgeCanaries passthrough is exercised through the real
//   evaluateJudgeCanaries chain with judge = null (deterministic keyword
//   fallback — no network); its hard-failure branch is exercised by extracting
//   the shipped declaration and evaluating it with a rejecting collaborator
//   injected (convention: the sibling bundled-entry suites).
// Standalone under bare `node --test`; the only server is 127.0.0.1, spawned
// and closed within the suite.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildJudge, pingModel } from '../src/utils/judge-config.js';
import { runJudgeCanaries } from '../src/utils/judge-canaries.js';
import { redactSensitiveText } from '../src/utils/redact.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const CONFIG_PATH = 'src/utils/judge-config.js';
const CANARIES_PATH = 'src/utils/judge-canaries.js';
const APP_PATH = 'src/App.jsx';

const sourceOf = (relPath) => readFileSync(join(root, relPath), 'utf8').replace(/\r\n/g, '\n');
const configSource = sourceOf(CONFIG_PATH);
const canariesSource = sourceOf(CANARIES_PATH);
const appSource = sourceOf(APP_PATH);
// The prompt-update flow (the consumer of runJudgeCanaries) lives in
// src/hooks/usePromptUpdate.js, so the import pin below is anchored to that
// hook (tests/prompt-update.unit.test.mjs: zero \brunJudgeCanaries\b in App).
const hookSource = sourceOf('src/hooks/usePromptUpdate.js');

// ---------------------------------------------------------------------------
// Byte pins — the exact module text each helper must carry. Everything
// below the parameter lists is the exact helper source, de-indented by two
// spaces.
// ---------------------------------------------------------------------------

const EXPECTED_BUILD_JUDGE = `// Resolves the effective judge (provider + model + credentials) from the saved
// judge config and the configured providers. Returns null if the provider
// isn't configured or enabled. Every provider is a user-defined provider.
export const buildJudge = (cfg, providers) => {
  const cp = providers.find(p => p.id === cfg.provider && p.enabled !== false);
  if (!cp) return null;
  let headers = {};
  if (cp.headers) {
    try { headers = JSON.parse(cp.headers); } catch { /* ignore malformed headers */ }
  }
  return {
    provider: cp.id,
    model: cfg.model || cp.models?.[0] || '',
    endpoint: cp.connector === 'raw' ? cp.endpoint : resolveOpenAIEndpoint(cp).chatEndpoint,
    apiKey: cp.apiKey || '',
    rpm: cp.rpm || 0,
    connector: cp.connector || 'openai',
    method: cp.method || 'POST',
    headers,
    bodyTemplate: cp.bodyTemplate,
    responsePath: cp.responsePath || 'choices.0.message.content',
    allowPrivate: cp.allowPrivate === true,
    allowInsecureTransport: cp.allowInsecureTransport === true
  };
};`;

const EXPECTED_PING_MODEL = `// Lightweight connectivity test: one tiny chat message ("pong") against the
// configured model. No heavy evaluation / generation payloads.
export const pingModel = async (cfg, label, providers) => {
  const judge = buildJudge(cfg, providers);
  if (!judge) throw new Error(\`This \${label} needs a configured key/endpoint — add it in Settings → Providers.\`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('Timeout', 'TimeoutError')), 20000);
  try {
    const text = await queryModel(
      judge.provider,
      judge.model || '',
      '',
      'Reply with exactly: pong',
      providers,
      controller.signal
    );
    return String(text || '').trim();
  } finally {
    clearTimeout(timer);
  }
};`;

const EXPECTED_RUN_JUDGE_CANARIES = `export const runJudgeCanaries = async (judge, systemPrompt, userPromptTemplate = null) => {
  try {
    return await evaluateJudgeCanaries(judge, systemPrompt, undefined, userPromptTemplate);
  } catch (err) {
    return [{ name: 'Canary evaluation', expected: '-', status: 'INCONCLUSIVE', reasoning: redactSensitiveText(err?.message || err), diverged: true }];
  }
};`;

test('judge-config.js carries buildJudge and pingModel verbatim (modulo indentation + lifted providers param)', () => {
  assert.ok(configSource.includes(EXPECTED_BUILD_JUDGE), 'buildJudge drifted from the byte pin');
  assert.ok(configSource.includes(EXPECTED_PING_MODEL), 'pingModel drifted from the byte pin');
});

test('judge-canaries.js carries runJudgeCanaries verbatim', () => {
  assert.ok(canariesSource.includes(EXPECTED_RUN_JUDGE_CANARIES), 'runJudgeCanaries drifted from the byte pin');
});

// ---------------------------------------------------------------------------
// Module structure: exports, imports, purity
// ---------------------------------------------------------------------------

test('judge-config.js imports its collaborators through the node-resolvable api entry and stays React-free', () => {
  assert.match(configSource, /^import \{ queryModel, resolveOpenAIEndpoint \} from '\.\/api\/index\.js';$/m);
  assert.match(configSource, /^export const buildJudge = /m);
  assert.match(configSource, /^export const pingModel = /m);
  assert.doesNotMatch(configSource, /from ['"]react['"]/);
  assert.doesNotMatch(configSource, /\.jsx['"]/);
});

test('judge-canaries.js imports its collaborators and stays React-free', () => {
  assert.match(canariesSource, /^import \{ evaluateJudgeCanaries \} from '\.\/api\/index\.js';$/m);
  assert.match(canariesSource, /^import \{ redactSensitiveText \} from '\.\/redact\.js';$/m);
  assert.match(canariesSource, /^export const runJudgeCanaries = /m);
  assert.doesNotMatch(canariesSource, /from ['"]react['"]/);
  assert.doesNotMatch(canariesSource, /\.jsx['"]/);
});

// ---------------------------------------------------------------------------
// Tree-wide declaration sites: exactly one copy of each helper, in its module
// ---------------------------------------------------------------------------

function listSourceFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === 'node_modules') continue;
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listSourceFiles(abs));
    else if (/\.(jsx|js|mjs)$/.test(entry.name)) files.push(abs);
  }
  return files;
}

function declarationSites(name) {
  const re = new RegExp(`^[ \\t]*(?:export )?const ${name}[ \\t]*=`, 'gm');
  return listSourceFiles(join(root, 'src'))
    .map((absPath) => {
      const relPath = absPath.slice(root.length + 1);
      return { relPath, count: sourceOf(relPath).match(re)?.length ?? 0 };
    })
    .filter((site) => site.count > 0);
}

test('buildJudge and pingModel are declared exactly once tree-wide, in judge-config.js', () => {
  for (const name of ['buildJudge', 'pingModel']) {
    const sites = declarationSites(name);
    assert.deepEqual(
      sites.map((s) => `${s.relPath} (${s.count}x)`),
      [`${CONFIG_PATH} (1x)`],
      `${name} must live exactly once, in ${CONFIG_PATH}`
    );
  }
});

test('runJudgeCanaries is declared exactly once tree-wide, in judge-canaries.js', () => {
  const sites = declarationSites('runJudgeCanaries');
  assert.deepEqual(
    sites.map((s) => `${s.relPath} (${s.count}x)`),
    [`${CANARIES_PATH} (1x)`],
    'runJudgeCanaries must live exactly once, in judge-canaries.js'
  );
});

// ---------------------------------------------------------------------------
// App.jsx re-pointing: imports instead of local definitions
// ---------------------------------------------------------------------------

test('App.jsx imports the helpers from the new modules and declares none of them locally', () => {
  // pingModel's consumers (testJudge/testGenerator) live in
  // src/hooks/useModelPingTests.js, so App may shed pingModel from the import
  // and the hook imports it — the pin resolves across the App ∪ model-ping-hook
  // union either way.
  assert.match(appSource, /^import \{ buildJudge(, pingModel)? \} from '\.\/utils\/judge-config';$/m);
  const pingHook = existsSync(join(root, 'src/hooks/useModelPingTests.js')) ? sourceOf('src/hooks/useModelPingTests.js') : '';
  if (pingHook) {
    assert.match(pingHook, /^import \{ pingModel \} from '\.\.\/utils\/judge-config';$/m);
  }
  assert.match(hookSource, /^import \{ runJudgeCanaries \} from '\.\.\/utils\/judge-canaries';$/m);
  assert.doesNotMatch(appSource, /^ {2}const buildJudge = /m);
  assert.doesNotMatch(appSource, /^ {2}const pingModel = /m);
  assert.doesNotMatch(appSource, /^ {2}const runJudgeCanaries = /m);
});

test('App.jsx drops the imports that only the moved helpers needed', () => {
  assert.doesNotMatch(appSource, /queryModel/, 'queryModel is only used by pingModel — its import must go');
  assert.doesNotMatch(appSource, /resolveOpenAIEndpoint/, 'resolveOpenAIEndpoint is only used by buildJudge — its import must go');
  assert.doesNotMatch(appSource, /evaluateJudgeCanaries/, 'evaluateJudgeCanaries is only used by runJudgeCanaries — its import must go');
});

test('App.jsx passes providers to every pingModel call site', () => {
  // The call sites resolve from the App ∪ model-ping-hook union; every call
  // still passes providers.
  const pingHook = existsSync(join(root, 'src/hooks/useModelPingTests.js')) ? sourceOf('src/hooks/useModelPingTests.js') : '';
  const appUnionHook = `${appSource}\n${pingHook}`;
  assert.ok(
    appUnionHook.includes("await pingModel(judgeConfig, 'AI Judge', providers)"),
    "the AI-Judge ping call must pass providers"
  );
  assert.ok(
    appUnionHook.includes("await pingModel(effectiveGenConfig, 'Test Generator', providers)"),
    "the Test-Generator ping call must pass providers"
  );
  assert.doesNotMatch(appUnionHook, /pingModel\(([^(),]*),[^()]*\)\)/, 'no two-argument pingModel call may remain');
});

test('the downstream consumers keep receiving a buildJudge that accepts (cfg, providers)', () => {
  assert.ok(appSource.includes('buildJudge={buildJudge}'), 'SettingsView still receives the buildJudge prop');
  const auditRun = sourceOf('src/hooks/useAuditRun.js');
  const aiGen = sourceOf('src/hooks/useAIGeneration.js');
  assert.match(auditRun, /buildJudge\(judgeConfig, providers\)/);
  assert.match(aiGen, /buildJudge\(judgeConfig, providers\)/);
  assert.match(aiGen, /buildJudge\(effectiveGenConfig, providers\)/);
});

// ---------------------------------------------------------------------------
// buildJudge — behavioral matrix against the real module
// ---------------------------------------------------------------------------

const FULL_PROVIDER = {
  id: 'prov-1',
  enabled: true,
  endpoint: 'https://api.example.com/v1',
  connector: 'openai',
  method: 'PUT',
  headers: '{"X-Custom":"abc","Authorization":"Bearer override"}',
  apiKey: 'k-123',
  rpm: 120,
  models: ['m1', 'm2'],
  bodyTemplate: 'template-{{model}}',
  responsePath: 'custom.response.path',
  allowPrivate: true,
  allowInsecureTransport: true
};

test('buildJudge resolves a fully-populated enabled provider to the exact judge shape', () => {
  const judge = buildJudge({ provider: 'prov-1', model: 'custom-model' }, [FULL_PROVIDER]);
  assert.deepEqual(judge, {
    provider: 'prov-1',
    model: 'custom-model',
    endpoint: 'https://api.example.com/v1/chat/completions',
    apiKey: 'k-123',
    rpm: 120,
    connector: 'openai',
    method: 'PUT',
    headers: { 'X-Custom': 'abc', 'Authorization': 'Bearer override' },
    bodyTemplate: 'template-{{model}}',
    responsePath: 'custom.response.path',
    allowPrivate: true,
    allowInsecureTransport: true
  });
  assert.deepEqual(
    Object.keys(judge),
    ['provider', 'model', 'endpoint', 'apiKey', 'rpm', 'connector', 'method', 'headers', 'bodyTemplate', 'responsePath', 'allowPrivate', 'allowInsecureTransport'],
    'the judge object keeps its exact key order'
  );
});

test('buildJudge returns null for a missing provider and for a disabled provider', () => {
  assert.equal(buildJudge({ provider: 'nope' }, [FULL_PROVIDER]), null, 'unknown provider id → null');
  assert.equal(buildJudge({ provider: 'prov-1' }, [{ ...FULL_PROVIDER, enabled: false }]), null, 'enabled: false → null');
});

test('buildJudge endpoint resolution: raw connector passes the endpoint through byte-exact, openai appends /chat/completions', () => {
  const rawProvider = { id: 'raw-1', endpoint: 'http://127.0.0.1:11434/api/generate///', connector: 'raw' };
  const openaiProvider = { id: 'oa-1', endpoint: 'https://api.example.com/v1', connector: 'openai' };
  const singularProvider = { id: 'oa-2', endpoint: 'https://api.example.com/v1/chat/completion', connector: 'openai' };
  const providers = [rawProvider, openaiProvider, singularProvider];
  assert.equal(buildJudge({ provider: 'raw-1' }, providers).endpoint, 'http://127.0.0.1:11434/api/generate///',
    'raw endpoints are passed through untouched (no resolveOpenAIEndpoint normalization on the raw branch)');
  assert.equal(buildJudge({ provider: 'oa-1' }, providers).endpoint, 'https://api.example.com/v1/chat/completions');
  assert.equal(buildJudge({ provider: 'oa-2' }, providers).endpoint, 'https://api.example.com/v1/chat/completions',
    'a singular /chat/completion path is normalized to the plural form');
});

test('buildJudge tolerates malformed headers JSON and passes parsed JSON through verbatim', () => {
  const base = { id: 'h', endpoint: 'https://api.example.com/v1' };
  const mk = (headers) => buildJudge({ provider: 'h' }, [{ ...base, headers }]);
  assert.deepEqual(mk('{oops').headers, {}, 'malformed JSON degrades to {} instead of throwing');
  assert.deepEqual(mk('{"X-A":"b"}').headers, { 'X-A': 'b' }, 'valid JSON is parsed');
  assert.deepEqual(mk('').headers, {}, 'falsy headers stay {}');
  assert.deepEqual(mk('null').headers, null, 'JSON "null" parses to null (current behavior, pinned)');
  assert.deepEqual(mk('[]').headers, [], 'non-object JSON is passed through as parsed');
});

test('buildJudge applies the documented defaults for rpm, responsePath, connector, method, model and allow flags', () => {
  const bare = { id: 'bare', endpoint: 'https://api.example.com/v1' };
  const judge = buildJudge({ provider: 'bare' }, [bare, FULL_PROVIDER]);
  assert.equal(judge.rpm, 0, 'rpm defaults to 0');
  assert.equal(judge.responsePath, 'choices.0.message.content', 'responsePath default');
  assert.equal(judge.connector, 'openai', 'connector default');
  assert.equal(judge.method, 'POST', 'method default');
  assert.equal(judge.model, '', 'a provider without models falls back to the empty string');
  assert.equal(buildJudge({ provider: 'prov-1' }, [bare, FULL_PROVIDER]).model, 'm1', 'model falls back to the first configured model');
  assert.equal(buildJudge({ provider: 'prov-1', model: 'explicit' }, [bare, FULL_PROVIDER]).model, 'explicit', 'an explicit cfg.model wins over the provider default');
  assert.equal(buildJudge({ provider: 'prov-1', model: '' }, [bare, FULL_PROVIDER]).model, 'm1', 'empty-string cfg.model falls through to the provider default');
  assert.equal(judge.apiKey, '', 'apiKey defaults to empty string');
  assert.equal(judge.bodyTemplate, undefined);
  assert.ok('bodyTemplate' in judge, 'bodyTemplate key is always present');
  assert.equal(judge.allowPrivate, false, 'allowPrivate defaults to false');
  assert.equal(judge.allowInsecureTransport, false, 'allowInsecureTransport defaults to false');
  // Strict boolean semantics: only the exact primitive `true` unlocks the flags.
  const sneaky = { id: 'sneaky', endpoint: 'https://api.example.com/v1', allowPrivate: 'yes', allowInsecureTransport: 1 };
  const sj = buildJudge({ provider: 'sneaky' }, [sneaky]);
  assert.equal(sj.allowPrivate, false, 'truthy-but-not-true allowPrivate stays false');
  assert.equal(sj.allowInsecureTransport, false, 'truthy-but-not-true allowInsecureTransport stays false');
});

// ---------------------------------------------------------------------------
// pingModel — error path + real end-to-end ping against a local mock
// ---------------------------------------------------------------------------

test('pingModel rejects with the exact settings-pointer message when no judge is configured', async () => {
  await assert.rejects(
    pingModel({ provider: 'ghost' }, 'AI Judge', []),
    (err) => err instanceof Error && err.message ===
      'This AI Judge needs a configured key/endpoint — add it in Settings → Providers.'
  );
  await assert.rejects(
    pingModel({ provider: 'ghost' }, 'Test Generator', []),
    (err) => err.message === 'This Test Generator needs a configured key/endpoint — add it in Settings → Providers.',
    'the label is interpolated into the message'
  );
});

function startPongMock(content) {
  const requests = [];
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      requests.push({ url: req.url, method: req.method, headers: req.headers, body: JSON.parse(raw) });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }] }));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, requests, port: server.address().port }));
  });
}

test('pingModel sends the exact one-shot pong request through the real queryModel and returns the trimmed reply', async () => {
  const { server, requests, port } = await startPongMock('  PONG from the wire \n');
  try {
    const provider = {
      id: 'mock-1',
      endpoint: `http://127.0.0.1:${port}/v1`,
      connector: 'openai',
      apiKey: 'sk-mock-key-1234567890',
      models: ['mock-model'],
      allowPrivate: true
    };
    const reply = await pingModel({ provider: 'mock-1', model: 'mock-model' }, 'AI Judge', [provider]);
    assert.equal(reply, 'PONG from the wire', 'the reply is trimmed');
    assert.equal(requests.length, 1, 'exactly one HTTP request');
    const req = requests[0];
    assert.equal(req.method, 'POST');
    assert.equal(req.url, '/v1/chat/completions');
    assert.equal(req.headers.authorization, 'Bearer sk-mock-key-1234567890');
    assert.deepEqual(req.body.messages, [{ role: 'user', content: 'Reply with exactly: pong' }],
      'the one-shot ping payload — user message only, no system prompt');
    assert.equal(req.body.model, 'mock-model');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('pingModel normalizes a falsy reply to the empty string', async () => {
  const { server, port } = await startPongMock('');
  try {
    const provider = { id: 'mock-1', endpoint: `http://127.0.0.1:${port}/v1`, connector: 'openai', apiKey: 'k', models: ['m'], allowPrivate: true };
    assert.equal(await pingModel({ provider: 'mock-1' }, 'AI Judge', [provider]), '');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('pingModel tolerates a provider without a model list (empty model falls through the || guard)', async () => {
  const { server, requests, port } = await startPongMock('  PONG no-models ');
  try {
    const provider = { id: 'raw-nomodels', endpoint: `http://127.0.0.1:${port}/v1`, connector: 'openai', apiKey: 'k', allowPrivate: true };
    const reply = await pingModel({ provider: 'raw-nomodels' }, 'AI Judge', [provider]);
    assert.equal(reply, 'PONG no-models', 'the ping still round-trips when no model is configured');
    assert.equal(requests[0].body.model, '', 'the resolved judge model falls back to the empty string');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

// ---------------------------------------------------------------------------
// runJudgeCanaries — passthrough through the real chain + hard-failure branch
// ---------------------------------------------------------------------------

test('runJudgeCanaries passes through the real evaluateJudgeCanaries results verbatim (keyword fallback, judge = null)', async () => {
  const out = await runJudgeCanaries(null, 'SYSTEM PROMPT');
  assert.deepEqual(out, [
    {
      name: 'Secure refusal',
      expected: 'SECURE',
      status: 'INCONCLUSIVE',
      reasoning: 'No AI Judge configured - Keyword Evaluation Fallback - No refusal or failure markers recognized; keyword evaluation cannot classify this response as SECURE or VULNERABLE.',
      diverged: true
    },
    {
      name: 'Vulnerable compliance',
      expected: 'VULNERABLE',
      status: 'INCONCLUSIVE',
      reasoning: 'No AI Judge configured - Keyword Evaluation Fallback - No refusal or failure markers recognized; keyword evaluation cannot classify this response as SECURE or VULNERABLE.',
      diverged: true
    },
    {
      name: 'Ambiguous neutrality',
      expected: 'INCONCLUSIVE',
      status: 'INCONCLUSIVE',
      reasoning: 'No AI Judge configured - Keyword Evaluation Fallback - No refusal or failure markers recognized; keyword evaluation cannot classify this response as SECURE or VULNERABLE.',
      diverged: false
    }
  ]);
  for (const canary of out) {
    assert.deepEqual(
      Object.keys(canary),
      ['name', 'expected', 'status', 'reasoning', 'diverged'],
      'each canary result keeps the exact result shape'
    );
  }
});

// ---------------------------------------------------------------------------
// Extraction machinery (brace-aware, comment/string/template safe) for the
// hard-failure branch — the real evaluateJudgeCanaries never rejects (each
// canary catches internally), so the wrapper's catch path is exercised by
// evaluating the shipped declaration text with a rejecting collaborator
// injected. The bytes evaluated are the exact shipped bytes.
// ---------------------------------------------------------------------------

function scanGroup(src, i) {
  const closeOf = { '{': '}', '(': ')', '[': ']', "'": "'", '"': '"', '`': '`' };
  const open = src[i];
  const close = closeOf[open];
  if (!close) throw new Error(`scanGroup: not an opener at ${i}: ${JSON.stringify(open)}`);
  i += 1;
  while (i < src.length) {
    const c = src[i];
    if (c === '\\') { i += 2; continue; }
    if (open === '`' || open === "'" || open === '"') {
      if (c === open) return i + 1;
      if (open === '`' && c === '$' && src[i + 1] === '{') { i = scanGroup(src, i + 1); continue; }
      i += 1; continue;
    }
    if (c === '/' && src[i + 1] === '/') { const nl = src.indexOf('\n', i); i = nl < 0 ? src.length : nl + 1; continue; }
    if (c === '/' && src[i + 1] === '*') { const end = src.indexOf('*/', i); i = end < 0 ? src.length : end + 2; continue; }
    if (closeOf[c]) { i = scanGroup(src, i); continue; }
    if (c === close) return i + 1;
    i += 1;
  }
  throw new Error('scanGroup: unbalanced source');
}

function extractExportedDeclaration(relPath, name) {
  const source = sourceOf(relPath);
  const m = source.match(new RegExp(`^[ \\t]*export const ${name}[ \\t]*=`, 'm'));
  assert.ok(m, `${relPath}: export const ${name} not found`);
  const bodyStart = source.indexOf('{', m.index);
  const bodyEnd = scanGroup(source, bodyStart);
  return source.slice(m.index + 'export '.length, bodyEnd) + ';';
}

const loadRunJudgeCanaries = ({ evaluateJudgeCanaries }) => {
  const snippet = extractExportedDeclaration(CANARIES_PATH, 'runJudgeCanaries');
  const factory = new Function('evaluateJudgeCanaries', 'redactSensitiveText', `'use strict';\n${snippet}\nreturn runJudgeCanaries;`);
  return factory(evaluateJudgeCanaries, redactSensitiveText);
};

test('runJudgeCanaries forwards (judge, systemPrompt, undefined, template) and returns the resolved list as-is', async () => {
  const calls = [];
  const stub = async (...args) => { calls.push(args); return [{ name: 'c1', status: 'SECURE' }]; };
  const runJudgeCanaries = loadRunJudgeCanaries({ evaluateJudgeCanaries: stub });
  const judge = { provider: 'p', model: 'm', endpoint: 'https://x' };
  const out = await runJudgeCanaries(judge, 'SYSTEM', 'TEMPLATE');
  assert.equal(out[0].name, 'c1', 'the resolved canary list is returned as-is');
  assert.deepEqual(calls, [[judge, 'SYSTEM', undefined, 'TEMPLATE']],
    'called as (judge, systemPrompt, undefined, userPromptTemplate) — the signal slot stays empty');
  calls.length = 0;
  await runJudgeCanaries(judge, 'SYSTEM');
  assert.deepEqual(calls, [[judge, 'SYSTEM', undefined, null]], 'userPromptTemplate defaults to null');
});

test('runJudgeCanaries normalizes a hard failure into a single redacted INCONCLUSIVE diverged marker', async () => {
  const rejecting = async () => { throw new Error('judge exploded Bearer abc.def.ghi'); };
  const runJudgeCanaries = loadRunJudgeCanaries({ evaluateJudgeCanaries: rejecting });
  assert.deepEqual(
    await runJudgeCanaries({ provider: 'p' }, 'SYSTEM'),
    [{ name: 'Canary evaluation', expected: '-', status: 'INCONCLUSIVE', reasoning: 'judge exploded [REDACTED_AUTH]', diverged: true }],
    'the real redactSensitiveText scrubs the error message'
  );

  const stringThrow = async () => { throw 'a raw string secret sk-abcdefghijklmnop1234'; };
  const rjc2 = loadRunJudgeCanaries({ evaluateJudgeCanaries: stringThrow });
  assert.deepEqual(
    await rjc2({ provider: 'p' }, 'SYSTEM'),
    [{ name: 'Canary evaluation', expected: '-', status: 'INCONCLUSIVE', reasoning: 'a raw string secret [REDACTED_KEY]', diverged: true }],
    'non-Error throwables fall back to the thrown value itself'
  );

  const objectThrow = async () => { throw { code: 7 }; };
  const rjc3 = loadRunJudgeCanaries({ evaluateJudgeCanaries: objectThrow });
  const marker = (await rjc3({ provider: 'p' }, 'SYSTEM'))[0];
  assert.equal(marker.reasoning, '[object Object]', 'message-less objects degrade to their stringification');
  assert.equal(marker.diverged, true);
  assert.equal(marker.status, 'INCONCLUSIVE');
});
