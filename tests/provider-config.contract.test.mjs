// Characterization coverage for the shared provider/sandbox config constants
// (PROVIDER_PRESETS, SANDBOX_PROVIDER_ID, SANDBOX_MODELS) consumed by
// src/App.jsx and src/context/ProvidersContext.jsx (task
// 20260826-005123-mod002 R1 restores them into src/data/app-config.js).
//
// Node cannot import the JSX context module, so — exactly like
// tests/demo-simulation.contract.test.mjs — the suite extracts every
// `const <NAME> = <literal>;` declaration from the source text of the modules
// that may declare them and evaluates it in isolation (node:vm — no product
// code runs here).
//
// The extraction is deliberately location-agnostic: a recursive scan of src/
// enforces that each constant is declared EXACTLY ONCE tree-wide inside one of
// the two legal hosts (src/data/app-config.js after restoration,
// src/context/ProvidersContext.jsx today), so this pinning keeps guarding the
// seed data through the pure relocation without any edit to this file:
//
// - green today (single local copy per constant in ProvidersContext.jsx),
// - green after R1 (single canonical copy in app-config.js + import seam),
// - red on ANY value drift, key re-ordering, escape mangling, leftover
//   duplicate copies, a broken import seam, or a non-pure data module.
//
// Pinned expectations are byte-level: JSON.stringify comparisons enforce
// exact string content (em-dashes, quoted fragments) and object-key order;
// SHA-256 over the RAW literal text pins indentation/quote spelling across
// any relocation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const NAMES = ['PROVIDER_PRESETS', 'SANDBOX_PROVIDER_ID', 'SANDBOX_MODELS'];

// Modules that may hold the declarations AND are plain enough to evaluate the
// extracted literals from (ProvidersContext.jsx today; the pure-data module
// once R1 lands).
const DECLARATION_HOSTS = [
  'src/data/app-config.js',
  'src/context/ProvidersContext.jsx'
];

const APP_CONFIG_PATH = 'src/data/app-config.js';
const CONTEXT_PATH = 'src/context/ProvidersContext.jsx';

// Byte-level goldens copied verbatim from ProvidersContext.jsx lines 12–24
// (the block R1 relocates). Em-dashes are significant.
const EXPECTED_SANDBOX_PROVIDER_ID = 'sandbox';

const EXPECTED_SANDBOX_MODELS = [
  { id: 'Demo Secure', name: 'Demo Secure' },
  { id: 'Demo Vulnerable', name: 'Demo Vulnerable' }
];

const EXPECTED_PROVIDER_PRESETS = [
  { name: 'Groq', endpoint: 'https://api.groq.com/openai/v1/chat/completions', modelsEndpoint: 'https://api.groq.com/openai/v1/models', models: [], note: 'Fast, free tier' },
  { name: 'Gemini', endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', modelsEndpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/models', models: [], note: 'Google AI Studio — OpenAI-compatible endpoint' },
  { name: 'Hugging Face', endpoint: 'https://router.huggingface.co/v1/chat/completions', modelsEndpoint: 'https://router.huggingface.co/v1/models', models: [], note: 'Serverless router' },
  { name: 'OpenRouter', endpoint: 'https://openrouter.ai/api/v1/chat/completions', modelsEndpoint: 'https://openrouter.ai/api/v1/models', models: [], note: 'Hundreds of models' },
  { name: 'Ollama (local)', endpoint: 'http://localhost:11434/v1/chat/completions', modelsEndpoint: 'http://localhost:11434/v1/models', models: [], note: 'Local, no key' }
];

// SHA-256 over the RAW object/array/string literal text (the '[' .. ']',
// '{' .. '}' or quote-delimited slice). This pins the verbatim-move contract
// beyond parsed-value equality: indentation, key order, quote style and
// escape spellings must survive any relocation untouched ("do not reword,
// re-indent, reflow, or re-order anything").
const EXPECTED_LITERALS_SHA256 = {
  PROVIDER_PRESETS: 'ff19fb15f249e591cae469598cbae5dfb3c5425c68f7b17534d48c023e957ff9',
  SANDBOX_PROVIDER_ID: '47895564d147a1e29cbd227e3644b91a3b235246d400572d06dc91befc64e7c8',
  SANDBOX_MODELS: 'c87ea62f7b36531fce6d69831ffb8ac52c0fb44ada59f0b6aefc940b8d65d793'
};

