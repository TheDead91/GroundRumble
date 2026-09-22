// Coverage of src/utils/api/atlas-sync.js — the statements the api-core suite
// never reaches: the v6 pointer document failing (a non-ok response, or a body
// that fails YAML parsing) and falling through to the legacy document with
// pointerVersion reset (187, 189-190), the legacy document's own YAML parse
// error wrapped as "Invalid ATLAS YAML: …" (213-214), the legacy fetch failing
// after the deadline already fired → the timed-out error wins (202-208), and
// readBoundedText's streaming path (355-378): chunk reads under the byte
// budget, the partial final chunk + reader.cancel on overflow, the releaseLock
// finally, the empty-stream '' return, and in-order multi-chunk decoding.
// Reuses the shared httpx stubFetch/textRes harness and the api-core
// fetchATLASFramework stubbing pattern (extended, not forked).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { dump as yamlDump } from 'js-yaml';

import { fetchATLASFramework, fetchSourceExcerpt } from '../src/utils/api/atlas-sync.js';
import { jsonRes, textRes, stubFetch, withFastTimers, hostIs } from './helpers/httpx.mjs';

let savedFetch;
before(() => { savedFetch = globalThis.fetch; });
after(() => { globalThis.fetch = savedFetch; });

// Legacy v5 shape: top-level `matrices` array + STIX-style relationships.
const legacyDoc = {
  matrices: [{ tactics: [{ id: 'AML.TA0000', name: 'Recon' }] }],
  techniques: { 'AML.T0000': { name: 'Tech', description: 't' } },
  relationships: [{ source_ref: 'AML.T0000', target_ref: 'AML.TA0000', relationship_type: 'achieves' }]
};

// A Response whose body is a real streaming ReadableStream (unlike the
// body-less textRes/jsonRes mocks, which drive readBoundedText's non-streaming
// fallback). Chunks are enqueued lazily as they are consumed, and with
// closeAtEnd=false the stream stays open so a reader.cancel() on overflow
// reaches the underlying source. `state.cancelled` flips when the reader
// cancels the stream.
const streamedRes = (chunks, { closeAtEnd = true } = {}) => {
  const state = { cancelled: false };
  const encoder = new TextEncoder();
  let next = 0;
  const body = new ReadableStream({
    pull(controller) {
      if (next < chunks.length) controller.enqueue(encoder.encode(chunks[next++]));
      if (closeAtEnd && next >= chunks.length) controller.close();
    },
    cancel() { state.cancelled = true; }
  });
  return { res: { ok: true, status: 200, headers: { get: () => null }, body }, state };
};

// Deterministic ASCII marker pattern of exact length n: every 100th byte is a
// single digit recording the block index, so out-of-order or dropped chunks
// cannot masquerade as the expected text. 1 byte per char (ASCII only).
const pattern = (letter, n) => Array.from(
  { length: n }, (_, i) => (i % 100 === 0 ? String((i / 100) % 10) : letter)
).join('');

// ── fetchATLASFramework: pointer-side failures fall through to legacy ──────

test('a non-ok v6 document fetch falls through to the legacy document with pointerVersion reset', async () => {
  const calls = [];
  stubFetch([
    [(r) => r.url.includes('/v6/ATLAS-latest.yaml'), () => { calls.push('pointer'); return textRes('ATLAS-2026.07.yaml'); }],
    [(r) => r.url.includes('/v6/ATLAS-2026.07.yaml'), () => { calls.push('v6'); return jsonRes({}, 404); }],
    [(r) => r.url.includes('/ATLAS.yaml'), () => { calls.push('legacy'); return textRes(yamlDump(legacyDoc)); }]
  ]);
  const res = await fetchATLASFramework();
  assert.deepEqual(calls, ['pointer', 'v6', 'legacy'], 'the named v6 document is fetched, then its failure falls through to legacy');
  assert.equal(res.version, 'legacy-v5', 'the legacy builder version wins — pointerVersion was reset, not reused');
  assert.deepEqual(res.matrix.map((t) => t.id), ['AML.TA0000']);
  assert.deepEqual(res.matrix[0].techniques.map((t) => t.id), ['AML.T0000']);
});

