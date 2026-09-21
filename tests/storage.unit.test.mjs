// Coverage + behavior of src/utils/storage.js — corruption-tolerant readers.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
  clear: () => store.clear()
};

const { readStoredJSON, readStoredArray, readStoredObject } = await import('../src/utils/storage.js');

test('readStoredJSON returns the fallback when unset, null, or corrupt', () => {
  store.clear();
  assert.equal(readStoredJSON('missing', 'fb'), 'fb');
  store.set('bad', '{not json');
  assert.equal(readStoredJSON('bad', 'fb'), 'fb');
  store.set('nullish', 'null');
  assert.equal(readStoredJSON('nullish', 'fb'), 'fb');
  store.set('empty', '');
  assert.equal(readStoredJSON('empty', 'fb'), 'fb');
});

test('readStoredJSON parses valid JSON and survives a throwing localStorage', () => {
  store.set('good', '{"a":1}');
  assert.deepEqual(readStoredJSON('good', 'fb'), { a: 1 });
  const orig = globalThis.localStorage.getItem;
  globalThis.localStorage.getItem = () => { throw new Error('blocked'); };
  try {
    assert.equal(readStoredJSON('good', 'fb'), 'fb');
  } finally {
    globalThis.localStorage.getItem = orig;
  }
});

test('readStoredArray returns arrays and falls back for wrong types', () => {
  store.clear();
  assert.deepEqual(readStoredArray('a'), []);
  store.set('a', '[1,2]');
  assert.deepEqual(readStoredArray('a'), [1, 2]);
  store.set('a', '{"x":1}');
  assert.deepEqual(readStoredArray('a'), [], 'object → fallback');
  store.set('a', '"str"');
  assert.deepEqual(readStoredArray('a', ['d']), ['d'], 'string → custom fallback');
});

test('readStoredObject returns objects and falls back for wrong types', () => {
  store.clear();
  assert.deepEqual(readStoredObject('o'), {});
  store.set('o', '{"x":1}');
  assert.deepEqual(readStoredObject('o'), { x: 1 });
  store.set('o', '[1]');
  assert.deepEqual(readStoredObject('o'), {}, 'array → fallback');
  store.set('o', '7');
  assert.deepEqual(readStoredObject('o', { d: true }), { d: true }, 'number → custom fallback');
});