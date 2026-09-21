import { useEffect, useRef } from 'react';
import { assessSourceWithAI, proposeSourceMeta, fetchSourceExcerpt, analyzeSourcesWithAI, generateTestsWithAI, critiqueGeneratedTests } from '../utils/api';
import { ATLAS_TACTICS, PROMPT_SOURCING_INFO } from '../data/payloads';
import { redactSensitiveText } from '../utils/redact';
import { projectDiagnosticTextStrict } from '../utils/project-diagnostic';
import { saveSourceUrls } from '../utils/vault';
import { remapRefinedCandidates } from '../utils/ai-candidates';
import { mapAiTests, buildSourcesText } from '../utils/ai-run-helpers';
import { tryPersistCatalogArray, CATALOG_KEYS } from '../utils/catalog-persistence';
import { useAIGen } from '../context/useAIGen';
import { useTests } from '../context/TestsContext';
import { useSettings } from '../context/SettingsContext';
import { useProviders } from '../context/ProvidersContext';
import { useUI } from '../context/useUI';

/**
 * useAIGeneration - Hook containing AI generation wizard logic.
 * It consumes the aiGen/aiPreview state, the catalog bindings and the
 * vault/providers values straight from their contexts; its parameter object
 * carries only the cross-domain non-context deps.
 */