// Comment blocks R1 requires verbatim inside the restored data module
// (em-dashes and double quotes are significant).
const APP_CONFIG_HEADER = [
  '// Static app-level seed/config data shared by src/App.jsx and',
  '// src/context/ProvidersContext.jsx. This module imports nothing (pure data, cycle-free).'
];
const PRESETS_COMMENT_BLOCK = [
  '// Quick-fill presets for the "Add Provider" form — OpenAI-compatible hosts added',
  '// through the exact same flow as any other provider, so there is no special',
  '// treatment for any vendor. Models are fetched from each endpoint (the lists',
  '// change often), so presets only pre-fill the endpoint.'
];
const SANDBOX_COMMENT_BLOCK = [
  '// Sandbox pseudo-provider: simulated models available only while demo mode is',
  '// on. It is not a real connector — targets under it are answered from the',
  '// pre-recorded demo responses — but it is surfaced exactly like any other',
  '// provider option so the first-run experience works without any keys.'
];

function listSourceFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listSourceFiles(abs));
    else files.push(abs);
  }
  return files;
}

function sourceOf(relPath) {
  const absPath = join(root, relPath);
  if (!existsSync(absPath)) return '';
  return readFileSync(absPath, 'utf8');
}

function matchLiteralAt(source, start) {
  const open = source[start];
  if (open === undefined) return null;
  if (open === "'" || open === '"' || open === '`') {
    for (let i = start + 1; i < source.length; i++) {
      if (source[i] === '\\') { i++; continue; }
      if (source[i] === open) return source.slice(start, i + 1);
    }
    return null;
  }
  const pairs = { '[': ']', '{': '}' };
  if (!(open in pairs)) return null;
  const close = pairs[open];
  let depth = 0;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      const strEnd = matchLiteralAt(source, i);
      if (strEnd === null) return null;
      i += strEnd.length - 1;
      continue;
    }
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return null;
}

function declarationRe(name) {
  return new RegExp(`^[ \\t]*(?:export )?const ${name}[ \\t]*=[ \\t]*`, 'gm');
}

// Locates the ONE tree-wide declaration site per constant (wherever it lives)
// and evaluates its literal in isolation.
function resolveConstant(name) {
  const sites = [];
  for (const absPath of listSourceFiles(join(root, 'src'))) {
    const relPath = absPath.slice(root.length + 1);
    const source = sourceOf(relPath);
    for (const match of source.matchAll(declarationRe(name))) {
      const literal = matchLiteralAt(source, match.index + match[0].length);
      assert.ok(literal !== null, `${relPath}: could not extract the ${name} literal`);
      // Normalize out of the vm realm so strict comparisons behave like plain
      // parsed data (same technique as tests/demo-simulation.contract.test.mjs).
      const canonical = JSON.stringify(runInNewContext(`(${literal})`));
      sites.push({ relPath, value: JSON.parse(canonical), literal });
    }
  }
  assert.equal(sites.length, 1, `${name} must be declared exactly once`);
  return sites[0];
}

test('each provider-config constant is declared exactly once across all of src/, in a legal host module', () => {
  for (const name of NAMES) {
    const declaring = [];
    for (const absPath of listSourceFiles(join(root, 'src'))) {
      const relPath = absPath.slice(root.length + 1);
      const count = sourceOf(relPath).match(declarationRe(name))?.length ?? 0;
      if (count > 0) declaring.push(`${relPath} (${count}x)`);
    }
    assert.equal(
      declaring.length,
      1,
      `${name} must have exactly one declaration site tree-wide, found: ${declaring.join(', ')}`
    );
    const site = declaring[0].slice(0, declaring[0].indexOf(' ('));
    assert.ok(
      DECLARATION_HOSTS.includes(site),
      `${name} must live in an evaluable host (${DECLARATION_HOSTS.join(' or ')}), found: ${site}`
    );
  }
});

test('SANDBOX_PROVIDER_ID stays the pinned sandbox id, verbatim bytes included', () => {
  const { value, literal } = resolveConstant('SANDBOX_PROVIDER_ID');
  assert.equal(value, EXPECTED_SANDBOX_PROVIDER_ID);
  assert.equal(
    createHash('sha256').update(literal, 'utf8').digest('hex'),
    EXPECTED_LITERALS_SHA256.SANDBOX_PROVIDER_ID,
    "the 'sandbox' string literal must move verbatim: no re-quote or escape drift"
  );
});

