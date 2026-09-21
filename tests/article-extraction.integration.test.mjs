// Coverage of the fetchSourceExcerpt GitHub / proxy / article-extraction
// paths, plus the proxy configuration helpers.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { jsonRes, textRes, stubFetch } from './helpers/httpx.mjs';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
globalThis.window = dom.window;
globalThis.DOMParser = dom.window.DOMParser;
globalThis.document = dom.window.document;

let savedFetch;
before(() => { savedFetch = globalThis.fetch; });
after(() => { globalThis.fetch = savedFetch; });

const { fetchSourceExcerpt, assertPublicSourceUrl, setProxyConfig, setProxyConfirmHandler, setRedirectConfirmHandler } = await import('../src/utils/api.js');
const fetchFixture = (url, maxChars, signal) => fetchSourceExcerpt(url, maxChars, signal, { allowPrivate: true });
const PROXY = 'https://proxy.example/fetch?url=';

test('direct source fetching rejects local and private targets by default', async () => {
  for (const url of ['http://localhost:3000/admin', 'http://127.0.0.1/secret', 'http://10.0.0.1/', 'http://[::1]/']) {
    assert.throws(() => assertPublicSourceUrl(url), /private|local|reserved|approval/i);
    await assert.rejects(fetchSourceExcerpt(url), /private|local|reserved|approval/i);
  }
});

test('private source targets require explicit per-request approval', () => {
  assert.equal(assertPublicSourceUrl('http://localhost:3000/', { allowPrivate: true }).hostname, 'localhost');
});

test('direct source policy rejects mapped, reserved, CGNAT, link-local, multicast, and private IPv6 literals', () => {
  const blocked = [
    'http://[::ffff:192.168.1.10]/',
    'http://192.0.0.9/',
    'http://198.18.0.10/',
    'http://100.64.0.1/',
    'http://169.254.10.20/',
    'http://224.0.0.1/',
    'http://[fc00::1]/',
    'http://[::1]/',
    'http://[fe80::1]/',
    'http://[ff02::1]/',
    'http://[2001:db8::1]/'
  ];
  for (const url of blocked) {
    assert.throws(() => assertPublicSourceUrl(url), /private|local|reserved|hostname/i, url);
  }
  assert.doesNotThrow(() => assertPublicSourceUrl('https://8.8.8.8/'));
  assert.doesNotThrow(() => assertPublicSourceUrl('https://[2001:4860:4860::8888]/'));
  assert.doesNotThrow(() => assertPublicSourceUrl('https://[::ffff:8.8.8.8]/'));
});

test('unknown source hostnames are denied unless the guarded proxy is enabled', async () => {
  setProxyConfig({ enabled: false, baseUrl: '', mode: 'fallback' });
  await assert.rejects(fetchSourceExcerpt('https://source.example/article'), /hostname cannot be proven public/);

  setProxyConfig({ enabled: true, baseUrl: PROXY, mode: 'fallback', categories: { privateNet: false, providers: false, articles: true } });
  setProxyConfirmHandler(() => true);
  stubFetch([[(r) => r.url.startsWith(PROXY), () => textRes('<html><body><article><p>guarded content</p></article></body></html>')]]);
  const result = await fetchSourceExcerpt('https://source.example/article', 5000);
  assert.ok(result.excerpt.includes('guarded content'));
  setProxyConfig({ enabled: false, baseUrl: '', mode: 'fallback' });
  setProxyConfirmHandler(null);
});

test('GitHub source extraction remains direct when the proxy is disabled', async () => {
  setProxyConfig({ enabled: false, baseUrl: '', mode: 'fallback' });
  const calls = [];
  stubFetch([[(r) => {
    calls.push(r.url);
    return r.url.includes('raw.githubusercontent.com/');
  }, () => textRes('DIRECT GITHUB CONTENT')]]);
  const result = await fetchSourceExcerpt('https://github.com/owner/repo/blob/main/README.md', 5000);
  assert.equal(result.kind, 'github');
  assert.equal(result.excerpt, 'DIRECT GITHUB CONTENT');
  assert.deepEqual(calls, ['https://raw.githubusercontent.com/owner/repo/main/README.md']);
  assert.doesNotThrow(() => assertPublicSourceUrl('https://github.com/owner/repo'));
  assert.throws(() => assertPublicSourceUrl('https://unknown.example/repo'), /hostname cannot be proven public/);
});

// ── GitHub URLs ────────────────────────────────────────────────────────────

