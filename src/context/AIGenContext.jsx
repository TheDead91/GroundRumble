import React, { createContext, useState, useCallback, useRef, useEffect } from 'react';
import { PROMPT_SOURCING_INFO } from '../data/payloads';
import { readStoredArray } from '../utils/storage';
import { loadSourceUrls } from '../utils/vault';
import { useProviders } from './ProvidersContext';

const AIGenContext = createContext(null);

/**
 * AIGenProvider - Manages AI generation wizard state (sources, profiles, drafts, stages)
 */
export function AIGenProvider({ children }) {
  const { vaultLocked } = useProviders();
  const [aiGenSourceKeys, setAiGenSourceKeys] = useState(() => Object.keys(PROMPT_SOURCING_INFO));
  const [aiGenUrls, setAiGenUrls] = useState([]);
  const [aiGenUrlInput, setAiGenUrlInput] = useState('');
  const [aiGenTitleInput, setAiGenTitleInput] = useState('');
  const [aiGenDescInput, setAiGenDescInput] = useState('');
  const [aiSourceDraft, setAiSourceDraft] = useState(null);
  const [aiSourceAssessing, setAiSourceAssessing] = useState(false);
  const [aiSourceAssessment, setAiSourceAssessment] = useState(null);
  const [aiGenCount, setAiGenCount] = useState(2);
  const [aiGenCountInput, setAiGenCountInput] = useState('2');
  const [aiGenCollapsed, setAiGenCollapsed] = useState(() => localStorage.getItem('atlas_ai_gen_collapsed') === '1');
  const [testsCollapsed, setTestsCollapsed] = useState(() => localStorage.getItem('atlas_tests_collapsed') === '1');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiGenStage, setAiGenStage] = useState(null);
  const [aiGenStageDetail, setAiGenStageDetail] = useState('');
  const [aiGenProgress, setAiGenProgress] = useState(0);
  const [aiGenMode, setAiGenMode] = useState(() => localStorage.getItem('atlas_ai_gen_mode') === 'fast' ? 'fast' : 'deep');
  const [aiPasteInput, setAiPasteInput] = useState('');
  const [aiPasteTitle, setAiPasteTitle] = useState('');
  const [aiSourceProfiles, setAiSourceProfiles] = useState(() => {
    const seeded = {};
    Object.entries(PROMPT_SOURCING_INFO).forEach(([key, info]) => {
      if (info.profile) seeded[key] = info.profile;
    });
    return seeded;
  });
  const [expandedSourceIds, setExpandedSourceIds] = useState(() => new Set());
  const [aiAddSourceOpen, setAiAddSourceOpen] = useState(false);
  const [aiAddSourceKind, setAiAddSourceKind] = useState('url');
  const [aiAddStep, setAiAddStep] = useState('input');
  const [aiAddError, setAiAddError] = useState('');
  const [aiAddBusy, setAiAddBusy] = useState(false);
  const [aiGeneratedCount, setAiGeneratedCount] = useState(0);
  const [aiWizardOpen, setAiWizardOpen] = useState(false);
  const [aiWizardStep, setAiWizardStep] = useState('sources');
  const [aiFineTune, setAiFineTune] = useState('');
  const [aiRefining, setAiRefining] = useState(false);
  const [aiWizardError, setAiWizardError] = useState('');
  const [aiUsedGuidance, setAiUsedGuidance] = useState('');
  const [aiUsedFineTune, setAiUsedFineTune] = useState('');
  const [aiDraft, setAiDraft] = useState({ tests: [], failures: 0 });
  const [aiProfileEdits, setAiProfileEdits] = useState({});
  const [aiProfileExpanded, setAiProfileExpanded] = useState({});
  const [aiGenBatch, setAiGenBatch] = useState(() => {
    const v = parseInt(localStorage.getItem('atlas_ai_gen_batch') || '1', 10);
    return Number.isFinite(v) && v >= 1 && v <= 5 ? v : 1;
  });
  const [aiGenBudget, setAiGenBudget] = useState(() => {
    const v = parseInt(localStorage.getItem('atlas_ai_gen_budget') || '4096', 10);
    return [1024, 2048, 4096, 8192].includes(v) ? v : 4096;
  });
  const [aiAdvancedMode, setAiAdvancedMode] = useState(() => localStorage.getItem('atlas_ai_gen_advanced') === '1');
  const [aiGenElapsed, setAiGenElapsed] = useState(0);
  const [aiPreview, setAiPreview] = useState(null);
  const [aiPreviewSelected, setAiPreviewSelected] = useState(null);
  const [recentlyGeneratedIds, setRecentlyGeneratedIds] = useState(() => readStoredArray('atlas_recent_ai_tests'));
  const aiRunCtxRef = useRef(null);

  // Hydrate custom research sources from the vault. The vault is the
  // single source of truth for aiGenUrls: every mutation persists there
  // (addSourceEntry/assess/toggle/remove), and this effect reloads them on boot
  // and again whenever the vault transitions unlocked (a passphrase-protected
  // vault is only readable after the session passphrase is entered). Loaded
  // entries are merged by id so in-flight in-memory edits are never clobbered.
  useEffect(() => {
    if (vaultLocked) return;
    let cancelled = false;
    const hydrate = async () => {
      let sources = [];
      try {
        sources = await loadSourceUrls();
      } catch (err) {
        console.warn('Source load failed', err);
      }
      if (cancelled || !Array.isArray(sources)) return;
      setAiGenUrls(prev => {
        if (prev.length === 0 && sources.length === 0) return prev;
        const byId = new Map();
        for (const s of prev) if (s && s.id) byId.set(s.id, s);
        for (const s of sources) if (s && s.id && !byId.has(s.id)) byId.set(s.id, s);
        return [...byId.values()];
      });
    };
    hydrate();
    return () => { cancelled = true; };
  }, [vaultLocked]);

  const commitAiGenCount = useCallback((raw) => {
    const n = Math.min(20, Math.max(1, Number(raw) || 1));
    setAiGenCount(n);
    setAiGenCountInput(String(n));
  }, []);

  const updateAiGenCountInput = useCallback((raw) => {
    setAiGenCountInput(raw);
    if (raw !== '' && !Number.isNaN(Number(raw))) setAiGenCount(Math.min(20, Math.max(1, Number(raw) || 1)));
  }, []);

  const toggleSourceExpanded = useCallback((id) => setExpandedSourceIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  }), []);

  const openAddSourceDialog = useCallback(() => {
    setAiAddSourceKind('url');
    setAiAddStep('input');
    setAiAddError('');
    setAiAddBusy(false);
    setAiSourceDraft(null);
    setAiSourceAssessment(null);
    setAiSourceAssessing(false);
    setAiGenUrlInput('');
    setAiGenTitleInput('');
    setAiGenDescInput('');
    setAiPasteInput('');
    setAiPasteTitle('');
    setAiAddSourceOpen(true);
  }, []);

  const closeAddSourceDialog = useCallback(() => {
    setAiAddSourceOpen(false);
    setAiAddStep('input');
    setAiAddError('');
    setAiAddBusy(false);
    setAiSourceDraft(null);
    setAiSourceAssessment(null);
    setAiSourceAssessing(false);
    setAiGenUrlInput('');
    setAiGenTitleInput('');
    setAiGenDescInput('');
    setAiPasteInput('');
    setAiPasteTitle('');
  }, []);

  const value = {
    aiGenSourceKeys,
    setAiGenSourceKeys,
    aiGenUrls,
    setAiGenUrls,
    aiGenUrlInput,
    setAiGenUrlInput,
    aiGenTitleInput,
    setAiGenTitleInput,
    aiGenDescInput,
    setAiGenDescInput,
    aiSourceDraft,
    setAiSourceDraft,
    aiSourceAssessing,
    setAiSourceAssessing,
    aiSourceAssessment,
    setAiSourceAssessment,
    aiGenCount,
    setAiGenCount,
    aiGenCountInput,
    setAiGenCountInput,
    commitAiGenCount,
    updateAiGenCountInput,
    aiGenCollapsed,
    setAiGenCollapsed,
    testsCollapsed,
    setTestsCollapsed,
    aiGenerating,
    setAiGenerating,
    aiGenStage,
    setAiGenStage,
    aiGenStageDetail,
    setAiGenStageDetail,
    aiGenProgress,
    setAiGenProgress,
    aiGenMode,
    setAiGenMode,
    aiPasteInput,
    setAiPasteInput,
    aiPasteTitle,
    setAiPasteTitle,
    aiSourceProfiles,
    setAiSourceProfiles,
    expandedSourceIds,
    toggleSourceExpanded,
    aiAddSourceOpen,
    setAiAddSourceOpen,
    aiAddSourceKind,
    setAiAddSourceKind,
    aiAddStep,
    setAiAddStep,
    aiAddError,
    setAiAddError,
    aiAddBusy,
    setAiAddBusy,
    openAddSourceDialog,
    closeAddSourceDialog,
    aiGeneratedCount,
    setAiGeneratedCount,
    aiWizardOpen,
    setAiWizardOpen,
    aiWizardStep,
    setAiWizardStep,
    aiFineTune,
    setAiFineTune,
    aiRefining,
    setAiRefining,
    aiWizardError,
    setAiWizardError,
    aiUsedGuidance,
    setAiUsedGuidance,
    aiUsedFineTune,
    setAiUsedFineTune,
    aiDraft,
    setAiDraft,
    aiProfileEdits,
    setAiProfileEdits,
    aiProfileExpanded,
    setAiProfileExpanded,
    aiGenBatch,
    setAiGenBatch,
    aiGenBudget,
    setAiGenBudget,
    aiAdvancedMode,
    setAiAdvancedMode,
    aiGenElapsed,
    setAiGenElapsed,
    aiPreview,
    setAiPreview,
    aiPreviewSelected,
    setAiPreviewSelected,
    recentlyGeneratedIds,
    setRecentlyGeneratedIds,
    aiRunCtxRef,
  };

  return (
    <AIGenContext.Provider value={value}>
      {children}
    </AIGenContext.Provider>
  );
}

export { AIGenContext };