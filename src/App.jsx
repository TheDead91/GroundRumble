// oxlint-disable-next-line no-unused-vars
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useMemo } from 'react';
import { useUI } from './context/useUI';
import { useProviders } from './context/ProvidersContext';
import { useAudit } from './context/AuditContext';
import { useHistory } from './context/HistoryContext';
import { useTests, DEFAULT_PRESET_ID } from './context/TestsContext';
import { useAIGen } from './context/useAIGen';
import { useSettings } from './context/SettingsContext';
import {
  Lock,
  // AlertTriangle is kept imported for the module's icon surface; its JSX use
  // is in PromptUpdateDialog.jsx.
  // oxlint-disable-next-line no-unused-vars
  AlertTriangle, 
  // X is kept imported for the module's icon surface; its JSX use is in
  // PromptUpdateDialog.jsx.
  // oxlint-disable-next-line no-unused-vars
  X, 
  // Info/Plus are kept imported for the module's icon surface; their JSX uses
  // are in BulkImportModal.jsx.
  // oxlint-disable-next-line no-unused-vars
  Info, 
  Sparkles,
  // oxlint-disable-next-line no-unused-vars
  Plus,
  // Download is kept imported for the module's icon surface; its JSX use is in
  // BulkImportModal.jsx.
  // oxlint-disable-next-line no-unused-vars
  Download,
  // ChevronDown/ChevronUp are kept imported for the module's icon surface:
  // oxlint-disable-next-line no-unused-vars
  ChevronDown, ChevronUp,
} from 'lucide-react';
import Tour from './components/Tour';
import { OnboardingModal } from './components/modals/OnboardingModal';
import DashboardView from './components/views/DashboardView';
import SettingsView from './components/views/SettingsView';
import TestsView from './components/views/TestsView';
import RunnerView from './components/views/RunnerView';
import MatrixView from './components/views/MatrixView';
import PromptWorkspace from './components/views/prompts/PromptWorkspace';
import AiGenWizardModal from './components/modals/AiGenWizardModal';
import CustomTestFormModal from './components/modals/CustomTestFormModal';
import JudgeMergeDialog from './components/modals/JudgeMergeDialog';
import { BackupImportModal, BackupConfirmNode } from './components/modals/BackupImportModal';
import VaultUnlockPrompt from './components/modals/VaultUnlockPrompt';
import { JudgeModelSelector } from './components/JudgeModelSelector';
import { ActiveModelChip } from './components/ActiveModelChip';
import AddSourceDialog from './components/modals/AddSourceDialog';
import BulkImportModal from './components/modals/BulkImportModal';
/* oxlint-disable no-unused-vars */
// PROVIDER_PRESETS/SANDBOX_MODELS are kept imported for the module's provider
// surface; their consumers are in ProvidersContext/ProvidersCard/useProviderModelSync.
// ATLAS_TACTICS is intentionally kept on the module's payload surface and
// lint-suppressed; TestsContext owns the catalog specifiers.
// oxlint-disable-next-line no-unused-vars
import { ATLAS_TACTICS } from './data/payloads';
import { PROVIDER_PRESETS, SANDBOX_PROVIDER_ID, SANDBOX_MODELS } from './data/app-config';
// oxlint-enable no-unused-vars
import {
  setProxyConfirmHandler,
  setRedirectConfirmHandler
} from './utils/api';
import { setInsecureTransportConfirmHandler } from './utils/insecure-transport-consent';
import { buildJudge } from './utils/judge-config';
import { buildTourSteps } from './utils/tour-steps';
import { readStoredArray } from './utils/storage';
import { redactSensitiveText } from './utils/redact';
import { openPrintableReport, buildRunReportBody } from './utils/report-builder';
import AuditDetailModal from './components/modals/AuditDetailModal';
import { useBackupFlow } from './hooks/useBackupFlow';
import { useAuditRun } from './hooks/useAuditRun';
import { useAIGeneration } from './hooks/useAIGeneration';
import { useJudgeMerge } from './hooks/useJudgeMerge';
import { useVaultActions } from './hooks/useVaultActions';
import { useProviderModelSync } from './hooks/useProviderModelSync';
import { useModelPingTests } from './hooks/useModelPingTests';
import { useAuditDetail } from './hooks/useAuditDetail';
import { DEFAULT_PROMPTS, getPrompt, getPromptOverrides } from './utils/prompts';
// loadAuditHistory/saveAuditHistory are carried provider-side by their owner
// contexts (HistoryContext / ProvidersContext / useBackupFlow).
// oxlint-disable-next-line no-unused-vars
import { vaultSupported, saveSourceUrls } from './utils/vault';
import { AUDIT_CALL_TIMEOUT_MS, runWithTimeout } from './utils/call-timeout';
import { AppLayout } from './components/layout/AppLayout';