test('normalizeGitHubUrl: web, ssh, www, and .git forms', async () => {
  const meta = jsonRes({ description: 'A great repo', default_branch: 'dev' });
  const readme = textRes('# My Repo\n\nThis repo explains a real attack pattern with concrete payloads.\n\n' + 'd'.repeat(1400));
  stubFetch([
    [(r) => r.url.includes('api.github.com/repos/'), () => meta],
    [(r) => r.url.includes('raw.githubusercontent.com/'), () => readme]
  ]);
  for (const url of [
    'https://github.com/owner/repo',
    'https://www.github.com/owner/repo.git',
    'git@github.com:owner/repo.git',
    'ssh://git@github.com:owner/repo'
  ]) {
    const r = await fetchFixture(url, 5000);
    assert.equal(r.kind, 'github');
    assert.ok(r.excerpt.includes('real attack pattern'), url);
    assert.match(r.note, /Repository description: A great repo/);
  }
});

test('GitHub blob/raw URLs fetch the specific file directly', async () => {
  const file = textRes('MARKDOWN CONTENT of the targeted file');
  stubFetch([[(r) => r.url.includes('raw.githubusercontent.com/'), () => file]]);
  const r = await fetchFixture('https://github.com/owner/repo/blob/main/docs/adversarial.md', 5000);
  assert.ok(r.excerpt.includes('MARKDOWN CONTENT'));
});

test('GitHub tree URLs resolve the requested directory contents', async () => {
  stubFetch([
    [(r) => r.url.includes('/contents/docs?'), () => jsonRes([
      { type: 'file', name: 'notes.md', download_url: 'https://raw/x/notes.md' },
      { type: 'dir', name: 'sub' }
    ])],
    [(r) => r.url.includes('raw.githubusercontent.com/'), (req) => textRes('tree path notes: ' + req.url.split('/').pop())]
  ]);
  const r = await fetchFixture('https://github.com/o/r/tree/main/docs', 5000);
  assert.ok(r.excerpt.includes('tree path notes: notes.md'), 'should pull readable files from the tree path');
});

test('GitHub tree URLs fetch a single-file listing directly', async () => {
  stubFetch([
    [(r) => r.url.includes('/contents/guide.md?'), () => jsonRes({ type: 'file', name: 'guide.md', download_url: 'https://raw.githubusercontent.com/x/guide.md' })],
    [(r) => r.url.includes('raw.githubusercontent.com/x/guide.md'), () => textRes('SINGLE FILE CONTENT')]
  ]);
  const r = await fetchFixture('https://github.com/o/r/tree/main/guide.md', 5000);
  assert.ok(r.excerpt.includes('SINGLE FILE CONTENT'));
});

test('excerpt caps respect a caller-requested smaller limit', async () => {
  const readme = 'x'.repeat(2000);
  stubFetch([
    [(r) => r.url.includes('api.github.com/repos/'), () => jsonRes({ description: '', default_branch: 'main' })],
    [(r) => r.url.includes('raw.githubusercontent.com/'), () => textRes(readme)]
  ]);
  const r = await fetchFixture('https://github.com/o/r', 500);
  assert.ok(r.excerpt.length <= 520, 'should honor the 500-char request, not the 12000 hard cap');
});

test('GitHub repo with a thin README pulls extra root markdown files', async () => {
  stubFetch([
    [(r) => r.url.includes('api.github.com/repos/') && r.url.endsWith('/contents/'), () => jsonRes([
      { type: 'file', name: 'attack.py' },
      { type: 'file', name: 'notes.md' },
      { type: 'dir', name: 'sub' }
    ])],
    [(r) => r.url.includes('raw.githubusercontent.com/') && /notes\.md$/.test(r.url), () => textRes('extra markdown detail ' + 'x'.repeat(200))],
    [(r) => r.url.includes('raw.githubusercontent.com/'), () => textRes('TINY')],
    [(r) => r.url.includes('api.github.com/repos/'), () => jsonRes({ description: '', default_branch: 'main' })]
  ]);
  const r = await fetchFixture('https://github.com/o/r', 5000);
  assert.ok(r.excerpt.includes('extra markdown detail'), 'extra files should be appended to a thin README');
});

test('GitHub repo with no README falls back to the description as excerpt', async () => {
  stubFetch([
    [(r) => r.url.includes('api.github.com/repos/'), () => jsonRes({ description: 'DESC FALLBACK', default_branch: 'main' })],
    [(r) => r.url.includes('raw.githubusercontent.com/'), () => jsonRes({}, 404)]
  ]);
  const r = await fetchFixture('https://github.com/o/r', 5000);
  assert.equal(r.excerpt, 'DESC FALLBACK');
  assert.match(r.note, /Repository description: DESC FALLBACK/);
});

