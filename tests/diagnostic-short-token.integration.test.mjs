// Regression coverage: untrusted remote/transport diagnostic material
// displayed transiently (toast) must close the 16–39 token-like gap before it
// reaches the mounted sink. A fake unknown-prefix token (custom relay/gateway
// key) that the canonical redactor cannot classify must still be scrubbed from
// the ACTUAL rendered toast, while ordinary prose and canonical redaction are
// preserved. No external network traffic.
import './helpers/source-loader.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { useLayoutEffect } from 'react';
import { act } from 'react';
import { mountComponent } from './helpers/react-harness.mjs';

const { UIProvider } = await import('../src/context/UIContext.jsx');
const { useUI, useToast } = await import('../src/context/useUI.js');
const { ToastContainer } = await import('../src/components/ToastContainer.jsx');
const { projectDiagnosticTextStrict } = await import('../src/utils/project-diagnostic.js');

// Unknown-prefix token-like runs: no known provider prefix, not labelled, under
// the 40-char high-entropy threshold, inside the 16–39 short-token window.
const SHORT_TOKEN_16 = 'AbCdEfGhIjKlMnOp';           // 16 chars
const SHORT_TOKEN_24 = 'QrStUvWxYz0123456789ab';     // 24 chars

const mountToastSink = (t) => {
  let addToast;
  function Probe() {
    const ui = useUI();
    const toast = useToast();
    useLayoutEffect(() => { addToast = ui.addToast; });
    return React.createElement(ToastContainer, { toasts: toast.toasts, removeToast: toast.removeToast });
  }
  return mountComponent(t, () => React.createElement(UIProvider, null, React.createElement(Probe)))
    .then((view) => ({ view, push: (m, type) => act(async () => addToast(m, type)) }));
};

test('the mounted toast sink scrubs unknown-prefix 16–39 tokens and keeps prose', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { view, push } = await mountToastSink(t);

  // A provider-controlled diagnostic carrying a fake unknown-prefix token and a
  // canonical token, projected the way the real remote-diagnostic sources do.
  const remote = new Error(`relay rejected key ${SHORT_TOKEN_16} and token ${SHORT_TOKEN_24} (auth sk-probe-1234567890)`);
  await push(`Proxy test failed: ${projectDiagnosticTextStrict(remote)}`, 'error');

  const text = view.container.textContent;
  assert.match(text, /Proxy test failed/, 'the category/status prefix survives');
  assert.match(text, /relay rejected key/, 'useful prose survives');
  assert.doesNotMatch(text, new RegExp(SHORT_TOKEN_16), 'the 16-char unknown-prefix token is scrubbed');
  assert.doesNotMatch(text, new RegExp(SHORT_TOKEN_24), 'the 24-char unknown-prefix token is scrubbed');
  assert.doesNotMatch(text, /sk-probe-1234567890/, 'the canonical token is scrubbed');
  assert.match(text, /\[REDACTED_TOKEN\]/, 'the short-token placeholder is present');
});

test('the mounted toast sink does not scrub ordinary prose with no token-like run', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { view, push } = await mountToastSink(t);

  await push('Authentication failed (HTTP 401): the key could not be verified.', 'error');
  const text = view.container.textContent;
  assert.match(text, /Authentication failed \(HTTP 401\)/, 'ordinary status text is preserved');
  assert.doesNotMatch(text, /\[REDACTED_TOKEN\]/, 'no token-like run is fabricated');
});
