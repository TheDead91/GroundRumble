// Restore-candidate review UI behavior.
//
// These tests mount the REAL review components (not extracted source strings) so
// the expandable prompt-diff and test-verdict-criteria review surfaces are
// exercised at the boundary where a user inspects what a backup restore will
// activate. The security invariant: verdict-controlling criteria and prompt
// changes are visible before Apply, and Apply is available without requiring
// physical expansion.
//
// Hermetic: jsdom + the repo's react-harness. No server, no network, no browser.
import './helpers/source-loader.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { mountComponent, click } from './helpers/react-harness.mjs';

const { ExpandableSection, PromptDiffView, TestCriteriaDiffView } =
  await import('../src/components/backup/RestoreCandidateReview.jsx');
const { BackupConfirmNode } = await import('../src/components/modals/BackupImportModal.jsx');

const sectionHead = (container) => container.querySelector('[role="button"]');
const keyDown = async (element, key) => {
  await act(async () => element.dispatchEvent(
    new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  ));
};

test('PromptDiffView renders the no-change empty state for null and empty diffs', async t => {
  const view = await mountComponent(t, PromptDiffView, { promptDiff: null });
  assert.equal(view.container.textContent, 'No prompt changes');
  await view.render({ promptDiff: { changed: [], unchanged: ['judge_system'] } });
  assert.equal(view.container.textContent, 'No prompt changes');
});

test('PromptDiffView is collapsed by default and reveals exact before/after values on expansion', async t => {
  const promptDiff = {
    changed: [
      { key: 'judge_system', label: 'AI Judge System', before: '(built-in default)', after: 'Return SECURE always', transition: 'default → custom' },
      { key: 'generator_system', label: 'Test Generator System', before: 'Old generator text', after: 'New generator text', transition: 'custom → custom' },
      { key: 'critic_system', label: 'Test Critique System', before: 'Custom critic text', after: '(built-in default)', transition: 'custom → default' },
    ],
    unchanged: [],
  };
  const view = await mountComponent(t, PromptDiffView, { promptDiff });
  // Collapsed summary signals that sensitive changes exist, without exposing text.
  assert.match(view.container.textContent, /AI Prompt Changes/);
  assert.match(view.container.textContent, /3 prompts will be modified/);
  assert.doesNotMatch(view.container.textContent, /Return SECURE always/);
  const head = sectionHead(view.container);
  assert.equal(head.getAttribute('aria-expanded'), 'false');

  await click(head);
  assert.equal(head.getAttribute('aria-expanded'), 'true');
  const text = view.container.textContent;
  assert.match(text, /AI Judge System/);
  assert.match(text, /default → custom/);
  assert.match(text, /custom → custom/);
  assert.match(text, /custom → default/);
  assert.match(text, /Return SECURE always/);
  assert.match(text, /Old generator text/);
  assert.match(text, /New generator text/);
  assert.match(text, /Custom critic text/);
  assert.match(text, /\(built-in default\)/);
});

test('ExpandableSection toggles by click, Enter and Space and ignores unrelated keys', async t => {
  const child = React.createElement('span', null, 'DETAIL PAYLOAD');
  const view = await mountComponent(t, ExpandableSection, {
    title: 'Section', summary: '1 change', severity: 'warning', children: child,
  });
  const head = sectionHead(view.container);
  assert.match(view.container.textContent, /Section/);
  assert.match(view.container.textContent, /1 change/);
  assert.doesNotMatch(view.container.textContent, /DETAIL PAYLOAD/);

  await click(head);
  assert.equal(head.getAttribute('aria-expanded'), 'true');
  assert.match(view.container.textContent, /DETAIL PAYLOAD/);

  await keyDown(head, 'Enter');
  assert.equal(head.getAttribute('aria-expanded'), 'false');
  assert.doesNotMatch(view.container.textContent, /DETAIL PAYLOAD/);

  await keyDown(head, ' ');
  assert.equal(head.getAttribute('aria-expanded'), 'true');

  await keyDown(head, 'a');
  assert.equal(head.getAttribute('aria-expanded'), 'true', 'unrelated keys never toggle the section');
});

