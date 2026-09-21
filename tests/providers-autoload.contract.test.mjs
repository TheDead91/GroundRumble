// Regression guard for the react-hooks(exhaustive-deps) warning at
// src/context/ProvidersContext.jsx:401: autoLoadProviderModels called
// deriveModelsEndpoint inside its filter without listing it in the useCallback
// dependence array. The binding is a stable useCallback (deps []), so adding it
// to the array clears the lint finding without changing runtime behavior.
//
// Source-text level because Node cannot import JSX under bare node:test (repo
// convention: see sibling source-text contract tests).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ctxSrc = readFileSync(join(root, 'src/context/ProvidersContext.jsx'), 'utf8').replace(/\r\n/g, '\n');

// ---------------------------------------------------------------------------
// Brace-aware extraction (comment/string/template safe)
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

function extractUseCallbackSource(src, name) {
  const m = src.match(new RegExp(`const ${name} = useCallback\\(`));
  assert.ok(m, `ProvidersContext must define useCallback ${name}`);
  let i = m.index + `const ${name} = useCallback`.length;
  while (/\s/.test(src[i])) i += 1;
  const callOpen = i;
  const callEnd = scanGroup(src, i);
  const call = src.slice(callOpen, callEnd);
  const bodyOpen = call.indexOf('{');
  const bodyEnd = scanGroup(call, bodyOpen);
  const depsOpen = call.lastIndexOf('[');
  const depsEnd = scanGroup(call, depsOpen);
  return { body: call.slice(bodyOpen, bodyEnd), deps: call.slice(depsOpen, depsEnd) };
}

// ---------------------------------------------------------------------------

test('autoLoadProviderModels lists every binding its filter calls, incl. deriveModelsEndpoint', () => {
  const { deps } = extractUseCallbackSource(ctxSrc, 'autoLoadProviderModels');
  for (const dep of ['providers', 'beginProviderModelFetch', 'providerModelFetchCurrent', 'persistProviders', 'deriveModelsEndpoint']) {
    assert.match(deps, new RegExp(`\\b${dep}\\b`), `the autoLoadProviderModels deps array keeps ${dep} (exhaustive-deps stays clean)`);
  }
});

test('autoLoadProviderModels still filters its targets through deriveModelsEndpoint', () => {
  const { body } = extractUseCallbackSource(ctxSrc, 'autoLoadProviderModels');
  assert.ok(body.includes('deriveModelsEndpoint(cp)'), 'the target filter keeps deriving the models endpoint per provider');
});

test('handleProviderTest lists persistProviders among its dependencies', () => {
  const { deps } = extractUseCallbackSource(ctxSrc, 'handleProviderTest');
  for (const dep of ['providers', 'testProvider', 'persistProviders']) {
    assert.match(deps, new RegExp(`\\b${dep}\\b`), `the handleProviderTest deps array keeps ${dep} (exhaustive-deps stays clean)`);
  }
});