test('SANDBOX_MODELS keeps the pinned Demo Secure / Demo Vulnerable lineup verbatim', () => {
  const { value, literal } = resolveConstant('SANDBOX_MODELS');
  assert.deepEqual(value, EXPECTED_SANDBOX_MODELS);
  // Stringify comparison additionally pins object-key order, not just structure.
  assert.equal(
    JSON.stringify(value),
    JSON.stringify(EXPECTED_SANDBOX_MODELS),
    'model ids, names and key order must survive any relocation verbatim'
  );
  assert.equal(
    createHash('sha256').update(literal, 'utf8').digest('hex'),
    EXPECTED_LITERALS_SHA256.SANDBOX_MODELS,
    'the SANDBOX_MODELS array literal must move verbatim'
  );
});

test('PROVIDER_PRESETS keeps the pinned five vendor quick-fill presets verbatim (incl. em-dash note)', () => {
  const { value, literal } = resolveConstant('PROVIDER_PRESETS');
  assert.deepEqual(value, EXPECTED_PROVIDER_PRESETS);
  assert.equal(
    JSON.stringify(value),
    JSON.stringify(EXPECTED_PROVIDER_PRESETS),
    'preset order, key order and string content must survive any relocation verbatim'
  );
  assert.equal(
    createHash('sha256').update(literal, 'utf8').digest('hex'),
    EXPECTED_LITERALS_SHA256.PROVIDER_PRESETS,
    'the PROVIDER_PRESETS array literal must move verbatim: no re-indent, reflow, re-quote or escape drift'
  );
  assert.ok(
    value[1].note.includes('—') && value[1].note.includes('OpenAI-compatible endpoint'),
    'the Gemini note must keep its em-dash wording byte-for-byte'
  );
});

test('every preset endpoint stays paired with its derived models endpoint and an empty model list', () => {
  const { value } = resolveConstant('PROVIDER_PRESETS');
  assert.equal(value.length, 5, 'exactly five quick-fill presets');
  for (const preset of value) {
    assert.deepEqual(preset.models, [], `${preset.name}: presets only pre-fill the endpoint (models: [])`);
    assert.equal(
      preset.modelsEndpoint,
      preset.endpoint.replace('/chat/completions', '/models'),
      `${preset.name}: modelsEndpoint must remain the chat endpoint with the models suffix`
    );
  }
});

