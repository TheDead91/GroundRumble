import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyBodyTemplate } from '../src/utils/api/provider-request-config.js';

const TEMPLATE = '{"model":"{{model}}","system":"{{systemPrompt}}","user":"{{userPrompt}}","tokens":{{maxTokens}},"temp":{{temperature}},"json":{{jsonMode}}}';

const roundTrip = (vars) => {
  const body = applyBodyTemplate(TEMPLATE, { maxTokens: 512, temperature: 0.5, jsonMode: false, ...vars });
  return { body, parsed: JSON.parse(body) };
};

test('Quoted placeholders survive quotes, backslashes and control characters', () => {
  const userPrompt = 'Say "hello" \\ then\nnewline\r\nreturn\ttab';
  const { body, parsed } = roundTrip({ model: 'm', systemPrompt: 'sys', userPrompt });
  assert.equal(parsed.user, userPrompt, 'user prompt value preserved exactly');
  assert.doesNotThrow(() => JSON.parse(body), 'request body is valid JSON');
});

test('Unicode, emoji and combined placeholders round-trip', () => {
  const systemPrompt = 'Système "≈" \\ \n \t éè 中文 🎉';
  const userPrompt = 'combo "{{x}}" \\ \r\n \t Ünïcodé — 攻撃';
  const model = 'model-"q"\\';
  const { body, parsed } = roundTrip({ model, systemPrompt, userPrompt });
  assert.equal(parsed.system, systemPrompt);
  assert.equal(parsed.user, userPrompt);
  assert.equal(parsed.model, model);
  assert.doesNotThrow(() => JSON.parse(body));
});

test('Plain text is untouched and numeric placeholders stay raw', () => {
  const { parsed } = roundTrip({ model: 'm', systemPrompt: 'plain', userPrompt: 'ordinary plain text 123' });
  assert.equal(parsed.user, 'ordinary plain text 123');
  assert.equal(parsed.tokens, 512);
  assert.equal(parsed.temp, 0.5);
  assert.equal(parsed.json, false);
});

test('Unquoted plain-text templates keep raw substitution', () => {
  assert.equal(
    applyBodyTemplate('{{systemPrompt}}|{{userPrompt}}|{{model}}', { systemPrompt: 'SYS', userPrompt: 'USR', model: 'model-a' }),
    'SYS|USR|model-a',
  );
});

test('Quoted placeholders in a non-JSON template are still escaped as string data', () => {
  // A non-JSON body keeps textual substitution, but a quoted occurrence is
  // still escaped so a value cannot close the quotes and inject text.
  assert.equal(
    applyBodyTemplate('PROMPT="{{userPrompt}}"', { userPrompt: 'say "hi" \\ bye' }),
    'PROMPT="say \\"hi\\" \\\\ bye"',
  );
});

test('Legitimate characters are preserved, never stripped', () => {
  const userPrompt = '"\\\n\r\tmust stay"';
  const { parsed } = roundTrip({ model: 'm', systemPrompt: 's', userPrompt });
  assert.ok(parsed.user.includes('"') && parsed.user.includes('\\') && parsed.user.includes('\n'), 'no stripping');
});