// First-run demo lineup, seeded only when demo mode is on AND no targets were
// ever persisted (so deleting all targets doesn't re-seed them on reload).
const DEMO_TARGETS = [
  { uid: 'sandbox::demo-secure', provider: SANDBOX_PROVIDER_ID, model: 'Demo Secure' },
  { uid: 'sandbox::demo-vulnerable', provider: SANDBOX_PROVIDER_ID, model: 'Demo Vulnerable' }
];

export default function App() {
  const ui = useUI();
  const providersCtx = useProviders();
  const { 
    activeTab, 
    setActiveTab, 
    setTerminalOpen,
    onboardingOpen,
    tourRunning,
    setTourRunning,
    addToast,
    askConfirm,
    askInput,
    finishOnboarding,
  } = ui;

  // Test catalog — solely owned by TestsProvider (custom/disabled tests,
  // presets, selection, sort/filter state, derived suite). One API. App
  // registers its NEW-marker resetter through the setNewMarkerReset bridge.
  const {
    // oxlint-disable-next-line no-unused-vars
    customTests, disabledTestIds, setCustomTests,
    // oxlint-disable-next-line no-unused-vars
    presets, presetFeedback, savePresets, applyPreset, saveCurrentAsPreset,
    // oxlint-disable-next-line no-unused-vars
    removePreset,
    selectedTests, setSelectedTests,
    // Catalog orchestration actions are owned by the provider; App binds them
    // here for the contract surface and consumes setNewMarkerReset.
    // oxlint-disable-next-line no-unused-vars
    toggleTest, selectAllTests, openAddTest, resetTestSuite,
    setNewMarkerReset,
    // oxlint-disable-next-line no-unused-vars
    openEditTest,
    // oxlint-disable-next-line no-unused-vars
    testFilterQ, setTestFilterQ, testFilterSource, setTestFilterSource,
    // oxlint-disable-next-line no-unused-vars
    testFilterTechnique, setTestFilterTechnique,
    // oxlint-disable-next-line no-unused-vars
    testFilterEnabled,
    // oxlint-disable-next-line no-unused-vars
    setTestFilterEnabled,
    // oxlint-disable-next-line no-unused-vars
    testSortIndicator,
    // oxlint-disable-next-line no-unused-vars
    clickTestSort,
    // oxlint-disable-next-line no-unused-vars
    sortedTests,
    // oxlint-disable-next-line no-unused-vars
    testFilterOptions,
    // filteredSortedTests is bound App-side to keep the useTests contract
    // surface complete; its real consumer is TestsView's own useTests()
    // destructure.
    // oxlint-disable-next-line no-unused-vars
    filteredSortedTests,
    // allTestsWithDisabled is bound App-side to keep the useTests contract
    // surface complete; its real consumer is TestsView's own useTests()
    // destructure.
    // oxlint-disable-next-line no-unused-vars
    allTestsById, allTestsWithDisabled, allTests,
    // evalMode/setEvalMode are owned by TestsContext; setEvalMode stays bound
    // App-side to keep the useTests surface complete while its real consumer
    // is RunnerView's own useTests() destructure.
    // oxlint-disable-next-line no-unused-vars
    evalMode, setEvalMode
  } = useTests();

  const {
    vaultLoading,
    vaultLocked,
    setVaultLocked,
    vaultPassphraseSet,
    setVaultPassphraseSet,
    unlockPromptOpen,
    setUnlockPromptOpen,
    providers,
    setProviders,
    setProviderDraft,
    handleUnlockVault,
    lockVault,
    protectVault,
    unprotectVault,
    clearVault,
    autoLoadProviderModels,
    invalidateProviderModelFetches,
    // The provider-policy block below (providerModelsFor, the two predicates and
    // confirmInsecureTransport) is the App-side contract surface whose call
    // sites are provider-side, so App never references them directly.
    /* oxlint-disable no-unused-vars */
    providerModelsFor,
    providerNeedsPrivateBypass,
    providerNeedsInsecureTransport,
    confirmInsecureTransport,
    /* oxlint-enable no-unused-vars */
    providerLabel,
    modelTargetLabel,
    vaultLockedRef,
    vaultStateRef,
    setProviderTest,
    setProviderModelErrors,
  } = providersCtx;

  const {
    useDemoMode, setUseDemoMode,
    judgeConfig, saveJudgeConfig,
    saveGenConfig, effectiveGenConfig,
    atlasMatrix,
  } = useSettings();

  // Remaining App state (non-provider/vault)

  // In read-only (locked) mode, the Auditor Runner and AI Prompts are off-limits.
  // Settings is allowed so user can unlock the vault.
  // Allow access if unlock prompt is open so user can unlock.
  // Also require vaultPassphraseSet to be true (vault actually has a passphrase).
  useEffect(() => {
    if (!vaultLoading && vaultLocked && (vaultPassphraseSet ?? false) && !unlockPromptOpen && (activeTab === 'runner' || activeTab === 'prompts' || activeTab === 'settings')) {
      setActiveTab('dashboard');
    }
  }, [vaultLoading, vaultLocked, vaultPassphraseSet, unlockPromptOpen, activeTab, setActiveTab]);

  const { testJudge, testGenerator, testingJudge, testingGen } = useModelPingTests({ judgeConfig, effectiveGenConfig, providers, vaultLocked, addToast });

  const [selectedProvider, setSelectedProvider] = useState(() => (
    useDemoMode ? SANDBOX_PROVIDER_ID : ''
  ));
  const [selectedModel, setSelectedModel] = useState('');

  // Comparison lineup of target models (the add-form uses selectedProvider/selectedModel)
  // On first run with demo mode on (and no persisted targets), seed the two demo
  // targets so the tour and first audit run work without any configuration.
  const [targets, setTargets] = useState(() => {
    if (localStorage.getItem('atlas_compare_targets') !== null) {
      return readStoredArray('atlas_compare_targets');
    }
    return useDemoMode ? DEMO_TARGETS : [];
  });
  const [expandedCell, setExpandedCell] = useState(null);

  // Reset everything: clear all app data and return to the first-run wizard.
  const resetAllData = async () => {
    if (!(await askConfirm('Reset the whole platform?\n\nThis deletes ALL data: API keys, providers, the AI Judge, test generator, test presets, custom/AI-generated tests, comparison lineup, audit history, demo settings, and cached matrix.\n\nIt will reload the app and show the first-run welcome again.'))) return;
    if (vaultSupported()) {
      try {
        await clearVault();
      } catch (err) {
        addToast(`Reset failed: could not clear the Key Vault (${redactSensitiveText(err.message)}).`);
        return;
      }
    }
    invalidateProviderModelFetches();
    Object.keys(localStorage)
      .filter(k => k.startsWith('atlas_'))
      .forEach(k => localStorage.removeItem(k));
    window.location.reload();
  };

  // AI test generation state — single source of truth: src/context/AIGenContext.jsx.
  // App binds only the consumed names; the wizard, view and hook surfaces read
  // the rest from the context directly.
  const {
    aiGenUrls, setAiGenUrls, aiAddSourceOpen,
    setAiGeneratedCount,
    aiWizardOpen,
    aiPreview, setAiPreview, aiPreviewSelected,
    setAiPreviewSelected,
    recentlyGeneratedIds, setRecentlyGeneratedIds,
    aiRunCtxRef,
  } = useAIGen();

  // The pipeline abort ref is the one App-owned cross-domain ref: armed
  // hook-side by startAiGeneration, aborted App-side by the lock/cancel paths.
  const aiGenAbortRef = useRef(null);

  // AI source-intake operations (toggle/add/save/assess/remove) are owned by the
  // useAIGeneration hook; App binds UI events only and passes the slim
  // cross-domain deps (consolidated state arrives via the contexts).
  const {
    toggleAiGenSource, saveAiSourceDraft, updateSourceDraft, toggleAiGenUrl,
    removeAiGenUrl, handleAddSourceSubmit,
    startAiGeneration, runAiGeneration, confirmAiPreview,
    finalizeAiDraft, cancelAiGeneration, refineAiTests, openAiWizard, toggleAiPreviewItem,
  } = useAIGeneration({
    aiGenAbortRef,
    aiRunCtxRef,
    atlasMatrix,
    allTests,
    buildJudge,
    judgeConfig,
    effectiveGenConfig,
    getPrompt,
    getPromptOverrides,
    runWithTimeout,
    addToast,
    askConfirm,
    askInput,
  });

  // The catalog's resetTestSuite clears the NEW-marker state through the
  // TestsProvider bridge (the state itself stays App-owned here, AIGenContext).
  // The two setters are listed as deps to satisfy react-hooks/exhaustive-deps
  // (both are stable useState setters, so the registration stays mount-once).
  useEffect(() => {
    setNewMarkerReset(() => {
      setRecentlyGeneratedIds([]);
      setAiGeneratedCount(0);
    });
  }, [setNewMarkerReset, setRecentlyGeneratedIds, setAiGeneratedCount]);

  // In-page notifications (replaces JS alert) + promise-based confirm/prompt dialogs.
  // Owned by UIContext, accessed via useUI()

  // Let the API layer (proxy consent, redirect confirmation) use the
  // in-page confirm dialog.
  useEffect(() => {
    setProxyConfirmHandler((msg) => askConfirm(msg));
    setRedirectConfirmHandler((msg) => askConfirm(msg));
    setInsecureTransportConfirmHandler((msg) => askConfirm(msg));
  }, [askConfirm]);

  // Sidebar sub-menu: expand to show a section's quick-jump links, then scroll.
  // Owned by UIContext, accessed via useUI()
  // Bulk import state
  const [importOpen, setImportOpen] = useState(false);

  // In-page diagnostic console state — owned by UIContext.



  // Runner States — owned by AuditProvider (see src/context/AuditContext.jsx).
  const {
    running,
    setRunning,
    setStopping,
    setProgress,
    addConsoleLog,
    clearConsoleLogs,
    results,
    setResults,
    setCurrentTestName,
    auditAbortRef,
    auditRunTokenRef,
  } = useAudit();
  // Reentry-guard mirror for the audit-run engine (kept in sync by useAuditRun).
  const runningRef = useRef(false);

  // Matrix selection mirror — MatrixView reports selection changes through
  // onSelectedTechniqueChange so the guided tour's matrix-grid waitFor keeps
  // working across the component boundary.
  const selectedTechniqueRef = useRef(null);

  // History State — owned by HistoryProvider (see src/context/HistoryContext.jsx),
  // which also owns persistAuditHistory/appendAuditHistory/replaceAuditHistory.
  const {
    history,
    setHistory,
    historyRef,
    appendAuditHistory,
    replaceAuditHistory,
    deleteAudit,
    overrides,
    setOverrides,
    setResultOverride,
    effectiveStatus,
    effectiveDetails,
  } = useHistory();

  // The AI Judge feedback-merge dialog (state machine + ops) is owned by the
  // useJudgeMerge hook; App re-binds it here and keeps only the dialog JSX plus
  // handleResultOverride's gates (the entry delegate runs the pipeline).
  const {
    judgeMerge,
    setJudgeMerge,
    closeJudgeMerge,
    confirmJudgeRewriteApply,
    applyJudgeMerge,
    applyJudgeMergeAndReevaluate,
    rerunJudgeEvaluation,
    rerunJudgeCanaries,
    refineJudgeMerge,
    openMergeWithFeedback,
  } = useJudgeMerge({ historyRef, replaceAuditHistory, buildJudge, judgeConfig, askConfirm, addToast, getPromptOverrides, DEFAULT_PROMPTS });

  const { selectedAudit, setSelectedAudit, expandedDetailIds, setExpandedDetailIds, toggleExpandedDetail, handleDeleteAudit, handleResultOverride, printRunReport, clearHistory } = useAuditDetail({ deleteAudit, replaceAuditHistory, setResultOverride, setOverrides, effectiveDetails, vaultLocked, vaultSupported, openPrintableReport, buildRunReportBody, providerLabel, askConfirm, askInput, addToast, openMergeWithFeedback });

  const mainRef = useRef(null);

  // Menu changes should start the view at the top of the page, not continue
  // from the middle where the user previously scrolled.
  useEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = 0;
  }, [activeTab]);

  // --- First-run onboarding / live tutorial --- (owned by UIContext)

  // Provider/model sync + selection guards are owned by the
  // useProviderModelSync hook; the two selection states stay App-owned above.
  const {
    activeModels, selectedProviderObj, selectedJudgeProvider, judgeModelList,
    selectedGenProvider, genModelList, providerSelectable, helperProviderSelectable
  } = useProviderModelSync({
    selectedProvider, setSelectedProvider, selectedModel, setSelectedModel,
    useDemoMode, judgeConfig, effectiveGenConfig, saveJudgeConfig, saveGenConfig,
    providers, autoLoadProviderModels, providerModelsFor,
    vaultLocked, vaultLoading, activeTab
  });

  // --- Shared model-selector components ---
  //
  // The reusable generator/judge model selectors and the active-model chip are
  // each defined exactly once in their own file:
  //
  //   src/components/GenModelSelector.jsx   — generator provider + model grid
  //   src/components/JudgeModelSelector.jsx — judge provider + model grid,
  //                                           disabled/running gate built in
  //   src/components/ActiveModelChip.jsx    — compact "active model" chip
  //
  // Every component is props-in/events-out: the config value, the resolved
  // provider object and model list, the providers list, the
  // helperProviderSelectable gate and the providerLabel formatter arrive as
  // props from the render site, and every edit flows out through the
  // saveGenConfig / saveJudgeConfig callbacks. None of them reaches a
  // context, a hook or local state.
  //
  // Consumers:
  //
  //   SettingsView helper-models card (gen-config sub-card):
  //     the view imports GenModelSelector; App hands over the gen sync
  //     derivations (selectedGenProvider + genModelList) as data props.
  //   AiGenWizardModal config step:
  //     the modal imports GenModelSelector + ActiveModelChip; App passes the
  //     six data props (selectedGenProvider, genModelList, saveGenConfig,
  //     providers, helperProviderSelectable, providerLabel).
  //   AiGenWizardResults running step:
  //     the results surface imports ActiveModelChip and takes providerLabel
  //     from its own useProviders() destructure.
  //   RunnerView (judge card + run controls) and TestsView (AI card):
  //     both consume callables that App satisfies with inline component
  //     mounts in the wiring props below. The call semantics stay in the
  //     views: the judge selector dims (opacity + pointer-events) when
  //     evalMode is off-judge, the judge chip renders only while running,
  //     and the TestsView chip reports the effective generator config.
  //
  // Save semantics: picking a provider resets the model to '' while picking a
  // model preserves the rest of the config through the spread form; the
  // helper-provider gate is called single-arg; the "No provider configured"
  // option survives; custom (unlisted) models are injected into the fallback
  // select; all four form controls keep the form-input class and stretch full
  // width; the judge controls carry the disabled||running gate.
  //
  // The gen sync derivations themselves (selectedGenProvider, genModelList,
  // selectedJudgeProvider, judgeModelList, helperProviderSelectable) stay
  // App-owned via the useProviderModelSync hook above — the components consume
  // them through props.

  // --- Key Vault actions ---
  // The vaultInput state and the protect/unprotect/lock handler trio are owned
  // by the useVaultActions hook; App keeps only this explicit cross-domain deps
  // object and the bare-identifier wiring into the SettingsView mount. The
  // backup-passphrase reset is a callback because useBackupFlow (which owns
  // that state) is invoked later in the body.
  const {
    vaultInput, setVaultInput, vaultValidationError,
    handleProtectVault, handleUnprotectVault, handleLockVault
  } = useVaultActions({
    providers, setProviders, setProviderDraft, setProviderTest, setProviderModelErrors,
    lockVault, protectVault, unprotectVault, invalidateProviderModelFetches,
    vaultLocked, vaultLockedRef, vaultStateRef, setVaultLocked, setVaultPassphraseSet, setUnlockPromptOpen,
    aiGenUrls, setAiGenUrls, aiGenAbortRef, aiRunCtxRef,
    setHistory, historyRef,
    setResults, clearConsoleLogs, setCurrentTestName, auditAbortRef,
    resetBackupPassphrase: () => setBackupPassphrase(''),
    setActiveTab, setExpandedCell, setExpandedDetailIds, setSelectedAudit,
    addToast, askConfirm
  });

  // Export/import orchestration is owned by useBackupFlow (see
  // src/hooks/useBackupFlow.js); App keeps only thin event-handler bindings.
  const {
    handleExportBackup,
    handleImportBackup,
    backupPassphrase,
    backupValidationError,
    setBackupPassphrase,
    backupImportModal,
    setBackupImportModal,
    closeBackupImportModal,
    submitBackupImportPassphrase
  } = useBackupFlow({
    providers,
    aiGenUrls,
    vaultPassphraseSet,
    vaultLocked,
    historyRef,
    buildConfirmNode: BackupConfirmNode
  });

  // Guided tour steps: switching tabs on enter, pointing at real interface
  // elements via data-tour attributes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const TOUR_STEPS = useMemo(() => buildTourSteps({ setActiveTab, selectedTechniqueRef, targets, presets, DEFAULT_PRESET_ID, allTests, selectedTests, running, results, expandedCell, useDemoMode }), [setActiveTab, selectedTechniqueRef, targets, presets, DEFAULT_PRESET_ID, allTests, selectedTests, running, results, expandedCell, useDemoMode]);

  // Add a model to the comparison lineup
  const addTarget = () => {
    if (!selectedModel) {
      addToast('Select a model to add to the comparison lineup.');
      return;
    }
    const existing = targets.find(t => t.provider === selectedProvider && t.model === selectedModel);
    if (existing) {
      addToast('This model is already in the comparison lineup.');
      return;
    }
    const updated = [...targets, {
      uid: `${selectedProvider}::${selectedModel}`,
      provider: selectedProvider,
      model: selectedModel
    }];
    setTargets(updated);
    localStorage.setItem('atlas_compare_targets', JSON.stringify(updated));
  };

  const removeTarget = (uid) => {
    setTargets(prev => {
      const updated = prev.filter(t => t.uid !== uid);
      localStorage.setItem('atlas_compare_targets', JSON.stringify(updated));
      return updated;
    });
  };

  // Sandbox / demo mode setter (persisted)
  const setDemoMode = (v) => {
    try {
      localStorage.setItem('atlas_demo_mode', String(v));
      setUseDemoMode(v);
    } catch (err) {
      const message = `Could not save sandbox mode: ${redactSensitiveText(err?.message || err)}`;
      try {
        addToast(message, 'error');
      } catch (notificationError) {
        // The visible toast is queued before its history write, which can also
        // fail when storage is full. Keep the preference failure recoverable.
        console.warn(message, 'Could not persist notification:', redactSensitiveText(notificationError?.message || notificationError));
      }
    }
  };

  const log = (msg) => {
    const safe = redactSensitiveText(msg);
    addConsoleLog(`[${new Date().toLocaleTimeString()}] ${safe}`);
    if (/✗|error|cancell/i.test(safe)) {
      setTerminalOpen(true);
    }
  };

  // ── Bulk import of test cases ─────────────────────────────────────────────
  // The dialog is src/components/modals/BulkImportModal.jsx; the gate unmounts
  // it, so its fresh-mount initializers reproduce the reset semantics.
  const openBulkImport = () => {
    setImportOpen(true);
  };

  // Persistence-first import: a failed write keeps the prior catalog and the
  // open modal with no success claimed.
  const handleConfirmImport = (chosen) => {
    const updated = [...customTests, ...chosen];
    if (!setCustomTests(updated)) return false;
    setSelectedTests(prev => [...new Set([...prev, ...chosen.map(t => t.id)])]);
    setImportOpen(false);
    addToast(`${chosen.length} test(s) imported and pre-selected in the suite.`);
  };

  const clearNewMarkers = () => {
    setRecentlyGeneratedIds([]);
    localStorage.setItem('atlas_recent_ai_tests', JSON.stringify([]));
  };


  // Audit-run engine, owned by src/hooks/useAuditRun.js. App keeps only the
  // start/stop button bindings; everything else rides the declared parameter
  // contract.
  const {
    runAudit: runSecurityAudit,
    stopAudit: stopSecurityAudit,
  } = useAuditRun({
    runningRef,
    setRunning,
    setStopping,
    setProgress,
    addConsoleLog,
    clearConsoleLogs,
    setResults,
    setCurrentTestName,
    auditAbortRef,
    auditRunTokenRef,
    vaultLocked,
    vaultPassphraseSet,
    buildJudge,
    judgeConfig,
    providers,
    targets,
    selectedTests,
    evalMode,
    getPrompt,
    getPromptOverrides,
    allTestsById,
    replaceAuditHistory,
    appendAuditHistory,
    deleteAudit,
    setResultOverride,
    effectiveStatus,
    effectiveDetails,
    addToast,
    askConfirm,
    askInput,
    runWithTimeout,
    AUDIT_CALL_TIMEOUT_MS,
    useDemoMode,
    setExpandedCell,
    log,
  });

  // --- First-run onboarding modal: the JSX is in
  // src/components/modals/OnboardingModal.jsx; App wires the handlers.
  const renderOnboarding = () => (
    <OnboardingModal
      onboardingOpen={onboardingOpen}
      onFinish={finishOnboarding}
      onStartTour={() => { finishOnboarding(); setTourRunning(true); }}
      onImportBackup={handleImportBackup}
    />
  );

  return (
    <AppLayout>
      <div ref={mainRef} style={{ flexGrow: 1, minWidth: 0, padding: '40px', overflowY: 'auto', maxHeight: '100vh' }}>
        {vaultLocked && !unlockPromptOpen && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', padding: '10px 14px', background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.35)', borderRadius: '10px', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
            <Lock size={14} color="var(--color-secondary)" style={{ flexShrink: 0 }} />
            <span style={{ flex: '1 1 240px' }}>
              <b>Read-only mode</b> — your API keys are locked, so Settings and the Auditor Runner are disabled and
              AI-powered actions are off. You can still browse the dashboard, matrix, and test library.
            </span>
            <button onClick={() => setUnlockPromptOpen(true)} className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.75rem', justifyContent: 'center' }}>
              <Lock size={12} style={{ marginRight: '4px' }} /> Unlock keys
            </button>
          </div>
        )}

        {/* Header */}
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
          <div>
            <h2 className="title-gradient" style={{ fontSize: '1.8rem', fontWeight: 800, margin: 0 }}>
              {activeTab === 'dashboard' && 'Security Dashboard'}
              {activeTab === 'matrix' && 'MITRE ATLAS Matrix'}
              {activeTab === 'tests' && 'Test Management'}
              {activeTab === 'runner' && 'Auditor Runner'}
              {activeTab === 'prompts' && 'AI Prompts'}
              {activeTab === 'settings' && 'Settings'}
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>
              {activeTab === 'dashboard' && 'Aggregate metrics and historical security posturing logs.'}
              {activeTab === 'matrix' && 'Explore adversarial tactics and techniques mapped to Large Language Models.'}
              {activeTab === 'tests' && 'View, edit, remove or AI-generate the adversarial attack payloads used by the Auditor Runner.'}
              {activeTab === 'runner' && 'Compare multiple models side-by-side against adversarial ATLAS payloads.'}
              {activeTab === 'prompts' && 'Inspect and customize the prompts that drive analysis, generation, critique, and judging.'}
              {activeTab === 'settings' && 'Providers, sandbox, AI judge & generator, vault, and backups — all client-side.'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            {useDemoMode && (
              <span className="badge badge-secondary" style={{ padding: '6px 12px' }} title="Sandbox mode is on — model responses are simulated, not real API calls.">
                <Sparkles size={12} />
                Sandbox Active
              </span>
            )}
          </div>
        </header>

        {/* 1. DASHBOARD VIEW */}
        {activeTab === 'dashboard' && (
          <DashboardView
            effectiveDetails={effectiveDetails}
            clearHistory={clearHistory}
            printRunReport={printRunReport}
            handleDeleteAudit={handleDeleteAudit}
            setSelectedAudit={setSelectedAudit}
            setExpandedDetailIds={setExpandedDetailIds}
          />
        )}

        {/* 2. MITRE ATLAS MATRIX VIEW */}
        {activeTab === 'matrix' && (
          <MatrixView onSelectedTechniqueChange={(tech) => { selectedTechniqueRef.current = tech; }} />
        )}

        {/* Tests view */}
        {activeTab === 'tests' && (
          <TestsView
            recentlyGeneratedIds={recentlyGeneratedIds}
            effectiveGenConfig={effectiveGenConfig}
            // The view consumes a callable chip prop; App mounts the shared
            // component inline.
            renderActiveModelChip={(label, cfg) => (
              <ActiveModelChip label={label} cfg={cfg} providerLabel={providerLabel} />
            )}
            openBulkImport={openBulkImport}
            openAiWizard={openAiWizard}
            clearNewMarkers={clearNewMarkers}
            toggleAiGenSource={toggleAiGenSource}
            toggleAiGenUrl={toggleAiGenUrl}
            removeAiGenUrl={removeAiGenUrl}
          />
        )}

        {activeTab === 'runner' && (
          <RunnerView
            targets={targets}
            addTarget={addTarget}
            removeTarget={removeTarget}
            selectedProvider={selectedProvider}
            setSelectedProvider={setSelectedProvider}
            selectedModel={selectedModel}
            setSelectedModel={setSelectedModel}
            activeModels={activeModels}
            selectedProviderObj={selectedProviderObj}
            providerSelectable={providerSelectable}
            expandedCell={expandedCell}
            setExpandedCell={setExpandedCell}
            runSecurityAudit={runSecurityAudit}
            stopSecurityAudit={stopSecurityAudit}
            // The view consumes callable judge/chip props; App mounts the
            // shared components inline. The dimmed gate (evalMode off-judge)
            // and the running-only chip stay view-side call semantics.
            renderJudgeSelector={(disabled = false) => (
              <JudgeModelSelector
                judgeConfig={judgeConfig}
                selectedJudgeProvider={selectedJudgeProvider}
                judgeModelList={judgeModelList}
                saveJudgeConfig={saveJudgeConfig}
                providers={providers}
                helperProviderSelectable={helperProviderSelectable}
                disabled={disabled}
                running={running}
              />
            )}
            renderActiveModelChip={(label, cfg) => (
              <ActiveModelChip label={label} cfg={cfg} providerLabel={providerLabel} />
            )}
            printRunReport={printRunReport}
            handleResultOverride={handleResultOverride}
          />
        )}

        {/* 4. AI PROMPTS VIEW */}
        <PromptWorkspace
          active={activeTab === 'prompts'}
          buildJudge={buildJudge}
          judgeConfig={judgeConfig}
          getPrompt={getPrompt}
          getPromptOverrides={getPromptOverrides}
          confirmJudgeRewriteApply={confirmJudgeRewriteApply}
          addToast={addToast}
          vaultLocked={vaultLocked}
          vaultPassphraseSet={vaultPassphraseSet}
        />

        {/* 5. SETTINGS VIEW */}
        {activeTab === 'settings' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            <SettingsView
              buildJudge={buildJudge}
              testJudge={testJudge}
              testGenerator={testGenerator}
              testingJudge={testingJudge}
              testingGen={testingGen}
              setDemoMode={setDemoMode}
              // The view imports the shared generator selector itself — App
              // hands over the gen sync derivations as data props.
              selectedGenProvider={selectedGenProvider}
              genModelList={genModelList}
              helperProviderSelectable={helperProviderSelectable}
              selectedJudgeProvider={selectedJudgeProvider}
              judgeModelList={judgeModelList}
              handleProtectVault={handleProtectVault}
              handleUnprotectVault={handleUnprotectVault}
              handleLockVault={handleLockVault}
              vaultInput={vaultInput}
              vaultValidationError={vaultValidationError}
              setVaultInput={setVaultInput}
              resetAllData={resetAllData}
              handleExportBackup={handleExportBackup}
              handleImportBackup={handleImportBackup}
              backupPassphrase={backupPassphrase}
              backupValidationError={backupValidationError}
              setBackupPassphrase={setBackupPassphrase}
            />
          </div>
        )}

      {/* 4b. AI TEST GENERATION WIZARD */}
      {/* The modal imports both selector components itself — App passes the
          six data props (gen sync derivations, save callback, providers,
          helper gate, chip formatter). */}
      {aiWizardOpen && (
        <AiGenWizardModal
          selectedGenProvider={selectedGenProvider}
          genModelList={genModelList}
          saveGenConfig={saveGenConfig}
          providers={providers}
          helperProviderSelectable={helperProviderSelectable}
          providerLabel={providerLabel}
          toggleAiGenSource={toggleAiGenSource}
          toggleAiGenUrl={toggleAiGenUrl}
          startAiGeneration={startAiGeneration}
          cancelAiGeneration={cancelAiGeneration}
          finalizeAiDraft={finalizeAiDraft}
          refineAiTests={refineAiTests}
          toggleAiPreviewItem={toggleAiPreviewItem}
          runAiGeneration={runAiGeneration}
          confirmAiPreview={confirmAiPreview}
          aiPreview={aiPreview}
          setAiPreview={setAiPreview}
          aiPreviewSelected={aiPreviewSelected}
          setAiPreviewSelected={setAiPreviewSelected}
        />
      )}

            {/* 4c. HISTORICAL AUDIT DETAIL MODAL */}
      {selectedAudit && (
        <AuditDetailModal
          selectedAudit={selectedAudit}
          expandedDetailIds={expandedDetailIds}
          onToggleDetail={toggleExpandedDetail}
          onClose={() => setSelectedAudit(null)}
          onDelete={handleDeleteAudit}
          onPrintReport={printRunReport}
          onResultOverride={handleResultOverride}
          effectiveDetails={effectiveDetails}
          modelTargetLabel={modelTargetLabel}
          overrides={overrides}
          vaultLocked={vaultLocked}
          vaultPassphraseSet={vaultPassphraseSet}
          addToast={addToast}
        />
      )}