// ── proxy configuration helpers ────────────────────────────────────────────

test('setProxyConfig normalizes enabled/baseUrl/mode', async () => {
  setProxyConfig({ enabled: true, baseUrl: '  https://proxy.example/fetch?url=  ', mode: 'always' });
  setProxyConfig({ enabled: false, baseUrl: '', mode: 'fallback' });
  setProxyConfig({ enabled: true, baseUrl: PROXY, mode: 'bogus' });
  setProxyConfig({ enabled: true, baseUrl: 'https://p.example/?u={url}&x=1' });
});

test('Proxy always mode routes through the proxy after consent', async () => {
  setProxyConfig({ enabled: true, baseUrl: PROXY, mode: 'always', categories: { privateNet: false, providers: false, articles: true } });
  let asked = '';
  setProxyConfirmHandler((msg) => { asked = msg; return true; });
  const html = '<html><head><title>Proxied Page</title></head><body>' +
    '<article><h1>Proxied Story</h1><p>' + ('The proxied article body has real substance. '.repeat(60)) + '</p></article></body></html>';
  stubFetch([
    [(r) => r.url.startsWith(PROXY), () => textRes(html)]
  ]);
  const r = await fetchSourceExcerpt('https://example.com/story', 5000, undefined, { allowPrivate: true });
  assert.ok(asked.includes('example.com/story'), 'consent should name the target');
  assert.ok(asked.includes(PROXY), 'consent should name the configured proxy');
  assert.ok(r.excerpt.includes('Proxied Story'));
  assert.match(r.note, /Fetched via proxy/);
  assert.match(r.note, /Page title: Proxied Page/);
});

test('fallback mode: direct fetch blocked → proxy is offered; declining marks declined', async () => {
  setProxyConfig({ enabled: true, baseUrl: 'https://custom.proxy/?url={url}', mode: 'fallback', categories: { privateNet: false, providers: false, articles: true } });
  let declined = false;
  setProxyConfirmHandler(() => { declined = true; return false; });
  stubFetch([
    [(r) => r.url.startsWith('https://custom.proxy/'), () => textRes('<html><body><p>should not be used</p></body></html>')],
    [(_unused) => true, () => { throw new Error('CORS blocked'); }]
  ]);
  const r = await fetchSourceExcerpt('https://example.com/story', 5000, undefined, { allowPrivate: true });
  assert.ok(declined, 'consent handler should be invoked');
  assert.equal(r.declined, true);
  assert.match(r.note, /declined the proxy/);
});

test('proxy failure when the proxy cannot fetch content', async () => {
  setProxyConfig({ enabled: true, baseUrl: PROXY, mode: 'always', categories: { privateNet: false, providers: false, articles: true } });
  setProxyConfirmHandler(() => true);
  stubFetch([
    [(r) => r.url.startsWith(PROXY), () => textRes('', 502)],
    [(_unused) => true, () => textRes('', 200)] // direct fetch fallback path never used in always mode
  ]);
  const r = await fetchSourceExcerpt('https://example.com/story', 5000, undefined, { allowPrivate: true });
  assert.equal(r.proxyFailed, true);
  assert.match(r.note, /could not fetch the content/);
});

test('fetchViaProxy does not silently switch destinations when a configured proxy fails', async () => {
  setProxyConfig({ enabled: true, baseUrl: 'https://custom.proxy/route?target=', mode: 'always', categories: { privateNet: false, providers: false, articles: true } });
  setProxyConfirmHandler(() => true);
  const otherSeen = [];
  stubFetch([
    [(r) => r.url.startsWith('https://custom.proxy/'), () => { throw new Error('custom proxy down'); }],
    [(_unused) => true, (req) => { otherSeen.push(req.url); return textRes('FALLBACK SHOULD NOT BE USED'); }]
  ]);
  const r = await fetchSourceExcerpt('https://example.com/story', 5000, undefined, { allowPrivate: true });
  assert.equal(r.proxyFailed, true, 'failure must be flagged, not silently re-routed');
  assert.equal(otherSeen.length, 0, 'must not fall back to any other proxy after consenting to a custom one');
});

// ── web page extraction paths ──────────────────────────────────────────────