export function useAIGeneration({
  // Cross-domain non-context deps only
  aiGenAbortRef,
  aiRunCtxRef,
  atlasMatrix,
  allTests,
  buildJudge,
  judgeConfig,
  effectiveGenConfig,
  // oxlint-disable-next-line no-unused-vars
  getPrompt,
  // oxlint-disable-next-line no-unused-vars
  getPromptOverrides,
  // oxlint-disable-next-line no-unused-vars
  runWithTimeout,
  addToast,
  // oxlint-disable-next-line no-unused-vars
  askConfirm,
  // oxlint-disable-next-line no-unused-vars
  askInput,
}) {
  // The consolidated AI state (incl. the preview/recent-marker states) is
  // consumed straight from AIGenContext — the single source of truth.
  const {
    aiGenSourceKeys, setAiGenSourceKeys,
    aiGenUrls, setAiGenUrls,
    aiGenUrlInput, setAiGenUrlInput,
    aiGenTitleInput, setAiGenTitleInput,
    aiGenDescInput, setAiGenDescInput,
    aiSourceDraft, setAiSourceDraft,
    setAiSourceAssessing,
    aiSourceAssessment, setAiSourceAssessment,
    aiAddSourceKind,
    aiAddStep: _aiAddStep, setAiAddStep,
    aiAddError: _aiAddError, setAiAddError,
    aiAddBusy: _aiAddBusy, setAiAddBusy,
    aiGenCount, aiGenBatch, aiGenBudget,
    aiAdvancedMode, aiGenMode,
    setAiWizardStep,
    aiGenerating, setAiGenerating,
    setAiGenStage, setAiGenStageDetail, setAiGenProgress,
    setAiWizardError, setAiUsedGuidance,
    aiFineTune, setAiFineTune, aiUsedGuidance, aiUsedFineTune, setAiUsedFineTune, setAiRefining,
    setAiSourceProfiles, setAiProfileExpanded,
    aiPasteInput, setAiPasteInput, aiPasteTitle, setAiPasteTitle,
    aiProfileEdits, setAiProfileEdits,
    aiDraft, setAiDraft,
    aiPreview, setAiPreview,
    aiPreviewSelected, setAiPreviewSelected,
    recentlyGeneratedIds: _recentlyGeneratedIds, setRecentlyGeneratedIds,
    aiGenElapsed: _aiGenElapsed, setAiGenElapsed,
    setAiGeneratedCount, setAiWizardOpen,
  } = useAIGen();
  const { customTests, setCustomTests, setSelectedTests } = useTests();
  const { vaultLocked, providers } = useProviders();
  // The settings/ui values this hook needs ride the slim deps above; these
  // subscriptions keep the hook mounted inside its providers.
  useSettings();
  useUI();

  // Technique-id allow-list for AI-generated payloads, derived from the
  // atlasMatrix dep.
  const validTechniqueIds = new Set((atlasMatrix || []).flatMap(t => (t.techniques || []).map(tech => tech.id)));
  const aiRefineAbortRef = useRef(null);
  // Toggle a predefined sourcing key for AI generation
  const toggleAiGenSource = (key) => {
    setAiGenSourceKeys(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  // Add a URL / GitHub repo as a reusable AI generation source.
  // Only the URL is required; if title or description are missing, the AI
  // proposes them and the user confirms/edits before the source is saved.
  const addAiGenUrl = async () => {
    const parsed = aiGenUrlInput.split(/[\s,]+/).map(u => u.trim()).filter(Boolean);
    if (parsed.length === 0) return false;
    const url = parsed[0];
    if (!/^https?:\/\//i.test(url)) {
      setAiAddError('Please enter a valid URL starting with http(s)://');
      return false;
    }
    if (aiGenUrls.some(s => s.url === url)) {
      setAiAddError('This URL is already in your source list.');
      return false;
    }
    setAiAddError('');

    let excerpt = '';
    let fetchNote = '';
    let declined = false;
    let proxyFailed = false;
    const sourceController = new AbortController();
    const sourceTimer = setTimeout(() => sourceController.abort(), 30000);
    try {
      const fetched = await fetchSourceExcerpt(url, 150000, sourceController.signal);
      excerpt = fetched.excerpt;
      fetchNote = fetched.note || '';
      declined = !!fetched.declined;
      proxyFailed = !!fetched.proxyFailed;
    } catch { /* fetch failed — leave empty */ } finally {
      clearTimeout(sourceTimer);
    }

    const title = aiGenTitleInput.trim();
    const description = aiGenDescInput.trim();

    setAiSourceAssessment(null);
    setAiSourceAssessing(false);
    setAiSourceDraft({ url, title, description, excerpt, fetchNote, declined, proxyFailed });

    let proposedTitle = title;
    let proposedDesc = description;
    const judge = buildJudge(judgeConfig, providers);
    if (judge && (!title || !description)) {
      try {
        const proposal = await proposeSourceMeta(judge, url, excerpt);
        if (!proposedTitle) proposedTitle = proposal.title;
        if (!proposedDesc) proposedDesc = proposal.description;
      } catch (err) {
        console.warn('Source metadata proposal failed', projectDiagnosticTextStrict(err));
      }
    }
    if (!proposedTitle) proposedTitle = url.replace(/^https?:\/\//i, '').split(/[/?#]/)[0] || url;
    if (!proposedDesc) proposedDesc = `Research source imported from ${url}`;

    setAiSourceDraft({ url, title: proposedTitle, description: proposedDesc, excerpt, fetchNote, declined, proxyFailed });

    // Assess the source with the Test Generator model so the user can judge
    // relevance/quality right here, before committing. Always runs for an added
    // source: with fetched content, or inferred from the title/URL when the page
    // is CORS-blocked or the proxy was declined.
    const gen = buildJudge(effectiveGenConfig, providers);
    if (gen) {
      setAiSourceAssessing(true);
      try {
        setAiSourceAssessment(await assessSourceWithAI(gen, { title: proposedTitle, description: proposedDesc, excerpt }));
      } catch (err) {
        console.warn('Source assessment failed', projectDiagnosticTextStrict(err));
      }
      setAiSourceAssessing(false);
    }
    return true;
  };

  // Persist the research-source list to the vault (fire-and-forget like
  // provider/model persistence, but surface a visible warning when the write
  // fails so a silent data-loss never happens).
  const persistSourceUrls = (sources) => {
    saveSourceUrls(sources).catch(err => {
      console.warn('Source save failed', err);
      addToast('Could not save research sources — they may be lost on reload.', 'error');
    });
  };

  const addSourceEntry = (entry) => {
    // Read-only (locked) sessions must not add sources — the vault
    // write would be discarded on reload. Mirror the read-only gate used by
    // Settings/Runner/Prompts and the AI-generation run context.
    if (vaultLocked) { addToast('Unlock your API keys to add research sources.'); return null; }
    if (entry.url && aiGenUrls.some(s => s.url === entry.url)) {
      addToast('This URL is already in your source list.');
      return null;
    }
    const newEntry = {
      id: entry.kind === 'paste' ? `paste_${Date.now()}_${aiGenUrls.length}` : `url_${Date.now()}_${aiGenUrls.length}`,
      url: entry.url || '',
      kind: entry.kind || 'url',
      title: entry.title || entry.url || 'Untitled source',
      description: entry.description || '',
      excerpt: entry.excerpt || '',
      fetchNote: entry.fetchNote || '',
      declined: !!entry.declined,
      proxyFailed: !!entry.proxyFailed,
      assessing: false,
      assessment: entry.assessment || null,
      enabled: true
    };
    const next = [...aiGenUrls, newEntry];
    setAiGenUrls(next);
    persistSourceUrls(next);
    setAiGenUrlInput('');
    setAiGenTitleInput('');
    setAiGenDescInput('');
    setAiPasteInput('');
    setAiPasteTitle('');
    setAiSourceDraft(null);
    return newEntry.id;
  };

  // Assess a source's relevance/quality with the Test Generator model, tagging
  // the source entry so the user can see whether the content is worth generating
  // tests from.
  const assessSource = async (id, source) => {
    if (vaultLocked) return; // AI source assessment disabled in read-only mode
    const gen = buildJudge(effectiveGenConfig, providers);
    if (!gen) return;
    setAiGenUrls(prev => prev.map(s => s.id === id ? { ...s, assessing: true } : s));
    try {
      const assessment = await assessSourceWithAI(gen, source);
      setAiGenUrls(prev => {
        const next = prev.map(s => s.id === id ? { ...s, assessing: false, assessment } : s);
        persistSourceUrls(next);
        return next;
      });
    } catch (err) {
      console.warn('Source assessment failed', projectDiagnosticTextStrict(err));
      setAiGenUrls(prev => {
        const next = prev.map(s => s.id === id ? { ...s, assessing: false } : s);
        persistSourceUrls(next);
        return next;
      });
    }
  };

  const saveAiSourceDraft = () => {
    if (!aiSourceDraft) return;
    const id = addSourceEntry({
      url: aiSourceDraft.url,
      kind: aiSourceDraft.kind || 'url',
      title: aiSourceDraft.title,
      description: aiSourceDraft.description,
      excerpt: aiSourceDraft.excerpt,
      fetchNote: aiSourceDraft.fetchNote || '',
      declined: !!aiSourceDraft.declined,
      proxyFailed: !!aiSourceDraft.proxyFailed,
      assessment: aiSourceAssessment
    });
    // If the assessment was still in flight (or failed) when the user saved,
    // finish tagging the entry asynchronously.
    if (id && !aiSourceAssessment) {
      assessSource(id, { title: aiSourceDraft.title, description: aiSourceDraft.description, excerpt: aiSourceDraft.excerpt });
    }
  };

  const updateSourceDraft = (patch) => {
    setAiSourceDraft(prev => prev ? { ...prev, ...patch } : prev);
  };

  const toggleAiGenUrl = (id) => {
    setAiGenUrls(prev => {
      const next = prev.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s);
      persistSourceUrls(next);
      return next;
    });
  };

  const removeAiGenUrl = (id) => {
    setAiGenUrls(prev => {
      const next = prev.filter(s => s.id !== id);
      persistSourceUrls(next);
      return next;
    });
  };

  // Add a "pasted content" source — full text pasted by the user (no CORS
  // limits). Routes through the SAME proposal + assessment flow as a URL: the
  // source draft is opened so the user can review/edit the AI-proposed title,
  // description and relevance before committing.
  const addPastedSourceDraft = async () => {
    const text = aiPasteInput.trim();
    if (!text) {
      setAiAddError('Paste some content first.');
      return false;
    }
    setAiAddError('');
    setAiSourceAssessment(null);
    setAiSourceAssessing(false);

    let proposedTitle = aiPasteTitle.trim();
    let proposedDesc = '';
    const judge = buildJudge(judgeConfig, providers);
    if (judge) {
      try {
        const proposal = await proposeSourceMeta(judge, '', text);
        if (!proposedTitle) proposedTitle = proposal.title;
        proposedDesc = proposal.description;
      } catch (err) {
        console.warn('Source metadata proposal failed', projectDiagnosticTextStrict(err));
      }
    }
    if (!proposedTitle) proposedTitle = `Pasted source ${new Date().toLocaleDateString()}`;
    if (!proposedDesc) proposedDesc = 'Pasted content — AI infers the attack patterns from the provided text.';

    setAiSourceDraft({ url: '', kind: 'paste', title: proposedTitle, description: proposedDesc, excerpt: text, fetchNote: 'Pasted content — analysis from the provided text', declined: false, proxyFailed: false });

    if (judge) {
      setAiSourceAssessing(true);
      try {
        setAiSourceAssessment(await assessSourceWithAI(judge, { title: proposedTitle, description: proposedDesc, excerpt: text }));
      } catch (err) {
        console.warn('Source assessment failed', projectDiagnosticTextStrict(err));
      }
      setAiSourceAssessing(false);
    }
    return true;
  };

  // Input → review: run fetch/proposal/assessment, then move to the review step.
  const handleAddSourceSubmit = async () => {
    setAiAddBusy(true);
    const ok = aiAddSourceKind === 'url' ? await addAiGenUrl() : await addPastedSourceDraft();
    setAiAddBusy(false);
    if (ok) setAiAddStep('review');
  };

  // Ticking elapsed-time display while a generation stage is running.
  useEffect(() => {
    if (!aiGenerating) { setAiGenElapsed(0); return; }
    const start = Date.now();
    const t = setInterval(() => setAiGenElapsed(Math.round((Date.now() - start) / 1000)), 500);
    return () => clearInterval(t);
  }, [aiGenerating, setAiGenElapsed]);

  // Generate a new set of test payloads from selected sources using the AI model.
  // Results are previewed for confirmation before being added to the suite.
  // Validate the run and assemble its context (sources, catalogs, judge). Async
  // because URL sources may need fetching first. Returns null (with an error
  // shown) when the run can't start.
  const buildAiRunCtx = async (guidance, signal) => {
    if (vaultLocked) {
      setAiWizardError('AI test generation is disabled in read-only mode. Unlock your API keys to use it.');
      return null;
    }
    const gen = buildJudge(effectiveGenConfig, providers);
    if (!gen) {
      setAiWizardError('AI generation needs a configured model. Set the Test Generator model (or AI Judge) in Settings and add an API key for its provider.');
      return null;
    }
    const enabledUrls = aiGenUrls.filter(s => s.enabled);
    if (aiGenSourceKeys.length === 0 && enabledUrls.length === 0) {
      setAiWizardError('Select at least one source: a predefined source, an added URL, or pasted content.');
      return null;
    }

    const techniqueCatalog = (atlasMatrix.length ? atlasMatrix : ATLAS_TACTICS)
      .flatMap(t => (t.techniques || []).map(tech => `${tech.id} | ${tech.name} | ${t.name}`))
      .join('\n');
    const existingCoverage = [...new Set(allTests.map(t => t.techniqueId))].join(', ') || 'None';

    const sources = [];
    Object.entries(PROMPT_SOURCING_INFO)
      .filter(([key]) => aiGenSourceKeys.includes(key))
      .forEach(([key, info]) => sources.push({ key, title: info.origin, description: info.description, excerpt: '' }));

    for (const s of enabledUrls) {
      let excerpt = s.excerpt || '';
      let declined = !!s.declined;
      let proxyFailed = !!s.proxyFailed;
      if (!excerpt && !declined && !proxyFailed && s.kind !== 'paste' && s.url) {
        try {
          const fetched = await fetchSourceExcerpt(s.url, 150000, signal);
          excerpt = fetched.excerpt;
          declined = !!fetched.declined;
          proxyFailed = !!fetched.proxyFailed;
        } catch { /* leave empty — model will infer */ }
      }
      sources.push({
        key: s.id,
        title: s.title || s.url || 'Pasted source',
        description: s.description || '',
        excerpt,
        declined,
        proxyFailed,
        url: s.kind === 'paste' ? '' : (s.url || ''),
        kind: s.kind || 'url'
      });
    }
    return { gen, sources, techniqueCatalog, existingCoverage, guidance };
  };

  // Kick off generation: build the run context, then enter the first stage
  // (analysis for deep mode, generation for fast mode).
  const startAiGeneration = async (guidance = '') => {
    setAiGenerating(true);
    setAiWizardError('');
    setAiUsedGuidance(guidance);
    setAiDraft({ tests: [], failures: 0 });
    setAiProfileEdits({});
    const controller = new AbortController();
    aiGenAbortRef.current = controller;
    const ctx = await buildAiRunCtx(guidance, controller.signal);
    if (controller.signal.aborted || aiGenAbortRef.current !== controller) {
      setAiGenerating(false);
      return;
    }
    if (!ctx) {
      setAiGenerating(false);
      if (aiGenAbortRef.current === controller) aiGenAbortRef.current = null;
      return;
    }
    aiRunCtxRef.current = { ...ctx, controller, signal: controller.signal };
    // Simple mode uses the dedicated "Generate" running screen; advanced mode
    // stays on Options and shows progress inline in the Generate button.
    if (!aiAdvancedMode) setAiWizardStep('running');
    if (aiGenMode === 'deep') await runAiAnalysis();
    else await runAiGeneration();
  };

  // Stage 1 — analyze sources into threat profiles. In advanced mode it pauses
  // at the Profiles checkpoint for human editing; in simple mode it hands the
  // profiles straight to generation (autonomous).
  const runAiAnalysis = async () => {
    const ctx = aiRunCtxRef.current;
    if (!ctx) return;
    const { gen, sources, techniqueCatalog, guidance, signal } = ctx;
    setAiGenerating(true);
    setAiGenStage('analyzing');
    setAiGenProgress(4);
    setAiGenStageDetail(`Analyzing ${sources.length} source(s)…`);
    const profiles = {};
    try {
      const analyzed = await analyzeSourcesWithAI(
        gen,
        sources.map(s => ({ sourceKey: s.key, title: s.title, description: s.description, excerpt: s.excerpt })),
        techniqueCatalog,
        signal,
        3,
        guidance,
        (done, total) => {
          setAiGenStageDetail(`Analyzed ${done}/${total} source(s)…`);
          setAiGenProgress(Math.round(4 + (done / total) * 60));
        },
        aiGenBudget,
        validTechniqueIds
      );
      if (signal?.aborted || aiGenAbortRef.current !== ctx.controller) return;
      sources.forEach((src, i) => { profiles[src.key] = analyzed[i] || null; });
    } catch (err) {
      if (signal && signal.aborted) return;
      console.warn('Source analysis stage failed', projectDiagnosticTextStrict(err));
      sources.forEach(src => { profiles[src.key] = null; });
    }
    setAiSourceProfiles(profiles);
    setAiProfileEdits(profiles);
    setAiProfileExpanded({ [sources[0]?.key]: true });
    setAiGenerating(false);
    setAiGenStage(null);
    setAiGenStageDetail('');
    setAiGenProgress(0);
    if (aiAdvancedMode) {
      setAiWizardStep('profiles');
      return;
    }
    if (sources.length > 0 && Object.values(profiles).every(profile => !profile)) {
      setAiWizardError('Source analysis failed for every selected source. Review the errors or retry before generating tests.');
      return;
    }
    await runAiGeneration(profiles);
  };

  // Stage 2 — generate the pre-refinement tests. In advanced mode it pauses at
  // the Screening checkpoint; in simple mode it continues autonomously to the
  // critique (deep) or straight to the review (fast).
  const runAiGeneration = async (profilesOverride) => {
    const ctx = aiRunCtxRef.current;
    if (!ctx) return;
    const { gen, sources, techniqueCatalog, existingCoverage, guidance, signal } = ctx;
    setAiGenerating(true);
    setAiWizardError('');
    setAiGenStage('generating');
    setAiGenProgress(6);
    setAiGenStageDetail(`Generating ${aiGenCount} test(s)...`);
    const profiles = profilesOverride !== undefined ? profilesOverride : aiProfileEdits;
    const profilesText = sources
      .filter(s => profiles[s.key])
      .map(s => {
        const p = profiles[s.key];
        const vectors = (p.vectors || []).map(v =>
          `  - ${v.name}: ${v.description} | payload: "${v.payloadShape}" | ${v.techniqueId} ${v.techniqueName} | evidence: "${v.evidence}"`
        ).join('\n');
        return `SOURCE "${s.title}" — ${p.vulnerabilityClass || 'unclassified'}\n${vectors || '  (no vectors extracted)'}`;
      })
      .join('\n\n');
    try {
      const { tests: generated, failures } = await generateTestsWithAI(gen, {
        sourcesText: buildSourcesText(sources),
        profilesText,
        techniqueCatalog,
        existingCoverage,
        validTechniqueIds,
        // The author catalog prioritizes the selected profiles'
        // techniques so every profile-required id survives the token budget.
        profileTechniqueIds: new Set(
          Object.values(profiles).flatMap((p) => (p?.vectors || []).map((v) => v.techniqueId).filter(Boolean))
        ),
        count: aiGenCount,
        guidance,
        batchSize: aiGenBatch,
        maxTokens: aiGenBudget
      }, signal, (done, total) => {
        setAiGenStageDetail(`Generated ${done}/${total} test(s)...`);
        setAiGenProgress(Math.round(6 + (done / total) * 94));
      });
      if (signal?.aborted || aiGenAbortRef.current !== ctx.controller) return;
      setAiGenProgress(100);
      const draftTests = mapAiTests(generated, null, sources, { validTechniqueIds });
      setAiDraft({ tests: draftTests, failures });
      setAiGenerating(false);
      setAiGenStage(null);
      setAiGenStageDetail('');
      setAiGenProgress(0);
      if (aiAdvancedMode) {
        setAiWizardStep('draft');
        return;
      }
      if (draftTests.length === 0) {
        setAiWizardError('AI returned no valid tests. Try different sources, fewer tests, or a larger response size.');
        return;
      }
      if (aiGenMode === 'deep') {
        await runAiCritique(draftTests);
      } else {
        setAiPreview({ tests: draftTests });
        setAiPreviewSelected(new Set(draftTests.map(t => t.id)));
        setAiWizardStep('results');
      }
    } catch (err) {
      if (signal && signal.aborted) return;
      setAiGenerating(false);
      setAiGenStage(null);
      setAiGenStageDetail('');
      setAiGenProgress(0);
      setAiWizardError(`AI generation failed: ${redactSensitiveText(err?.message || err)}`);
    }
  };

  // Stage 3 — refine the draft autonomously, then show the final results.
  const runAiCritique = async (tests) => {
    const ctx = aiRunCtxRef.current;
    const draft = tests || aiDraft.tests;
    if (!ctx) return;
    if (draft.length === 0) {
      setAiWizardError('AI returned no valid tests after generation. Try different sources, fewer tests, or a larger response size.');
      return;
    }
    const { gen, techniqueCatalog, existingCoverage, guidance, signal, sources } = ctx;
    setAiGenerating(true);
    setAiWizardError('');
    setAiGenStage('critiquing');
    setAiGenProgress(8);
    setAiGenStageDetail('Reviewing and refining the generated tests...');
    try {
      const refined = await critiqueGeneratedTests(gen, draft, { techniqueCatalog, existingCoverage, count: draft.length, guidance, maxTokens: aiGenBudget, validTechniqueIds, profileTechniqueIds: new Set(draft.map((t) => t.techniqueId).filter(Boolean)) }, signal);
      if (signal?.aborted || aiGenAbortRef.current !== ctx.controller) return;
      setAiGenProgress(100);
      const finalTests = refined.length > 0 ? mapAiTests(refined, draft, sources, { validTechniqueIds }) : draft;
      if (finalTests.length === 0) {
        setAiWizardError('AI returned no valid tests after refinement. Try different sources or fewer tests.');
        setAiGenerating(false);
        setAiGenStage(null);
        setAiGenStageDetail('');
        setAiGenProgress(0);
        return;
      }
      setAiPreview({ tests: finalTests });
      setAiPreviewSelected(new Set(finalTests.map(t => t.id)));
      setAiGenerating(false);
      setAiGenStage(null);
      setAiGenStageDetail('');
      setAiGenProgress(0);
      setAiWizardStep('results');
    } catch {
      if (signal && signal.aborted) return;
      // Critique failed — keep the screened draft as the final result.
      setAiPreview({ tests: draft });
      setAiPreviewSelected(new Set(draft.map(t => t.id)));
      setAiGenerating(false);
      setAiGenStage(null);
      setAiGenStageDetail('');
      setAiGenProgress(0);
      setAiWizardStep('results');
    }
  };

  // Add the user-selected previewed tests to the suite. Persistence-first:
  // on catalog-write failure the preview/review state is preserved and no
  // success is claimed, so the user can retry without regenerating.
  const confirmAiPreview = () => {
    if (!aiPreview) return false;
    const chosen = aiPreview.tests.filter(t => aiPreviewSelected.has(t.id));
    if (chosen.length === 0) {
      addToast('Select at least one test to add.');
      return false;
    }
    const updated = [...customTests, ...chosen];
    if (!setCustomTests(updated)) return false;
    const recentNext = [...chosen.map(t => t.id), ..._recentlyGeneratedIds];
    const recentRes = tryPersistCatalogArray(CATALOG_KEYS.recentAiTests, recentNext);
    if (!recentRes.ok) {
      // Catalog tests are durable but the NEW-marker write failed: report the
      // partial state honestly instead of claiming full success.
      addToast(`Tests saved, but NEW markers could not be saved: ${redactSensitiveText(recentRes.error?.message || recentRes.error) || 'storage unavailable'}.`, 'error');
      setSelectedTests(prev => [...new Set([...prev, ...chosen.map(t => t.id)])]);
      setRecentlyGeneratedIds(recentNext);
      setAiGeneratedCount(chosen.length);
      setAiPreview(null);
      setAiPreviewSelected(null);
      setAiWizardOpen(false);
      setAiWizardStep('sources');
      setAiWizardError('');
      return true;
    }
    setSelectedTests(prev => [...new Set([...prev, ...chosen.map(t => t.id)])]);
    setRecentlyGeneratedIds(recentNext);
    setAiGeneratedCount(chosen.length);
    setAiPreview(null);
    setAiPreviewSelected(null);
    setAiWizardOpen(false);
    setAiWizardStep('sources');
    setAiWizardError('');
    addToast(`${chosen.length} AI-generated test(s) added and pre-selected in the suite.`);
    return true;
  };

  // Advance from the draft checkpoint: refine (deep) or go straight to results.
  const finalizeAiDraft = (refine) => {
    if (aiDraft.tests.length === 0) { setAiWizardError('There are no tests to continue with — go back and regenerate.'); return; }
    if (refine) { runAiCritique(); return; }
    setAiPreview({ tests: aiDraft.tests });
    setAiPreviewSelected(new Set(aiDraft.tests.map(t => t.id)));
    setAiWizardStep('results');
  };

  // Immediately interrupt any in-flight generation request and return to Options.
  const cancelAiGeneration = () => {
    const c = aiGenAbortRef.current;
    if (c) { try { c.abort(); } catch { /* ignore */ } }
    if (aiRefineAbortRef.current) {
      try { aiRefineAbortRef.current.abort(); } catch { /* ignore */ }
    }
    aiRunCtxRef.current = null;
    setAiGenerating(false);
    setAiGenStage(null);
    setAiGenStageDetail('');
    setAiGenProgress(0);
    setAiWizardError('');
    setAiWizardStep('config');
  };

  // Fine-tune the current candidate tests with another AI pass (critique-driven
  // refinement grounded in the original guidance + the user's follow-up prompt).
  const refineAiTests = async () => {
    if (!aiPreview) return;
    if (vaultLocked) {
      setAiWizardError('Fine-tuning is disabled in read-only mode. Unlock your API keys to use it.');
      return;
    }
    const gen = buildJudge(effectiveGenConfig, providers);
    if (!gen) {
      setAiWizardError('Fine-tuning needs a configured model. Set the Test Generator model (or AI Judge) in Settings.');
      return;
    }
    const instruction = [
      aiUsedGuidance.trim(),
      aiFineTune.trim(),
      aiUsedFineTune.trim()
    ].filter(Boolean).join('\n');

    const techniqueCatalog = (atlasMatrix.length ? atlasMatrix : ATLAS_TACTICS)
      .flatMap(t => (t.techniques || []).map(tech => `${tech.id} | ${tech.name} | ${t.name}`))
      .join('\n');
    const existingCoverage = [...new Set(allTests.map(t => t.techniqueId))].join(', ') || 'None';

    setAiRefining(true);
    setAiWizardError('');
    setAiGenStage('critiquing');
    setAiGenProgress(8);
    setAiGenStageDetail('Applying your fine-tuning instructions...');
    const controller = new AbortController();
    aiRefineAbortRef.current = controller;
    try {
      const refined = await critiqueGeneratedTests(gen, aiPreview.tests, {
        techniqueCatalog,
        existingCoverage,
        validTechniqueIds: new Set((atlasMatrix || []).flatMap(t => (t.techniques || []).map(tech => tech.id))),
        profileTechniqueIds: new Set(aiPreview.tests.map((t) => t.techniqueId).filter(Boolean)),
        count: aiPreview.tests.length,
        guidance: instruction,
        maxTokens: aiGenBudget
      }, controller.signal);
      if (controller.signal.aborted || aiRefineAbortRef.current !== controller) return;
      setAiGenProgress(100);
      if (refined.length === 0) {
        setAiWizardError('Fine-tuning returned no valid tests. Try rephrasing the instruction.');
        return;
      }
      const remapped = remapRefinedCandidates(refined, aiPreview.tests, aiRunCtxRef.current?.sources || [], { validTechniqueIds, budget: aiGenBudget });
      if (remapped.length === 0) {
        setAiWizardError('Fine-tuning returned no valid tests. Try rephrasing the instruction.');
        return;
      }
      setAiPreview({ tests: remapped });
      setAiPreviewSelected(new Set(remapped.map(t => t.id)));
      setAiUsedFineTune(aiFineTune.trim());
      setAiFineTune('');
    } catch (err) {
      if (controller.signal.aborted || aiRefineAbortRef.current !== controller) return;
      setAiWizardError(`Fine-tuning failed: ${redactSensitiveText(err?.message || err)}`);
    } finally {
      if (aiRefineAbortRef.current === controller) aiRefineAbortRef.current = null;
      setAiRefining(false);
      setAiGenStage(null);
      setAiGenStageDetail('');
      setAiGenProgress(0);
    }
  };
  // Open the AI generation wizard at the right step (results if a previous run is still pending).
  const openAiWizard = () => {
    setAiWizardError('');
    setAiWizardStep(aiPreview && aiPreview.tests.length ? 'results' : 'sources');
    setAiWizardOpen(true);
  };

  const toggleAiPreviewItem = (id) => {
    setAiPreviewSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return {
    assessSource,
    toggleAiGenSource,
    addAiGenUrl,
    addSourceEntry,
    saveAiSourceDraft,
    updateSourceDraft,
    toggleAiGenUrl,
    removeAiGenUrl,
    addPastedSourceDraft,
    handleAddSourceSubmit,
    startAiGeneration,
    runAiAnalysis,
    runAiGeneration,
    runAiCritique,
    confirmAiPreview,
    finalizeAiDraft,
    cancelAiGeneration,
    refineAiTests,
    openAiWizard,
    toggleAiPreviewItem,
    validTechniqueIds,
  };
}