{/* 4d. BULK IMPORT MODAL */}
      {importOpen && (
        <BulkImportModal
          customTests={customTests}
          onConfirmImport={handleConfirmImport}
          onClose={() => setImportOpen(false)}
          addToast={addToast}
        />
      )}

{/* 5. DIALOG MODAL: ADD CUSTOM TEST CASE */}
      <CustomTestFormModal />

      {/* First-run wizard + live interface tour (hidden while the vault is locked) */}
      {/* On first run (onboardingOpen), show onboarding even if vault state is still loading */}
      {(!vaultLocked || onboardingOpen) && renderOnboarding()}

      {/* Vault unlock prompt (shown at the start of a session when locked) —
          the dialog is src/components/modals/VaultUnlockPrompt.jsx; App mounts
          it unconditionally (the null gate is inside the module). */}
      <VaultUnlockPrompt
        open={unlockPromptOpen}
        vaultInput={vaultInput}
        setVaultInput={setVaultInput}
        onUnlock={handleUnlockVault}
        onClose={() => { setVaultInput(''); setUnlockPromptOpen(false); }}
        onResetAll={resetAllData}
        addToast={addToast}
      />

      {/* Encrypted-backup import modal — dedicated passphrase entry with an
          inline error so a wrong passphrase can be retried without re-selecting
          the file. Used from Settings and the onboarding wizard alike. The
          passphrase UI is in BackupImportModal.jsx; App mounts the component
          unconditionally (the null gate is inside the module). */}
      <BackupImportModal
        backupImportModal={backupImportModal}
        setBackupImportModal={setBackupImportModal}
        closeBackupImportModal={closeBackupImportModal}
        submitBackupImportPassphrase={submitBackupImportPassphrase}
      />

      {/* 8. AI JUDGE FEEDBACK-MERGE DIALOG — shows the merge running, then the
          previous + editable new AI Judge prompt. Scrolls internally so the
          buttons below always stay visible/clickable. */}
      <JudgeMergeDialog judgeMerge={judgeMerge} setJudgeMerge={setJudgeMerge} closeJudgeMerge={closeJudgeMerge} applyJudgeMerge={applyJudgeMerge} applyJudgeMergeAndReevaluate={applyJudgeMergeAndReevaluate} rerunJudgeEvaluation={rerunJudgeEvaluation} rerunJudgeCanaries={rerunJudgeCanaries} refineJudgeMerge={refineJudgeMerge} history={history} />
      {/* 9. ADD CUSTOM SOURCE DIALOG — single flow: input → review → save */}
      {aiAddSourceOpen && <AddSourceDialog handleAddSourceSubmit={handleAddSourceSubmit} saveAiSourceDraft={saveAiSourceDraft} updateSourceDraft={updateSourceDraft} />}

      <Tour steps={TOUR_STEPS} active={tourRunning} onFinish={() => setTourRunning(false)} />

      </div>
    </AppLayout>
  );
}