test('direct fetch with a plain-stripped fallback (no substantial article)', async () => {
  setProxyConfig({ enabled: false, baseUrl: '', mode: 'fallback' });
  setProxyConfirmHandler(null);
  const html = '<html><head><title>Short Page</title><meta name="description" content="a brief description">' +
    '</head><body><nav>Home &#61593;</nav><p>Only a few words here.</p><!-- comment --><script>var x=1;</script></body></html>';
  stubFetch([[(_unused) => true, () => textRes(html)]]);
  const r = await fetchFixture('https://example.com/short', 5000);
  assert.ok(r.excerpt.includes('Short Page'));
  assert.ok(r.excerpt.includes('Only a few words here'));
  assert.ok(!r.excerpt.includes('&#'), 'entities should be decoded');
  assert.ok(!r.excerpt.includes('var x'), 'scripts should be stripped');
  assert.match(r.note, /Page title: Short Page/);
  assert.match(r.note, /Description: a brief description/);
});

test('direct fetch follows a redirect only after the user confirms', async () => {
  setProxyConfig({ enabled: false, baseUrl: '', mode: 'fallback' });
  const asked = [];
  setRedirectConfirmHandler((msg) => { asked.push(msg); return true; });
  stubFetch([
    [(r) => r.url === 'https://example.com/start', () => textRes('', 301, { location: 'https://93.184.216.34/page' })],
    [(r) => r.url === 'https://93.184.216.34/page', () => textRes('<html><body><p>redirected destination content</p></body></html>')]
  ]);
  const r = await fetchFixture('https://example.com/start', 5000);
  assert.equal(asked.length, 1, 'the redirect must be surfaced to the user');
  assert.ok(asked[0].includes('https://example.com/start'), 'confirm should name the origin URL');
  assert.ok(asked[0].includes('https://93.184.216.34/page'), 'confirm should name the destination');
  assert.ok(r.excerpt.includes('redirected destination content'), 'confirmed redirect should be fetched');
  setRedirectConfirmHandler(null);
});

test('direct fetch does not follow a redirect the user declines', async () => {
  setProxyConfig({ enabled: false, baseUrl: '', mode: 'fallback' });
  let asked = 0;
  setRedirectConfirmHandler(() => { asked++; return false; });
  const seen = [];
  stubFetch([[(_unused) => true, (req) => {
    seen.push(req.url);
    if (req.url === 'https://example.com/start') return textRes('', 302, { location: 'https://93.184.216.34/page' });
    return textRes('declined destination');
  }]]);
  const r = await fetchFixture('https://example.com/start', 5000);
  assert.equal(asked, 1, 'the redirect must be surfaced to the user');
  assert.ok(!r.excerpt.includes('declined destination'), 'declined redirect destination must not be fetched');
  assert.ok(seen.every(u => u === 'https://example.com/start'), 'only the original URL should be requested when declined');
  setRedirectConfirmHandler(null);
});

test('direct fetch uses the window.confirm fallback when no handler is registered', async () => {
  setProxyConfig({ enabled: false, baseUrl: '', mode: 'fallback' });
  setRedirectConfirmHandler(null);
  const originalConfirm = dom.window.confirm;
  let asked = 0;
  dom.window.confirm = () => { asked++; return true; };
  try {
    stubFetch([
      [(r) => r.url === 'https://example.com/start', () => textRes('', 301, { location: 'https://93.184.216.34/page' })],
      [(r) => r.url === 'https://93.184.216.34/page', () => textRes('<html><body><p>confirm-fallback content</p></body></html>')]
    ]);
    const r = await fetchFixture('https://example.com/start', 5000);
    assert.equal(asked, 1, 'window.confirm must be the fallback confirmation');
    assert.ok(r.excerpt.includes('confirm-fallback content'), 'confirmed redirect should be fetched');
  } finally {
    dom.window.confirm = originalConfirm;
  }
});

test('a direct redirect to a private/localhost/metadata target is refused (not followed, not prompted)', async () => {
  setProxyConfig({ enabled: false, baseUrl: '', mode: 'fallback' });
  let asked = 0;
  setRedirectConfirmHandler(() => { asked++; return true; });
  const seen = [];
  stubFetch([[(_unused) => true, (req) => {
    seen.push(req.url);
    if (req.url === 'https://example.com/start') return textRes('', 302, { location: 'http://127.0.0.1:8080/admin' });
    return textRes('internal content');
  }]]);
  const r = await fetchFixture('https://example.com/start', 5000);
  assert.equal(asked, 0, 'a policy-blocked redirect must not be offered to the user');
  assert.ok(!r.excerpt.includes('internal content'), 'the private redirect destination must not be fetched');
  assert.ok(seen.every(u => u === 'https://example.com/start'), 'only the original URL should be requested');
  setRedirectConfirmHandler(null);
});

