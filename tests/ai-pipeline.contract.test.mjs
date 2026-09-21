// Contract: the AI generation pipeline (startAiGeneration,
// runAiAnalysis via analyzeSourcesWithAI, runAiGeneration via
// generateTestsWithAI incl. batch/budget staging, runAiCritique via
// critiqueGeneratedTests, the stage/progress/elapsed reporting machine and
// the draft commit into the shared TestsContext catalog) is implemented
// INSIDE src/hooks/useAIGeneration.js — App.jsx keeps only the wizard button
// bindings.
//
// The collaborator bag is deliberately slim: preview/draft/catalog/selection/
// recent-marker state is context-owned (the hook consumes it via its own
// useAIGen()/useTests() destructures) and the signature carries only the
// cross-domain non-context deps.
//
// The pure mapping/text helpers (escapeSourceField/mapAiTests/buildSourcesText)
// may live in src/utils/ai-run-helpers.js, parameterized for purity: the
// sources list and the valid-technique guard arrive as a deps argument. The
// helper-definition pins resolve across the hook ∪ App ∪ utils trio (each
// defined exactly once across the union) and the same ordered mapAiTests body
// is asserted against whichever module owns it; buildAiRunCtx stays hook-local.
// The mapAiTests call-site needles accept the parameterized argument list, so
// the contract holds both before and after that split.
//
// The useAIGen() destructure enumeration pins the live names only; the legacy
// bare stepper readers (and their return keys) are not part of the contract.
//
// Source-text level because Node cannot import JSX/extensionless specifiers
// under bare node:test (repo convention: see tests/source-intake.contract.test.mjs
// and tests/audit-engine.contract.test.mjs). The composed API-layer semantics
// (analyzeSourcesWithAI / generateTestsWithAI / critiqueGeneratedTests) stay
// exercised behaviorally by tests/analyzer.integration.test.mjs,
// tests/generator-pipeline.integration.test.mjs and tests/judge-evaluation.integration.test.mjs (the
// hook must call the SAME fns with the SAME argument shapes).
//
// Placement: the four ops + the draft commit are pinned INSIDE the hook file
// with indentation-tolerant literals; the cancellation op is pinned ONCE ACROSS
// the App.jsx+hook pair; the pipeline collaborators must reach the hook through
// its declared parameter bag (the canonical port), never via module-level
// mutable state.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const APP_PATH = 'src/App.jsx';
const HOOK_PATH = 'src/hooks/useAIGeneration.js';
const Helpers_PATH = 'src/utils/ai-run-helpers.js';

const readSource = (relPath) => readFileSync(join(root, relPath), 'utf8').replace(/\r\n/g, '\n');
let app = '', hook = '', modal = '', results = '';
try {
  app = readSource(APP_PATH);
  hook = readSource(HOOK_PATH);
  modal = readSource('src/components/modals/AiGenWizardModal.jsx');
  results = readSource('src/components/modals/AiGenWizardResults.jsx');
} catch { /* missing files fail their first assertion */ }
// The helpers module may not exist on a given tree — an empty string keeps
// every union pin green there and lets a tree that has the module pin the
// helpers where they landed.
let utilsSrc = '';
try { utilsSrc = readSource(Helpers_PATH); } catch { /* module absent — tolerant read */ }