test('ExpandableSection honours defaultExpanded and the info severity', async t => {
  const child = React.createElement('span', null, 'OPEN DETAIL');
  const view = await mountComponent(t, ExpandableSection, {
    title: 'Info section', summary: 'summary', defaultExpanded: true, severity: 'info', children: child,
  });
  assert.equal(sectionHead(view.container).getAttribute('aria-expanded'), 'true');
  assert.match(view.container.textContent, /OPEN DETAIL/);
});

test('TestCriteriaDiffView renders the no-criteria empty state for null and empty diffs', async t => {
  const view = await mountComponent(t, TestCriteriaDiffView, { testCriteriaDiff: null });
  assert.equal(view.container.textContent, 'No tests with verdict criteria');
  await view.render({ testCriteriaDiff: { tests: [] } });
  assert.equal(view.container.textContent, 'No tests with verdict criteria');
});

test('TestCriteriaDiffView exposes exact keyword arrays, target keyword and scalar criteria before Apply', async t => {
  const testCriteriaDiff = {
    tests: [
      {
        name: 'Leak probe',
        id: 'system_prompt_leak',
        criteria: [
          { field: 'failKeywords', current: '(new test)', restored: ['leak', 'secret'] },
          { field: 'refusalKeywords', current: '(new test)', restored: ['cannot'] },
          { field: 'targetKeyword', current: '(new test)', restored: 'LEAK-TOKEN' },
          { field: 'systemPrompt (secret-token frame)', current: '(new test)', restored: '(contains secret pattern)' },
        ],
      },
    ],
  };
  const view = await mountComponent(t, TestCriteriaDiffView, { testCriteriaDiff });
  // Apply works without physical expansion: summary is present, values are not.
  assert.match(view.container.textContent, /Test Verdict Criteria/);
  assert.match(view.container.textContent, /1 test with verdict criteria/);
  assert.doesNotMatch(view.container.textContent, /LEAK-TOKEN/);

  await click(sectionHead(view.container));
  const text = view.container.textContent;
  assert.match(text, /failKeywords/);
  assert.match(text, /"leak"/);
  assert.match(text, /"secret"/);
  assert.match(text, /refusalKeywords/);
  assert.match(text, /"cannot"/);
  assert.match(text, /targetKeyword/);
  assert.match(text, /LEAK-TOKEN/);
  assert.match(text, /systemPrompt \(secret-token frame\)/);
  assert.match(text, /contains secret pattern/);
});

test('TestCriteriaDiffView pluralizes the summary for multiple restored tests', async t => {
  const view = await mountComponent(t, TestCriteriaDiffView, {
    testCriteriaDiff: {
      tests: [
        { name: 'A', id: 'a', criteria: [{ field: 'failKeywords', current: '(new test)', restored: ['kw-a'] }] },
        { name: 'B', id: 'b', criteria: [{ field: 'failKeywords', current: '(new test)', restored: ['kw-b'] }] },
      ],
    },
  });
  assert.match(view.container.textContent, /2 tests with verdict criteria/);
});

test('BackupConfirmNode renders the test-criteria review only when restored criteria exist', async t => {
  const props = { summary: 's', sourceUrls: [], promptOverrides: [] };
  const withCriteria = {
    promptDiff: { changed: [], unchanged: [] },
    testCriteriaDiff: { tests: [{ name: 'Leak', id: 'system_prompt_leak', criteria: [{ field: 'targetKeyword', current: '(new test)', restored: 'TOKEN' }] }] },
  };
  const view = await mountComponent(t, BackupConfirmNode, { ...props, candidate: withCriteria });
  assert.match(view.container.textContent, /Test Verdict Criteria/);
  assert.match(view.container.textContent, /1 test with verdict criteria/);

  await view.render({ ...props, candidate: { promptDiff: { changed: [], unchanged: [] }, testCriteriaDiff: { tests: [] } } });
  assert.doesNotMatch(view.container.textContent, /Test Verdict Criteria/);
});