test('a direct redirect to a non-http(s) scheme (data:) is refused', async () => {
  setProxyConfig({ enabled: false, baseUrl: '', mode: 'fallback' });
  let asked = 0;
  setRedirectConfirmHandler(() => { asked++; return true; });
  const seen = [];
  stubFetch([[(_unused) => true, (req) => {
    seen.push(req.url);
    if (req.url === 'https://example.com/start') return textRes('', 302, { location: 'data:text/html,<p>smuggled</p>' });
    return textRes('fallback');
  }]]);
  const r = await fetchFixture('https://example.com/start', 5000);
  assert.equal(asked, 0, 'a data: redirect must not be offered to the user');
  assert.ok(!r.excerpt.includes('smuggled'), 'the data: redirect must not be fetched');
  setRedirectConfirmHandler(null);
});

test('a direct redirect to an unprovable DNS hostname is refused and falls through', async () => {
  setProxyConfig({ enabled: false, baseUrl: '', mode: 'fallback' });
  let asked = 0;
  setRedirectConfirmHandler(() => { asked++; return true; });
  const seen = [];
  stubFetch([[(_unused) => true, (req) => {
    seen.push(req.url);
    if (req.url === 'https://example.com/start') return textRes('', 302, { location: 'https://dest.example/page' });
    return textRes('dns destination content');
  }]]);
  const r = await fetchFixture('https://example.com/start', 5000);
  assert.equal(asked, 0, 'an unprovable-DNS redirect must not be followed directly');
  assert.ok(!r.excerpt.includes('dns destination content'), 'the DNS redirect destination must not be fetched directly');
  setRedirectConfirmHandler(null);
});

test('a GitHub raw redirect to the trusted media CDN is followed after confirmation', async () => {
  setProxyConfig({ enabled: false, baseUrl: '', mode: 'fallback' });
  let asked = 0;
  setRedirectConfirmHandler(() => { asked++; return true; });
  const seen = [];
  stubFetch([[(_unused) => true, (req) => {
    seen.push(req.url);
    if (req.url === 'https://raw.githubusercontent.com/owner/repo/main/big.bin') return textRes('', 302, { location: 'https://media.githubusercontent.com/media/owner/repo/main/big.bin' });
    return textRes('cdn content');
  }]]);
  const r = await fetchFixture('https://github.com/owner/repo/blob/main/big.bin', 5000);
  assert.equal(r.excerpt, 'cdn content');
  assert.equal(asked, 0, 'GitHub/CDN redirects are validated by policy, not prompted');
  setRedirectConfirmHandler(null);
});

test('a GitHub download_url that is private or unprovable is refused', async () => {
  setProxyConfig({ enabled: false, baseUrl: '', mode: 'fallback' });
  const seen = [];
  stubFetch([[(_unused) => true, (req) => {
    seen.push(req.url);
    if (req.url.startsWith('https://api.github.com/repos/owner/repo/contents/path?ref=')) return jsonRes({ download_url: 'http://127.0.0.1:9000/internal' });
    return jsonRes({}, 404);
  }]]);
  const r = await fetchFixture('https://github.com/owner/repo/tree/main/path', 5000);
  assert.ok(seen.some((u) => u.startsWith('https://api.github.com/repos/owner/repo/contents/path?ref=')), 'the tree listing must actually be requested');
  assert.ok(!seen.some((u) => u.startsWith('http://127.0.0.1')), 'the private download_url must never be fetched');
  assert.equal(r.excerpt, '', 'nothing readable comes out of the refused download');
  setRedirectConfirmHandler(null);
});

test('an SSH-formatted GitHub blob URL resolves to the raw file', async () => {
  setProxyConfig({ enabled: false, baseUrl: '', mode: 'fallback' });
  const calls = [];
  stubFetch([[(r) => { calls.push(r.url); return true; }, () => textRes('RESOLVED RAW CONTENT')]]);
  const r = await fetchFixture('git@github.com:owner/repo/blob/main/docs/x.md', 5000);
  assert.deepEqual(calls, ['https://raw.githubusercontent.com/owner/repo/main/docs/x.md'], 'the SSH form must normalize before fetching');
  assert.ok(r.excerpt.includes('RESOLVED RAW CONTENT'));
});