test('ProvidersContext keeps exposing the constants through its public API and context value', () => {
  const ctx = sourceOf(CONTEXT_PATH);
  assert.match(ctx, /^export function ProvidersProvider\(/m, 'ProvidersProvider export stays');
  assert.match(ctx, /^export function useProviders\(/m, 'useProviders export stays');
  assert.match(ctx, /^export \{ ProvidersContext \};$/m, 'ProvidersContext re-export stays');
  assert.match(
    ctx,
    /if \(p === SANDBOX_PROVIDER_ID\) return _useDemoMode;/,
    'providerSelectable keeps gating the sandbox provider on demo mode'
  );
  assert.match(
    ctx,
    /p !== SANDBOX_PROVIDER_ID && providerSelectable\(p, _useDemoMode\)/,
    'helperProviderSelectable keeps excluding the sandbox provider'
  );
  assert.match(
    ctx,
    /if \(selectedProvider === SANDBOX_PROVIDER_ID\) return SANDBOX_MODELS;/,
    'getActiveModelList keeps serving the demo model list under the sandbox provider'
  );
  assert.match(
    ctx,
    /SANDBOX_PROVIDER_ID,\n    SANDBOX_MODELS,\n    PROVIDER_PRESETS,/,
    'context value keeps exposing all three keys to consumers'
  );
});

test("App.jsx keeps wiring './data/app-config' and declares none of the constants locally", () => {
  const app = sourceOf('src/App.jsx');
  assert.equal(
    app.match(/^import \{ PROVIDER_PRESETS, SANDBOX_PROVIDER_ID, SANDBOX_MODELS \} from '\.\/data\/app-config';$/gm)?.length,
    1,
    "App.jsx keeps exactly its './data/app-config' import line (the wiring contract)"
  );
  for (const name of NAMES) {
    assert.doesNotMatch(
      app,
      declarationRe(name),
      `App.jsx must not declare ${name} locally`
    );
  }
});

test('once restored, src/data/app-config.js is a pure 24-line three-export module and the import seam is exact', () => {
  if (!existsSync(join(root, APP_CONFIG_PATH))) return; // vacuous until R1 lands
  const mod = sourceOf(APP_CONFIG_PATH);

  // Pure data: zero import STATEMENTS (the header comment mentions the word
  // "imports", so anchor at statement position).
  assert.doesNotMatch(mod, /^import[ \t]/m, 'app-config.js must import nothing (cycle-free)');
  assert.doesNotMatch(mod, /^export[ \t]+default\b/m, 'no default export');

  // Exactly three inline-exported consts, no other exports.
  const exportedNames = [...mod.matchAll(/^[ \t]*export[ \t]+const[ \t]+(\w+)/gm)].map(m => m[1]);
  assert.deepEqual(
    [...exportedNames].sort(),
    [...NAMES].sort(),
    'app-config.js exports exactly PROVIDER_PRESETS, SANDBOX_PROVIDER_ID and SANDBOX_MODELS'
  );
  assert.equal(
    (mod.match(/^[ \t]*export\b/gm) ?? []).length,
    3,
    'inline-export const style only — exactly three export statements'
  );

  // Header comment occupies lines 1–2 verbatim.
  const rawLines = mod.replace(/\r\n/g, '\n').split('\n');
  if (rawLines.length > 1 && rawLines[rawLines.length - 1] === '') rawLines.pop(); // tolerate a single EOF newline; content lines are what is pinned
  const lines = rawLines;
  assert.deepEqual(
    lines.slice(0, 2),
    APP_CONFIG_HEADER,
    'lines 1–2 must be the shared-module header comment verbatim'
  );
  assert.equal(lines.length, 24, 'app-config.js must stay exactly 24 lines');

  // Relocated doc comments sit directly above their declarations, verbatim.
  assert.ok(
    mod.includes(`${PRESETS_COMMENT_BLOCK.join('\n')}\nexport const PROVIDER_PRESETS = [`),
    'the four-line preset comment block must sit verbatim above PROVIDER_PRESETS'
  );
  assert.ok(
    mod.includes(`${SANDBOX_COMMENT_BLOCK.join('\n')}\nexport const SANDBOX_PROVIDER_ID = 'sandbox';`),
    "the four-line sandbox comment block must sit verbatim above SANDBOX_PROVIDER_ID = 'sandbox'"
  );

  // Import seam in the context module: exactly one occurrence, exact statement,
  // placed after the final '../utils/vault' import and before 'lucide-react'.
  const ctxLines = sourceOf(CONTEXT_PATH).replace(/\r\n/g, '\n').split('\n');
  const seamIdx = ctxLines.findIndex(line =>
    /^import \{ SANDBOX_PROVIDER_ID, SANDBOX_MODELS, PROVIDER_PRESETS \} from '\.\.\/data\/app-config';$/.test(line)
  );
  assert.notEqual(seamIdx, -1, "ProvidersContext must import all three names from '../data/app-config'");
  assert.equal(
    ctxLines.filter(line => line.includes("'../data/app-config'")).length,
    1,
    'exactly one app-config import statement in ProvidersContext'
  );
  const lastVaultImportIdx = ctxLines.reduce(
    (last, line, idx) => (/^import .*from '\.\.\/utils\/vault';$/.test(line) ? idx : last),
    -1
  );
  const lucideImportIdx = ctxLines.findIndex(line => /from 'lucide-react';$/.test(line));
  assert.ok(lastVaultImportIdx > -1, "the '../utils/vault' imports stay put");
  assert.ok(lucideImportIdx > seamIdx, "the app-config import sits before the 'lucide-react' import");
  assert.ok(seamIdx > lastVaultImportIdx, "the app-config import sits after the final '../utils/vault' import");

  // No local re-declarations may survive next to the import seam.
  const ctxSource = ctxLines.join('\n');
  for (const name of NAMES) {
    assert.doesNotMatch(
      ctxSource,
      declarationRe(name),
      `ProvidersContext must not keep a local ${name} copy alongside the import`
    );
  }
});
