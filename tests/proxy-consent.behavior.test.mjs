import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  setProxyConfig, setProxyConfirmHandler, confirmProxyUse, resetProxyConsent,
} from '../src/utils/api/proxy.js';

const PROXY = 'https://relay.example/?u=';

beforeEach(() => { resetProxyConsent(); });
afterEach(() => {
  setProxyConfirmHandler(null);
  setProxyConfig({ enabled: false });
  resetProxyConsent();
});

test('Known destination is named in the consent prompt', async () => {
  setProxyConfig({ enabled: true, baseUrl: PROXY, mode: 'fallback', categories: { articles: true } });
  let msg = '';
  setProxyConfirmHandler((m) => { msg = m; return true; });
  assert.equal(await confirmProxyUse('https://example.org/test-article', 'articles', false), true);
  assert.ok(msg.includes('"https://example.org/test-article"'), 'target is named');
  assert.ok(msg.includes(PROXY), 'destination is named');
  assert.ok(!msg.includes('sent to .'), 'no blank destination interpolation');
});

test('Unknown destination uses explicit neutral wording', async () => {
  setProxyConfig({ enabled: true, baseUrl: '', mode: 'fallback', categories: { articles: true } });
  let msg = '';
  setProxyConfirmHandler((m) => { msg = m; return true; });
  assert.equal(await confirmProxyUse('https://example.org/test-article', 'articles', false), true);
  assert.ok(!msg.includes('sent to .'), 'no blank destination interpolation');
  assert.ok(msg.includes('No proxy destination is configured'), 'explicit neutral wording');
});

test('Policy routing does not claim an observed CORS failure', async () => {
  setProxyConfig({ enabled: true, baseUrl: PROXY, mode: 'fallback', categories: { articles: true } });
  let msg = '';
  setProxyConfirmHandler((m) => { msg = m; return true; });
  await confirmProxyUse('https://example.org/test-article', 'articles', false);
  assert.ok(!msg.includes('was blocked by the CORS policy'), 'no misleading CORS explanation for policy routing');
  assert.ok(msg.includes('proxy policy'), 'actual routing reason stated');
  await confirmProxyUse('https://example.org/test-article', 'articles', true);
  assert.ok(msg.includes('was blocked by the CORS policy'), 'observed CORS failure still explained as such');
});

test('Decline and approve resolve honestly', async () => {
  setProxyConfig({ enabled: true, baseUrl: PROXY, mode: 'fallback', categories: { articles: true } });
  setProxyConfirmHandler(() => false);
  assert.equal(await confirmProxyUse('https://example.org/a', 'articles', false), false, 'decline resolves false');
  setProxyConfirmHandler(() => true);
  assert.equal(await confirmProxyUse('https://example.org/a', 'articles', false), true, 'approve resolves true');
});