test('a raw redirect hop to a private host is refused and the README fallback is used', async () => {
  setProxyConfig({ enabled: false, baseUrl: '', mode: 'fallback' });
  const seen = [];
  stubFetch([[(_unused) => true, (req) => {
    seen.push(req.url);
    if (req.url === 'https://raw.githubusercontent.com/owner/repo/main/big.bin') return textRes('', 302, { location: 'http://10.0.0.5/steal' });
    if (req.url.includes('/README.md')) return textRes('fallback readme covers the repo');
    return jsonRes({}, 404);
  }]]);
  const r = await fetchFixture('https://github.com/owner/repo/blob/main/big.bin', 5000);
  assert.ok(r.excerpt.includes('fallback readme'));
  assert.ok(!seen.some((u) => u.startsWith('http://10.0.0.5')), 'the private redirect hop must never be followed');
});

test('a throwing blob fetch falls through to the repository README', async () => {
  setProxyConfig({ enabled: false, baseUrl: '', mode: 'fallback' });
  const seen = [];
  stubFetch([[(_unused) => true, (req) => {
    seen.push(req.url);
    if (req.url.includes('/README.md')) return textRes('readme after transport failure');
    if (req.url === 'https://raw.githubusercontent.com/owner/repo/main/big.bin') throw new TypeError('fetch failed');
    return jsonRes({}, 404);
  }]]);
  const r = await fetchFixture('https://github.com/owner/repo/blob/main/big.bin', 5000);
  assert.ok(r.excerpt.includes('readme after transport failure'));
});

test('a tree file whose raw fetch throws is skipped, the rest are appended', async () => {
  setProxyConfig({ enabled: false, baseUrl: '', mode: 'fallback' });
  const seen = [];
  stubFetch([[(_unused) => true, (req) => {
    seen.push(req.url);
    if (req.url.includes('/contents/src?ref=main')) return jsonRes([
      { type: 'file', name: 'b.md' },
      { type: 'file', name: 'a.txt' }
    ]);
    if (req.url.includes('src/b.md')) throw new TypeError('raw b.md exploded');
    if (req.url.includes('src/a.txt')) return textRes('AAA from a.txt');
    return jsonRes({}, 404);
  }]]);
  const r = await fetchFixture('https://github.com/o/r/tree/main/src', 5000);
  assert.ok(r.excerpt.includes('--- [a.txt] ---'));
  assert.ok(r.excerpt.includes('AAA from a.txt'));
  assert.ok(!r.excerpt.includes('b.md'), 'the throwing file must be skipped');
});

test('a repository without a default branch still resolves the README via main', async () => {
  setProxyConfig({ enabled: false, baseUrl: '', mode: 'fallback' });
  const seen = [];
  stubFetch([[(_unused) => true, (req) => {
    seen.push(req.url);
    if (req.url === 'https://api.github.com/repos/o/r') return jsonRes({ description: 'desc only', default_branch: '' });
    if (req.url.includes('/contents/')) return jsonRes([]);
    if (req.url.includes('/README.md')) return textRes('main README resolves without a default_branch');
    return jsonRes({}, 404);
  }]]);
  const r = await fetchFixture('https://github.com/o/r', 5000);
  assert.ok(seen.some((u) => u.includes('/main/README.md')), 'the hard-coded main branch is tried');
  assert.ok(r.excerpt.includes('main README resolves without a default_branch'));
});

test('a README that throws on the default branch falls through to the next', async () => {
  setProxyConfig({ enabled: false, baseUrl: '', mode: 'fallback' });
  const seen = [];
  stubFetch([[(_unused) => true, (req) => {
    seen.push(req.url);
    if (req.url === 'https://api.github.com/repos/o/r') return jsonRes({ description: '', default_branch: 'main' });
    if (req.url.includes('/contents/')) return jsonRes([]);
    if (req.url.includes('/main/README.md')) throw new TypeError('main readme down');
    if (req.url.includes('/master/README.md')) return textRes('master readme survives');
    return jsonRes({}, 404);
  }]]);
  const r = await fetchFixture('https://github.com/o/r', 5000);
  assert.ok(seen.some((u) => u.includes('/master/README.md')));
  assert.ok(r.excerpt.includes('master readme survives'));
});

