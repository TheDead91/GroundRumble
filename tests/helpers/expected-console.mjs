// Scoped expected-console capture for failure-path tests.
//
// Intentionally failing model responses, transports and parsers produce
// legitimate production console.warn/error output. Those messages must be
// asserted locally (not dumped to the normal suite output) while unexpected
// messages still surface.
//
// Usage:
//   import { expectConsoleWarn, expectConsoleError } from './helpers/expected-console.mjs';
//   await expectConsoleWarn(['batch response did not parse'], async () => {
//     ... action that triggers the warning ...
//   });
//
// Guarantees:
// - scoped to one action (captures only during `fn`)
// - restores the original console method in `finally`
// - asserts every expected string/RegExp was observed
// - re-emits captured messages that match nothing expected, so unexpected
//   output stays visible instead of being swallowed
// - deterministic, no production dependency
import assert from 'node:assert/strict';

const formatCall = (args) => args.map((a) => {
  try {
    return typeof a === 'string' ? a : String(a);
  } catch {
    return '[unprintable]';
  }
}).join(' ');

const matches = (text, expected) => {
  if (typeof expected === 'string') return text.includes(expected);
  if (expected instanceof RegExp) return expected.test(text);
  if (typeof expected === 'function') return expected(text) === true;
  return false;
};

export async function expectConsole(method, expected, fn) {
  const wanted = Array.isArray(expected) ? expected : [expected];
  const original = console[method];
  const captured = [];
  console[method] = (...args) => { captured.push(args); };
  try {
    await fn(captured);
  } finally {
    console[method] = original;
  }
  const texts = captured.map(formatCall);
  for (const want of wanted) {
    const label = want instanceof RegExp ? String(want) : String(want);
    assert.ok(
      texts.some((text) => matches(text, want)),
      `expected console.${method} containing ${label}; captured ${captured.length} call(s): ${JSON.stringify(texts.slice(0, 4))}`
    );
  }
  // Unexpected messages must stay visible: re-emit anything that matched
  // none of the expectations through the restored console method.
  for (const [index, text] of texts.entries()) {
    if (!wanted.some((want) => matches(text, want))) {
      original.apply(console, captured[index]);
    }
  }
  return captured;
}

export const expectConsoleWarn = (expected, fn) => expectConsole('warn', expected, fn);
export const expectConsoleError = (expected, fn) => expectConsole('error', expected, fn);
export const expectConsoleLog = (expected, fn) => expectConsole('log', expected, fn);