const countIn = (source, re) => [...source.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'))].length;
const countStr = (source, needle) => source.split(needle).length - 1;
const idx = (source, needle, from = 0) => source.indexOf(needle, from);

// Extracts a function-body member from a component/hook/module body: from its
// (optionally exported) `const NAME = ` declaration line to its closing line
// at the declaration's own indent. Hook members sit at the 2-space
// component-body indent while utils-module helpers sit at column 0 — the
// closers and the next-decl tripwire derive from the declaration's own indent
// so both homes extract identically and inner declarations never trip the
// tripwire.
function extractMember(source, name, closers = null) {
  const declRe = name === '(useEffect-elapsed)'
    ? /^  useEffect\(\(\) => \{\n    if \(!aiGenerating\) \{ setAiGenElapsed\(0\); return; \}/m
    : new RegExp(`^ *(?:export )?const ${name} = `, 'm');
  const m = declRe.exec(source);
  assert.ok(m, `member ${name} not found at a top-level or component-body indent`);
  const declLine = source.slice(m.index, source.indexOf('\n', m.index));
  const indent = declLine.match(/^ */)[0];
  closers = closers || [`${indent}};`, `${indent}});`];
  const lines = source.slice(m.index).split('\n');
  const buf = [lines[0]];
  const nextDecl = new RegExp(`^${indent}(?:export )?(?:const \\w+ = |useEffect\\(|function )`);
  for (let i = 1; i < lines.length; i++) {
    if (i > 1 && nextDecl.test(lines[i])) assert.fail(`member ${name} never closed before the next declaration`);
    buf.push(lines[i]);
    if (closers.includes(lines[i]) || (name === '(useEffect-elapsed)' && new RegExp('^  }, \\[aiGenerating(, setAiGenElapsed)?\\]\\);$').test(lines[i]))) {
      return buf.join('\n');
    }
  }
  assert.fail(`member ${name} has no closing line`);
}

const norm = (text) => text.replace(/\s+/g, ' ').trim();
const bodyOf = (source, name, closers) => norm(extractMember(source, name, closers));

// Top-level extractor for the helpers module: its members are exported const
// declarations at column 0, closed by a bare `};` (or the buildSourcesText
// join coda) at column 0.
function extractTopMember(source, name) {
  const m = new RegExp(`^(?:export )?const ${name} = `, 'm').exec(source);
  assert.ok(m, `member ${name} not found at the top level of the helpers module`);
  const lines = source.slice(m.index).split('\n');
  const buf = [lines[0]];
  const closers = ['};', "}).join('\\n');"];
  for (let i = 1; i < lines.length; i++) {
    buf.push(lines[i]);
    if (closers.includes(lines[i])) return buf.join('\n');
  }
  assert.fail(`member ${name} has no closing line`);
}
const topBodyOf = (source, name) => norm(extractTopMember(source, name));
const ordered = (body, label, needles) => {
  let at = -1;
  for (const needle of needles) {
    // Regex needles match alternation shapes; the ordered cursor still advances
    // monotonically for strings and regexes alike.
    let found;
    if (needle instanceof RegExp) {
      const m = body.slice(at + 1).search(needle);
      found = m > -1 ? at + 1 + m : -1;
    } else {
      found = body.indexOf(needle, at + 1);
    }
    assert.ok(found > at, `${label}: expected …${needle.source || needle}… in order`);
    at = found;
  }
};

const OPS = ['startAiGeneration', 'runAiAnalysis', 'runAiGeneration', 'runAiCritique'];
const PAIR = app + '\n' + hook;

// ---------------------------------------------------------------------------
// The pipeline ops are implemented behind the declared hook contract
// ---------------------------------------------------------------------------

test('The four pipeline ops + draft commit are hook-defined — exactly once each, gone from App', () => {
  assert.ok(hook.includes('export function useAIGeneration({'), 'the hook still exports the parameter-bag contract');
  for (const name of [...OPS, 'confirmAiPreview']) {
    const re = new RegExp(`const ${name} = (async )?\\(`, 'g');
    assert.equal(countIn(hook, re), 1, `the hook defines ${name} exactly once`);
    assert.equal(countIn(app, re), 0, `App no longer defines ${name}`);
  }
  const retStart = idx(hook, 'return {\n    assessSource,');
  assert.ok(retStart > 0, 'the hook return surface keeps its T08 head');
  const retSurface = hook.slice(retStart, idx(hook, '};', retStart));
  for (const name of [...OPS, 'confirmAiPreview']) {
    assert.ok(new RegExp(`\\b${name}\\b`).test(retSurface), `the hook return surface exposes ${name}`);
  }
});

test('The pipeline collaborators arrive through the slim deps and the consumed contexts', () => {
  const sigStart = idx(hook, 'export function useAIGeneration({');
  const sigEnd = idx(hook, '}) {', sigStart);
  const sig = sigEnd > sigStart ? hook.slice(sigStart, sigEnd) : hook;
  // The bag stays collapsed: the preview/draft/catalog/selection/recent-marker
  // state rides the consumed contexts; the signature keeps only the cross-domain
  // non-context deps (zero aiGen*/aiPreview* setters).
  assert.doesNotMatch(sig, /\b(setAiPreview\w*|setRecentlyGeneratedIds|aiPreview|aiPreviewSelected|recentlyGeneratedIds|customTests|setCustomTests|setSelectedTests|validTechniqueIds|setAiGen\w*|aiGenCount|aiGenBatch|aiGenBudget|aiAdvancedMode|aiGenMode|aiWizardStep|setAiWizardStep|aiGenElapsed|setAiGenElapsed)\b/, 'the consolidated state left the signature');
  for (const param of ['atlasMatrix', 'allTests', 'aiGenAbortRef']) {
    assert.ok(new RegExp(`\\b${param}\\b`).test(sig), `the slim contract keeps ${param}`);
  }
  for (const param of ['buildJudge', 'effectiveGenConfig', 'addToast', 'runWithTimeout', 'aiRunCtxRef']) {
    assert.ok(new RegExp(`\\b${param}\\b`).test(sig), `the slim contract keeps ${param}`);
  }
  // The context-sourced collaborators reach the pipeline through the hook's
  // own context destructures.
  const aiGenDestructure = /const \{([^}]*)\}\s*=\s*useAIGen\(\);/.exec(hook);
  assert.ok(aiGenDestructure, 'the hook consumes useAIGen() (T04 consolidation)');
  for (const name of ['aiGenCount', 'aiGenBatch', 'aiGenBudget', 'aiAdvancedMode', 'aiGenMode', 'setAiWizardStep', 'aiGenElapsed', 'setAiGenElapsed', 'aiPreview', 'setAiPreview', 'aiPreviewSelected', 'setAiPreviewSelected', 'recentlyGeneratedIds', 'setRecentlyGeneratedIds', 'aiDraft', 'setAiDraft', 'aiProfileEdits', 'setAiProfileEdits']) {
    assert.match(aiGenDestructure[1], new RegExp(`\\b${name}\\b`), `the useAIGen() destructure binds ${name}`);
  }
  const testsDestructure = /const \{([^}]*)\}\s*=\s*useTests\(\);/.exec(hook);
  assert.ok(testsDestructure, 'the hook consumes useTests() (T04 consolidation)');
  for (const name of ['customTests', 'setCustomTests', 'setSelectedTests']) {
    assert.match(testsDestructure[1], new RegExp(`\\b${name}\\b`), `the useTests() destructure binds ${name}`);
  }
  assert.match(hook, /const validTechniqueIds = new Set\(\(atlasMatrix \|\| \[\]\)\.flatMap/, 'the technique guard is hook-derived from the atlasMatrix dep (T04)');
  assert.ok(app.includes('= useAIGeneration({'), 'App still adopts the hook through the slim deps');
});

test('The mapping helpers resolve once across hook ∪ App ∪ utils — buildAiRunCtx stays hook-local', () => {
  // The pure mapping/text helpers may live in src/utils/ai-run-helpers.js — the
  // helper definitions resolve across the trio exactly once each, and the hook
  // still reaches all four names (via its import or its own definition).
  const TRIO = app + '\n' + hook + '\n' + utilsSrc;
  for (const name of ['escapeSourceField', 'mapAiTests', 'buildSourcesText']) {
    assert.equal(countIn(TRIO, new RegExp(`const ${name} = `, 'g')), 1, `${name} is defined exactly once across the hook ∪ App ∪ utils trio`);
  }
  // The two call-level helpers stay consumed by the hook's orchestration.
  // escapeSourceField is module-internal to buildSourcesText when the helpers
  // live in the utils module — the hook must NOT import it (an unused import
  // would be a lint finding), so its union guarantee is the exactly-once pin
  // above.
  for (const name of ['mapAiTests', 'buildSourcesText']) {
    assert.ok(countStr(hook, name) >= 1, `${name} is reachable from the hook`);
  }
  assert.equal(countIn(PAIR, /const buildAiRunCtx = /g), 1, 'buildAiRunCtx stays defined exactly once across the App+hook pair (t08 contract)');
  assert.ok(countStr(hook, 'buildAiRunCtx') >= 1, 'buildAiRunCtx is hook-reachable');
  assert.equal(countIn(TRIO, /const buildAiRunCtx = /g), 1, 'buildAiRunCtx does not leak into the helpers module');
  // The same ordered mapping table is asserted against whichever module owns
  // it; the body is byte-identical across its possible homes.
  const mapSrc = (countStr(hook, 'const mapAiTests = ') > 0) ? hook : (countStr(utilsSrc, 'mapAiTests') > 0 ? utilsSrc : app);
  assert.ok(countStr(mapSrc, 'mapAiTests') > 0, 'mapAiTests resolves to hook or helpers-module content');
  const mapBody = mapSrc === utilsSrc ? topBodyOf(utilsSrc, 'mapAiTests') : bodyOf(mapSrc, 'mapAiTests');
  ordered(mapBody, 'mapAiTests', [
    'const fallbackFor = (t) => fallback?.find(candidate =>',
    '&& candidate.candidateId === t.candidateId',
    'return byKey(t?.sourceKey)',
    '|| byTitle(fb?.sourceTitle);',
    'id: `ai_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,'
  ]);
});

test('StartAiGeneration lives in the hook — arms the controller, builds ctx, branches by mode', () => {
  const body = bodyOf(hook, 'startAiGeneration');
  ordered(body, 'startAiGeneration', [
    'setAiGenerating(true);',
    "setAiWizardError('');",
    'setAiUsedGuidance(guidance);',
    'setAiDraft({ tests: [], failures: 0 });',
    'setAiProfileEdits({});',
    'const controller = new AbortController();',
    'aiGenAbortRef.current = controller;',
    'const ctx = await buildAiRunCtx(guidance, controller.signal);',
    'if (controller.signal.aborted || aiGenAbortRef.current !== controller) {',
    'aiRunCtxRef.current = { ...ctx, controller, signal: controller.signal };',
    "if (!aiAdvancedMode) setAiWizardStep('running');",
    "if (aiGenMode === 'deep') await runAiAnalysis();",
    'else await runAiGeneration();'
  ]);
});

test('RunAiAnalysis lives in the hook — same analyzeSourcesWithAI shape, progress ladder, fallbacks', () => {
  const body = bodyOf(hook, 'runAiAnalysis');
  ordered(body, 'runAiAnalysis', [
    'const ctx = aiRunCtxRef.current;',
    "setAiGenStage('analyzing');",
    'setAiGenProgress(4);',
    'setAiGenStageDetail(`Analyzing ${sources.length} source(s)…`);',
    'const analyzed = await analyzeSourcesWithAI(',
    'sources.map(s => ({ sourceKey: s.key, title: s.title, description: s.description, excerpt: s.excerpt })),',
    'signal,',
    '3,',
    'setAiGenProgress(Math.round(4 + (done / total) * 60));',
    'aiGenBudget,',
    'if (signal?.aborted || aiGenAbortRef.current !== ctx.controller) return;',
    'sources.forEach((src, i) => { profiles[src.key] = analyzed[i] || null; });',
    'sources.forEach(src => { profiles[src.key] = null; });',
    'setAiSourceProfiles(profiles);',
    'setAiProfileEdits(profiles);',
    "setAiWizardError('Source analysis failed for every selected source. Review the errors or retry before generating tests.');",
    'await runAiGeneration(profiles);'
  ]);
  assert.ok(body.includes("setAiWizardStep('profiles');"), 'advanced mode still pauses at the Profiles checkpoint');
});

test('RunAiGeneration lives in the hook — same generateTestsWithAI staging (batch/budget) and routing', () => {
  const body = bodyOf(hook, 'runAiGeneration');
  ordered(body, 'runAiGeneration', [
    'const ctx = aiRunCtxRef.current;',
    "setAiGenStage('generating');",
    'setAiGenProgress(6);',
    'setAiGenStageDetail(`Generating ${aiGenCount} test(s)...`);',
    'const profiles = profilesOverride !== undefined ? profilesOverride : aiProfileEdits;',
    'sourcesText: buildSourcesText(sources),',
    'count: aiGenCount,',
    'batchSize: aiGenBatch,',
    'maxTokens: aiGenBudget',
    'setAiGenProgress(Math.round(6 + (done / total) * 94));',
    // Tolerant needle: `mapAiTests(generated, null)` and the
    // parameterized `(generated, null, sources, { validTechniqueIds })` are
    // both accepted.
    /\bconst draftTests = mapAiTests\(generated, null(?:, sources, \{ validTechniqueIds \})?\);/,
    'setAiDraft({ tests: draftTests, failures });',
    "setAiWizardStep('draft');",
    "setAiWizardError('AI returned no valid tests. Try different sources, fewer tests, or a larger response size.');",
    "if (aiGenMode === 'deep') {",
    'await runAiCritique(draftTests);',
    'setAiPreview({ tests: draftTests });',
    "setAiWizardStep('results');"
  ]);
  assert.ok(body.includes('setAiWizardError(`AI generation failed: ${redactSensitiveText(err?.message || err)}`);'), 'failure message stays redacted');
});

test('RunAiCritique lives in the hook — same critiqueGeneratedTests shape and critique-drop behavior', () => {
  const body = bodyOf(hook, 'runAiCritique');
  ordered(body, 'runAiCritique', [
    'const draft = tests || aiDraft.tests;',
    "setAiGenStage('critiquing');",
    'setAiGenProgress(8);',
    "setAiGenStageDetail('Reviewing and refining the generated tests...');",
    'const refined = await critiqueGeneratedTests(gen, draft, { techniqueCatalog, existingCoverage, count: draft.length, guidance, maxTokens: aiGenBudget, validTechniqueIds, profileTechniqueIds: new Set(draft.map((t) => t.techniqueId).filter(Boolean)) }, signal);',
    // Tolerant needle: same alternation.
    /\bconst finalTests = refined\.length > 0 \? mapAiTests\(refined, draft(?:, sources, \{ validTechniqueIds \})?\) : draft;/,
    'setAiPreview({ tests: finalTests });',
    'setAiPreviewSelected(new Set(finalTests.map(t => t.id)));',
    "setAiWizardStep('results');"
  ]);
  const catchStart = body.indexOf('} catch {');
  assert.ok(catchStart > 0, 'runAiCritique keeps a bare catch');
  assert.ok(body.slice(catchStart).includes('setAiPreview({ tests: draft });'), 'a failed critique still drops back to the screened draft');
  assert.ok(body.includes("setAiWizardError('AI returned no valid tests after refinement. Try different sources or fewer tests.');"), 'empty refined-set error copy survives');
});

test('Stage/progress/elapsed reporting lives in the hook; App keeps zero tickers', () => {
  const effect = bodyOf(hook, '(useEffect-elapsed)');
  assert.ok(effect.includes('setAiGenElapsed(Math.round((Date.now() - start) / 1000)), 500'), 'the 500ms elapsed ticker moves into the hook');
  assert.ok(effect.endsWith('}, [aiGenerating, setAiGenElapsed]);'), 'the effect re-arms on the generating flag and lists the stable elapsed setter so the exhaustive-deps lint stays clean');
  assert.equal(countStr(app, 'setAiGenElapsed(Math.round((Date.now() - start) / 1000))'), 0, 'App no longer ticks elapsed time');
  assert.ok(hook.includes("import { useCallback, useEffect } from 'react';") || /\buseEffect\b/.test(hook.slice(0, idx(hook, 'export function'))), 'the hook imports useEffect');
});

// ---------------------------------------------------------------------------
// Stage machine, progress %, elapsed timer, fast/deep mode differences,
// failure/critique-drop counts behave identically
// ---------------------------------------------------------------------------

test('The three-value stage machine with matching seeds and full teardown moved intact', () => {
  const analysis = bodyOf(hook, 'runAiAnalysis');
  const generation = bodyOf(hook, 'runAiGeneration');
  const critique = bodyOf(hook, 'runAiCritique');
  assert.equal(countStr(analysis, "setAiGenStage('analyzing')"), 1, "runAiAnalysis enters 'analyzing'");
  assert.equal(countStr(generation, "setAiGenStage('generating')"), 1, "runAiGeneration enters 'generating'");
  assert.equal(countStr(critique, "setAiGenStage('critiquing')"), 1, "runAiCritique enters 'critiquing'");
  assert.equal(countStr(analysis, 'setAiGenProgress(4);') + countStr(generation, 'setAiGenProgress(6);') + countStr(critique, 'setAiGenProgress(8);'), 3, 'seeds 4/6/8 move intact');
  assert.equal(countStr(hook, 'signal?.aborted || aiGenAbortRef.current !== ctx.controller'), 3, 'all three awaited ops keep the stale-controller guard');
  for (const name of ['runAiAnalysis', 'runAiGeneration', 'runAiCritique']) {
    const body = bodyOf(hook, name);
    assert.ok(body.split('setAiGenStage(null);').length - 1 >= 1 && body.includes("setAiGenStageDetail('');"), `${name} tears the machine down on every exit path`);
  }
});

test('Fast/deep differences survive — the running rail renders once across App + results, hook routing unchanged', () => {
  // The running pane may live in AiGenWizardResults.jsx; the phase-rail filter
  // pin is evaluated across the App + results pair.
  assert.equal(countStr(app + '\n' + results, ".filter(ph => aiGenMode === 'deep' || ph.id === 'generating')"), 1, 'the phase rail still hides analysis in fast mode (results-side since T18)');
  // The two rail-copy pins are evaluated across the App + modal + results union.
  const railUnion = app + '\n' + modal + '\n' + results;
  assert.ok(railUnion.includes("{aiGenStage === 'analyzing' && 'Analyzing sources…'}"), 'rail copy: analyzing');
  assert.ok(railUnion.includes("{aiGenStage === 'critiquing' && 'Critiquing & refining tests…'}"), 'rail copy: critiquing');
  // The config-step Generate button may live in the wizard modal; the
  // simple-mode busy label is evaluated across the App + modal pair and exists
  // exactly once across the pair.
  assert.equal(countStr(app + '\n' + modal, "{aiGenStage === 'generating' || aiGenStage === 'critiquing' ? 'Generating…' : 'Analyzing…'}"), 1, 'simple-mode button copy unchanged (modal-side since T17)');
  assert.equal(countStr(railUnion, 'Elapsed: {aiGenElapsed}s'), 1, 'the running screen still renders elapsed seconds (results-side since T18)');
  assert.ok(bodyOf(hook, 'startAiGeneration').includes("if (aiGenMode === 'deep') await runAiAnalysis(); else await runAiGeneration();"), 'deep starts at analysis, fast at generation');
});

test('Cancellation still defined exactly once across the pair and still resets to config', () => {
  const src = countStr(hook, 'const cancelAiGeneration = ') > 0 ? hook : app;
  assert.equal(countIn(PAIR, /const cancelAiGeneration = /g), 1, 'cancelAiGeneration is defined exactly once across the pair');
  const body = bodyOf(src, 'cancelAiGeneration');
  ordered(body, 'cancelAiGeneration', [
    'const c = aiGenAbortRef.current;',
    'if (c) { try { c.abort(); } catch { /* ignore */ } }',
    'try { aiRefineAbortRef.current.abort(); } catch { /* ignore */ } }',
    'aiRunCtxRef.current = null;',
    "setAiWizardStep('config');"
  ]);
  // Both wizard Back buttons may live in AiGenWizardResults.jsx — the count of
  // 2 is evaluated across the App + results pair.
  assert.equal(countStr(app + '\n' + results, '<button onClick={cancelAiGeneration}'), 2, 'both Back buttons still cancel (results-side since T18)');
});

// ---------------------------------------------------------------------------
// Generated drafts land in the shared test catalog through TestsContext
// ---------------------------------------------------------------------------

test('The draft commit lives in the hook and rides the TestsContext seam — no shadow catalog', () => {
  const body = bodyOf(hook, 'confirmAiPreview');
  ordered(body, 'confirmAiPreview', [
    'const chosen = aiPreview.tests.filter(t => aiPreviewSelected.has(t.id));',
    "addToast('Select at least one test to add.');",
    'const updated = [...customTests, ...chosen];',
    'if (!setCustomTests(updated)) return false;',
    'setSelectedTests(prev => [...new Set([...prev, ...chosen.map(t => t.id)])]);',
    'setAiGeneratedCount(chosen.length);',
    "addToast(`${chosen.length} AI-generated test(s) added and pre-selected in the suite.`);"
  ]);
  assert.ok(body.includes("tryPersistCatalogArray(CATALOG_KEYS.recentAiTests, recentNext)"), 'the recent-marker write rides the persistence-first boundary');
  assert.equal(countIn(app, /const \[customTests/), 0, 'no local customTests shadow in App');
  assert.equal(countIn(hook, /const \[customTests/), 0, 'no local customTests shadow in the hook');
  assert.equal(countStr(PAIR, 'setCustomTests(updated)'), 2, 'commit + suite-reset remain the only catalog writes');
});

// ---------------------------------------------------------------------------
// App.jsx shrinks by the pipeline bodies; the wizard keeps its bindings
// ---------------------------------------------------------------------------

test('App.jsx loses the pipeline bodies (shrink gate) and the wizard keeps every binding', () => {
  const appLines = app.split('\n').length;
  const hookLines = hook.split('\n').length;
  assert.ok(appLines < 6600, `App.jsx shrank below 6600 lines (simulated literal port landed ${appLines})`);
  // The gate reflects the slim-contract collapse: the hook is smaller than the
  // wide-signature version (that signature became a short deps list + context
  // destructures); the pipeline bodies stay hook-local.
  assert.ok(hookLines > 700, `useAIGeneration.js stays the pipeline home past the T04 slim-contract collapse (landed ${hookLines})`);
  assert.ok(app.includes("from './hooks/useAIGeneration'"), 'App still imports the hook');
  // The config-step Generate button may live in the wizard modal; the wiring is
  // evaluated across the App + modal pair and exists exactly once.
  assert.equal(countStr(app + '\n' + modal, "onClick={() => { startAiGeneration(''); }}"), 1, 'the Generate button still starts the pipeline (modal-side since T17)');
  // The wizard footers/panes may live in AiGenWizardResults.jsx — these
  // pipeline wiring pins are evaluated across the App + results pair.
  const resultsPair = app + '\n' + results;
  assert.ok(resultsPair.includes('startAiGeneration(aiUsedGuidance)'), 'the Retry button still re-runs with the remembered guidance (results-side since T18)');
  assert.ok(resultsPair.includes('onClick={() => { setAiSourceProfiles(aiProfileEdits); runAiGeneration(); }}'), 'the Profiles checkpoint still continues into generation (results-side since T18)');
  assert.ok(resultsPair.includes('onClick={() => finalizeAiDraft(false)}') && resultsPair.includes('finalizeAiDraft(true)'), 'the draft checkpoint still routes refine/finish (results-side since T18)');
  assert.ok(resultsPair.includes('<button onClick={confirmAiPreview} className="btn-primary">'), 'the results screen still commits the selection (results-side since T18)');
  // refineAiTests may be defined by useAIGeneration; App keeps only the binding.
  assert.ok(resultsPair.includes('onClick={refineAiTests}') && countIn(hook, /const refineAiTests = /g) === 1, 'fine-tune stays domain-defined (hook-side since T05) and bound (the button moved results-side in T18)');
  assert.equal(countIn(app, /const refineAiTests = /g), 0, 'refineAiTests is no longer App-defined (T05)');
});