test('a thin README surfaces extra root files from the HEAD branch and skips throwing ones', async () => {
  setProxyConfig({ enabled: false, baseUrl: '', mode: 'fallback' });
  const seen = [];
  stubFetch([[(_unused) => true, (req) => {
    seen.push(req.url);
    if (req.url === 'https://api.github.com/repos/o/r') return jsonRes({ description: '', default_branch: '' });
    if (req.url === 'https://api.github.com/repos/o/r/contents/') return jsonRes([
      { type: 'file', name: 'a.py' },
      { type: 'file', name: 'b.json' }
    ]);
    if (req.url.includes('/README.md')) return req.url.includes('/HEAD/') ? textRes('TINY') : jsonRes({}, 404);
    if (req.url.includes('/HEAD/a.py')) return textRes('PY CONTENT');
    if (req.url.includes('/HEAD/b.json')) throw new TypeError('json fetch exploded');
    return jsonRes({}, 404);
  }]]);
  const r = await fetchFixture('https://github.com/o/r', 5000);
  assert.ok(seen.some((u) => u.includes('/HEAD/a.py')), 'extra files use the HEAD branch when no default branch exists');
  assert.ok(r.excerpt.includes('--- [a.py] ---'));
  assert.ok(r.excerpt.includes('PY CONTENT'));
  assert.ok(!r.excerpt.includes('b.json'), 'the throwing extra file is skipped');
});

test('a tree listing whose fetch throws falls through to the repository README', async () => {
  setProxyConfig({ enabled: false, baseUrl: '', mode: 'fallback' });
  const seen = [];
  stubFetch([[(_unused) => true, (req) => {
    seen.push(req.url);
    if (req.url.startsWith('https://api.github.com/repos/o/r/contents/src?ref=')) throw new TypeError('contents api down');
    if (req.url === 'https://api.github.com/repos/o/r') return jsonRes({ description: '', default_branch: 'main' });
    if (req.url.includes('/README.md')) return textRes('readme after the contents API died');
    return jsonRes({}, 404);
  }]]);
  const r = await fetchFixture('https://github.com/o/r/tree/main/src', 5000);
  assert.ok(seen.some((u) => u.startsWith('https://api.github.com/repos/o/r/contents/src?ref=')), 'the tree listing is attempted');
  assert.ok(r.excerpt.includes('readme after the contents API died'));
});

test('repo metadata and extra-listing failures still return the README excerpt', async () => {
  setProxyConfig({ enabled: false, baseUrl: '', mode: 'fallback' });
  const seen = [];
  stubFetch([[(_unused) => true, (req) => {
    seen.push(req.url);
    if (req.url === 'https://api.github.com/repos/o/r') throw new TypeError('metadata api down');
    if (req.url === 'https://api.github.com/repos/o/r/contents/') throw new TypeError('extra listing down');
    if (req.url.includes('/README.md')) return req.url.includes('/main/README.md') ? textRes('readme from a resilient fetch') : jsonRes({}, 404);
    return jsonRes({}, 404);
  }]]);
  const r = await fetchFixture('https://github.com/o/r', 5000);
  assert.ok(seen.some((u) => u.includes('/main/README.md')));
  assert.ok(r.excerpt.includes('readme from a resilient fetch'));
});

test('a web redirect without a Location header is not followed and yields no excerpt', async () => {
  setProxyConfig({ enabled: false, baseUrl: '', mode: 'fallback' });
  const seen = [];
  stubFetch([[(_unused) => true, (req) => {
    seen.push(req.url);
    return textRes('<html><body><p>redirected payload</p></body></html>', 301, {});
  }]]);
  const r = await fetchFixture('https://example.com/start', 5000);
  assert.deepEqual(seen, ['https://example.com/start'], 'only the original request is made');
  assert.equal(r.excerpt, '');
});

test('a page without a <title> element falls back to the extracted article title', async () => {
  setProxyConfig({ enabled: false, baseUrl: '', mode: 'fallback' });
  const h1 = 'This Title Was Extracted From The Article Heading Alone When The Page Had No Title Tag At All.';
  const html = '<html><head></head><body><main><article><h1>' + h1 + '</h1><p>' +
    ('Substantial article paragraph content for extraction. '.repeat(20)) + '</p></article></main></body></html>';
  stubFetch([[(_unused) => true, () => textRes(html)]]);
  const r = await fetchFixture('https://example.com/notitle', 5000);
  assert.ok(r.excerpt.includes('Substantial article paragraph content'), 'the article is extracted');
  assert.ok(!r.excerpt.toLowerCase().includes('<title'), 'the fixture really has no <title> element');
  assert.match(r.note, /Page title: This Title Was Extracted From The Article Heading/);
});