test('a v6 document that fails YAML parsing falls through to the legacy document', async () => {
  const calls = [];
  stubFetch([
    [(r) => r.url.includes('/v6/ATLAS-latest.yaml'), () => { calls.push('pointer'); return textRes('ATLAS-2026.07.yaml'); }],
    // A leading tab makes js-yaml throw; the pointer catch must swallow it.
    [(r) => r.url.includes('/v6/ATLAS-2026.07.yaml'), () => { calls.push('v6'); return textRes('\tfoo: 1'); }],
    [(r) => r.url.includes('/ATLAS.yaml'), () => { calls.push('legacy'); return textRes(yamlDump(legacyDoc)); }]
  ]);
  const res = await fetchATLASFramework();
  assert.deepEqual(calls, ['pointer', 'v6', 'legacy'], 'the unparseable v6 body falls through to the legacy fetch');
  assert.equal(res.version, 'legacy-v5');
  assert.deepEqual(res.matrix[0].techniques.map((t) => t.id), ['AML.T0000']);
});

test('a legacy document that fails YAML parsing is wrapped as "Invalid ATLAS YAML: …"', async () => {
  // Pointer 404s (fallback route) so the legacy document is fetched directly;
  // its leading tab makes js-yaml throw, and the catch must wrap that exact
  // reason — distinct from the structural "Invalid ATLAS YAML: missing
  // tactics" error the api-core suite already exercises.
  stubFetch([
    [(r) => r.url.includes('/ATLAS.yaml'), () => textRes('\tfoo: 1')]
  ]);
  await assert.rejects(
    fetchATLASFramework(),
    (err) => err.message.startsWith('Invalid ATLAS YAML: end of the stream or a document separator is expected (1:5)')
  );
});

test('a legacy fetch that fails after the deadline reports the timeout, not the transport error', async () => {
  await withFastTimers(async () => {
    stubFetch([
      [(r) => r.url.includes('/v6/ATLAS-latest.yaml'), () => { throw new Error('pointer transport down'); }],
      [(r) => r.url.includes('/ATLAS.yaml'), () => { throw new Error('legacy transport blew up after the deadline'); }]
    ]);
    // Fast timers: the deadline has already fired by the time the legacy stub
    // rejects, so its transport error must lose to the timeout error.
    await assert.rejects(
      fetchATLASFramework({ timeout: 20 }),
      { message: 'Timed out fetching the ATLAS framework' }
    );
  });
});

test('an external abort signal is forwarded to the underlying ATLAS fetches', async () => {
  const controller = new AbortController();
  const seen = [];
  stubFetch([[
    (_unused) => true,
    (req) => {
      seen.push(Boolean(req.signal && req.signal.aborted));
      return new Promise((_, reject) => {
        req.signal?.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')), { once: true });
        if (req.signal?.aborted) reject(new DOMException('The operation was aborted.', 'AbortError'));
      });
    }
  ]]);
  const pending = fetchATLASFramework({ signal: controller.signal });
  controller.abort();
  await assert.rejects(
    pending,
    (err) => err.name === 'AbortError' && err.message === 'The operation was aborted.'
  );
  assert.ok(seen.length >= 2, 'the pointer fetch is attempted, then the legacy document');
  assert.equal(seen[0], false, 'the first fetch starts before the abort fires');
  assert.equal(seen[1], true, 'the follow-up fetch sees the already-aborted signal');
});

test('a legacy document that builds a tactics-less matrix is rejected', async () => {
  stubFetch([
    [(r) => r.url.includes('/ATLAS.yaml'), () => textRes(yamlDump({ matrices: [{ tactics: [] }] }))]
  ]);
  await assert.rejects(
    fetchATLASFramework(),
    { message: 'Invalid ATLAS YAML: no tactics found' }
  );
});

