import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { escapeMarkup } from '../src/utils/escape-markup.js';

const sourceOf = (relativePath) => readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const moduleSource = sourceOf('src/utils/escape-markup.js');
const analyzerSource = sourceOf('src/utils/ai-analyzer.js');
const helpersSource = sourceOf('src/utils/ai-run-helpers.js');
const promptsSource = sourceOf('src/utils/prompts.js');
const reportSource = sourceOf('src/utils/reportSanitize.js');

test('EscapeMarkup pins coercion, escape set, order, and already-escaped input', () => {
  assert.equal(escapeMarkup('<tag>&tail>'), '&lt;tag&gt;&amp;tail&gt;');
  assert.equal(escapeMarkup('&lt;<'), '&amp;lt;&lt;', 'ampersands are escaped before angle brackets');
  assert.equal(escapeMarkup(`"'`), `"'`, 'quotes are outside the shared escape set');
  assert.equal(escapeMarkup(null), '');
  assert.equal(escapeMarkup(undefined), '');
  assert.equal(escapeMarkup(42), '42');
});

test('The canonical utility is dependency-free and owns the only basic replacement chain', () => {
  assert.doesNotMatch(moduleSource, /^import\s/m, 'the primitive has no dependencies');
  assert.match(moduleSource, /^export const escapeMarkup = \(value\) => String\(value \?\? ''\)$/m);
  assert.match(moduleSource, /String\(value \?\? ''\)\n  \.replace\(\/&\/g, '&amp;'\)\n  \.replace\(\/<\/g, '&lt;'\)\n  \.replace\(\/>\/g, '&gt;'\);/);

  const sourceUnion = [moduleSource, analyzerSource, helpersSource, promptsSource, reportSource].join('\n');
  for (const needle of [
    ".replace(/&/g, '&amp;')",
    ".replace(/</g, '&lt;')",
    ".replace(/>/g, '&gt;')"
  ]) {
    assert.equal(sourceUnion.split(needle).length - 1, 1, `${needle} exists only in escape-markup.js`);
  }
});

test('All existing consumer wrapper names remain and delegate directly', () => {
  assert.match(analyzerSource, /^import \{ escapeMarkup \} from '\.\/escape-markup\.js';$/m);
  assert.match(analyzerSource, /^const escapeUntrusted = escapeMarkup;$/m);
  assert.match(helpersSource, /^import \{ escapeMarkup \} from '\.\/escape-markup\.js';$/m);
  assert.match(helpersSource, /^export const escapeSourceField = escapeMarkup;$/m);
  assert.match(promptsSource, /^import \{ escapeMarkup \} from '\.\/escape-markup\.js';$/m);
  assert.match(promptsSource, /^export const escapePromptData = escapeMarkup;$/m);
  assert.match(reportSource, /^import \{ escapeMarkup \} from '\.\/escape-markup\.js';$/m);
  assert.match(reportSource, /^export const escapeHtml = \(value\) => escapeMarkup\(value\)$/m);
});

test('Report-specific double and single quote escaping remains layered after shared escaping', () => {
  const start = reportSource.indexOf('export const escapeHtml = ');
  assert.notEqual(start, -1, 'escapeHtml wrapper is present');
  const declaration = reportSource.slice(start).split('\n').reduce((lines, line) => {
    if (lines.at(-1)?.trim().endsWith(');')) return lines;
    lines.push(line);
    return lines;
  }, []).join('\n');
  const expression = declaration.slice(declaration.indexOf('=') + 1).trim().replace(/;$/, '');
  const escapeHtml = Function('escapeMarkup', `return ${expression};`)(escapeMarkup);

  assert.equal(escapeHtml(`<a title="x">Tom & 'Sue'</a>`), '&lt;a title=&quot;x&quot;&gt;Tom &amp; &#39;Sue&#39;&lt;/a&gt;');
  assert.equal(escapeHtml('&lt;'), '&amp;lt;');
  assert.equal(reportSource.split(".replace(/\"/g, '&quot;')").length - 1, 1);
  assert.equal(reportSource.split(".replace(/'/g, '&#39;')").length - 1, 1);
});