test('decodeHtmlEntities drops private-use and astral icon glyphs', async () => {
  setProxyConfig({ enabled: false, baseUrl: '', mode: 'fallback' });
  const html = '<html><body><p>Hi &#xe000; there &#x1F600; &amp; &lt;done&gt; &nbsp; &quot;q&quot; &#39;apos&#39;</p></body></html>';
  stubFetch([[(_unused) => true, () => textRes(html)]]);
  const r = await fetchFixture('https://example.com/entities', 5000);
  assert.ok(!r.excerpt.includes('&#'), 'no entities should remain');
  assert.ok(r.excerpt.includes('Hi'), 'keeps text before a private-use glyph');
  assert.ok(r.excerpt.includes('there'), 'keeps text after a dropped glyph');
  assert.ok(r.excerpt.includes('&') && r.excerpt.includes('<') && r.excerpt.includes('>'), 'named entities decoded');
  assert.ok(r.excerpt.includes('"') && r.excerpt.includes("'"), 'quote entities decoded');
});

test('smartExcerpt returns the whole short page and respects caps for long ones', async () => {
  setProxyConfig({ enabled: false, baseUrl: '', mode: 'fallback' });
  const longBody = 'Every sentence here carries real weight and context. '.repeat(300);
  const html = `<html><body><article><h1>Long Article</h1><p>${longBody}</p></article></body></html>`;
  stubFetch([[(_unused) => true, () => textRes(html)]]);
  const r = await fetchFixture('https://example.com/long', 2000);
  assert.ok(r.excerpt.includes('Long Article'));
  assert.ok(r.excerpt.length <= 2200);
  assert.ok(r.excerpt.includes('(truncated)'));
});

test('Readability extraction failure falls back gracefully', async () => {
  setProxyConfig({ enabled: false, baseUrl: '', mode: 'fallback' });
  // Force Readability to throw by giving it a document that trips its parser.
  const origParse = dom.window.DOMParser.prototype.parseFromString;
  dom.window.DOMParser.prototype.parseFromString = () => { throw new Error('parse exploded'); };
  try {
    stubFetch([[(_unused) => true, () => textRes('<html><body><p>text that survives</p></body></html>')]]);
    const { expectConsoleWarn } = await import('./helpers/expected-console.mjs');
    let r;
    await expectConsoleWarn('Readability extraction failed', async () => {
      r = await fetchFixture('https://example.com/boom', 5000);
    });
    assert.ok(r.excerpt.includes('text that survives'));
  } finally {
    dom.window.DOMParser.prototype.parseFromString = origParse;
  }
});

test('proxy consent falls back to window.confirm when no handler is set', async () => {
  setProxyConfig({ enabled: true, baseUrl: PROXY, mode: 'always', categories: { privateNet: false, providers: false, articles: true } });
  setProxyConfirmHandler(null); // no handler → window.confirm fallback
  const originalConfirm = dom.window.confirm;
  let asked = 0;
  let lastMessage = '';
  dom.window.confirm = (message) => { asked++; lastMessage = String(message); return false; };
  try {
    stubFetch([[(r) => r.url.startsWith(PROXY), () => textRes('<html><body><p>x</p></body></html>')]]);
    const r = await fetchSourceExcerpt('https://example.com/decline', 5000);
    assert.equal(asked, 1, 'window.confirm must be invoked exactly once as the fallback');
    assert.match(lastMessage, /example\.com\/decline/, 'the fallback confirm names the target');
    assert.equal(r.declined, true);
    assert.match(r.note, /declined the proxy/);
  } finally {
    dom.window.confirm = originalConfirm;
  }
});

test('stripHtml picks the largest article/main region when Readability yields nothing', async () => {
  setProxyConfig({ enabled: false, baseUrl: '', mode: 'fallback' });
  // Total body text < 300 chars → Readability returns null → plain-strip path,
  // which must choose the largest <article>/<main> candidate.
  const html = '<html><head><title>Main Pick</title></head><body>' +
    '<article><p>tiny teaser</p></article>' +
    '<main><p>the real main content is the longest text present on this page</p></main>' +
    '</body></html>';
  stubFetch([[(_unused) => true, () => textRes(html)]]);
  const r = await fetchFixture('https://example.com/regions', 5000);
  assert.ok(r.excerpt.includes('real main content'), 'should keep the largest region');
  assert.ok(!r.excerpt.includes('tiny teaser'), 'should drop the smaller article');
  assert.match(r.note, /Page title: Main Pick/);
});

test('decodeHtmlEntities keeps non-private-use hex entities', async () => {
  setProxyConfig({ enabled: false, baseUrl: '', mode: 'fallback' });
  const html = '<html><body><p>Code &#x41; and &#x7A; survive</p></body></html>';
  stubFetch([[(_unused) => true, () => textRes(html)]]);
  const r = await fetchFixture('https://example.com/hex', 5000);
  assert.ok(r.excerpt.includes('A') && r.excerpt.includes('z'));
  assert.ok(!r.excerpt.includes('&#x'), 'hex entities decoded');
});