test('a v6 document with an empty tactics map is rejected even when the pointer loads', async () => {
  const calls = [];
  stubFetch([
    [(r) => r.url.includes('/v6/ATLAS-latest.yaml'), () => { calls.push('pointer'); return textRes('ATLAS-2026.08.yaml'); }],
    [(r) => r.url.includes('/v6/ATLAS-2026.08.yaml'), () => { calls.push('v6'); return textRes(yamlDump({ tactics: {} })); }]
  ]);
  await assert.rejects(
    fetchATLASFramework(),
    { message: 'Invalid ATLAS YAML: no tactics found' }
  );
  assert.deepEqual(calls, ['pointer', 'v6'], 'the pointer route resolves before the structural check');
});

// ── readBoundedText: the streaming body path (via fetchSourceExcerpt) ──────

test('a streamed source read stops at the byte budget, cancels the reader, and returns the truncated text', async () => {
  const seen = [];
  // maxChars=12000 → budget = max(64 KiB, min(4*12000, 1 MiB)) = 65536 bytes.
  const chunk1 = pattern('a', 8000);
  const chunk2 = pattern('b', 66000);
  const { res, state } = streamedRes([chunk1, chunk2], { closeAtEnd: false });
  stubFetch([
    [(r) => hostIs(r.url, 'raw.githubusercontent.com'), (req) => { seen.push(req.url); return res; }]
  ]);
  const out = await fetchSourceExcerpt('https://github.com/probe/atlas/blob/main/README.md', 12000);
  assert.deepEqual(seen, ['https://raw.githubusercontent.com/probe/atlas/main/README.md']);
  assert.equal(out.kind, 'github');
  assert.equal(out.note, '');
  // 8000 + 66000 = 74000 > 65536: the second chunk contributes only its first
  // 65536 - 8000 = 57536 bytes, and the reader is cancelled on the overflow.
  assert.equal(state.cancelled, true, 'the reader must cancel the stream once the budget is exceeded');
  const expected = (chunk1 + chunk2.slice(0, 65536 - 8000)).slice(0, 12000);
  assert.equal(out.excerpt, expected, 'the kept prefix decodes in order up to the budget, then the excerpt cap applies');
  assert.equal(out.excerpt.length, 12000);
  assert.equal(out.excerpt.startsWith(chunk1), true, 'the first chunk is fully inside the excerpt');
  assert.equal(out.excerpt.endsWith(chunk2.slice(0, 4000)), true, 'the tail crosses the chunk boundary in order');
});

test('multi-chunk streams under the budget decode in order and the reader is never cancelled', async () => {
  const chunk1 = pattern('x', 700);
  const chunk2 = pattern('y', 700);
  const chunk3 = pattern('z', 700);
  const { res, state } = streamedRes([chunk1, chunk2, chunk3]);
  stubFetch([
    [(r) => hostIs(r.url, 'raw.githubusercontent.com'), () => res]
  ]);
  const out = await fetchSourceExcerpt('https://github.com/probe/atlas/blob/main/README.md');
  assert.equal(out.kind, 'github');
  assert.equal(out.excerpt, chunk1 + chunk2 + chunk3, 'all three chunks decode in arrival order');
  assert.equal(state.cancelled, false, 'under the budget the stream runs to done without a cancel');
});

test('a stream that ends before emitting any chunk yields an empty excerpt', async () => {
  const { res, state } = streamedRes([]);
  stubFetch([
    [(r) => hostIs(r.url, 'raw.githubusercontent.com'), () => res]
  ]);
  const out = await fetchSourceExcerpt('https://github.com/probe/atlas/blob/main/README.md');
  assert.equal(out.kind, 'github');
  assert.equal(out.excerpt, '', 'zero chunks decode to the empty string');
  assert.equal(state.cancelled, false);
});
