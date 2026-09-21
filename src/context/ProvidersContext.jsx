import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { loadVault, saveVault, unlockVault, protectVault, unprotectVault, lockVault as lockVaultImpl, clearVault, loadSourceUrls, saveSourceUrls } from '../utils/vault';
import { validateProviders, resolveProviderLabel } from '../utils/provider-record.js';
import { projectDiagnosticText, projectDiagnosticTextStrict } from '../utils/project-diagnostic.js';
import { requestInsecureTransportApproval, recordInsecureTransportApproval, insecureTransportConsentRequired } from '../utils/insecure-transport-consent.js';
import { providerNeedsPrivateBypass, providerNeedsInsecureTransport } from '../utils/provider-endpoint-policy';
import { loadAuditHistory } from '../utils/vault';
import { SANDBOX_PROVIDER_ID, SANDBOX_MODELS, PROVIDER_PRESETS } from '../data/app-config';
import { Cpu as _Cpu } from 'lucide-react';
import { fetchProviderModels, assertProviderEndpointAllowed, testProvider as runProviderTest, deriveModelsEndpoint as deriveModelsEndpointUrl } from '../utils/api';

const ProvidersContext = createContext(null);

/**
 * ProvidersProvider - Manages provider state, vault state, and related actions
 */
export function ProvidersProvider({ children }) {
  // Vault state
  const [vaultLoading, setVaultLoading] = useState(true);
  const [vaultLocked, setVaultLocked] = useState(false);
  const [vaultPassphraseSet, setVaultPassphraseSet] = useState(false);
  const [unlockPromptOpen, setUnlockPromptOpen] = useState(false);
  const [plaintextDismissals, setPlaintextDismissals] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('atlas_plaintext_vault_dismissals') || '[]');
      return new Set(Array.isArray(stored) ? stored.map(String) : []);
    } catch { return new Set(); }
  });

  // Provider state
  const [providers, setProviders] = useState([]);
  const [providerDraft, setProviderDraft] = useState(null); // null = form closed
  const [providerModelFetching, setProviderModelFetching] = useState(false);
  const [providerTest, setProviderTest] = useState({});
  const [providerModelErrors, setProviderModelErrors] = useState({});
  const [providerRefreshing, setProviderRefreshing] = useState({});

  // Refs for async coordination
  const vaultStateRef = useRef({ providers });
  const vaultGenerationRef = useRef(0);
  const vaultLockedRef = useRef(vaultLocked);
  const providerModelFetchesRef = useRef(new Set());
  // Live provider list for the stale-consent re-check: the consent gate re-reads
  // this ref after the dialog resolves so an acceptance of A never authorizes a
  // config that became B while the dialog was open.
  const providersRef = useRef(providers);
  useEffect(() => {
    providersRef.current = providers;
  }, [providers]);
  // Detailed audit history decrypted during handleUnlockVault, stashed for
  // HistoryProvider's restore effect so the detail is already in memory the
  // moment the session flips unlocked (no summaries-only interaction window).
  const restoredAuditHistoryRef = useRef(null);

  useEffect(() => {
    vaultLockedRef.current = vaultLocked;
  }, [vaultLocked]);

  // Hydrate vault on mount
  useEffect(() => {
    const hydrate = async () => {
      try {
        const data = await loadVault();
        console.log('[hydrate] loadVault returned:', { vaultLocked: data?.locked, passphraseSet: data?.passphraseSet, kind: data?.kind, providersCount: data?.providers?.length });
        if (data?.providers) {
          setProviders(data.providers);
          vaultStateRef.current = { providers: data.providers };
        }
        if (data?.locked !== undefined) {
          setVaultLocked(data.locked);
          vaultLockedRef.current = data.locked;
        }
        const passphraseSet = data?.passphraseSet ?? (data?.kind === 'encrypted' ? true : false);
        console.log('[hydrate] computed passphraseSet:', passphraseSet, 'data.kind:', data?.kind);
        setVaultPassphraseSet(passphraseSet);
        // Ask for the vault passphrase once, right at the start of the session.
        if (data?.locked) {
          setUnlockPromptOpen(true);
        }
        // Research sources live in the vault (encrypted when a passphrase is set)
        await loadSourceUrls();
        // Note: aiGenUrls is managed by AIGenContext, we'll need to coordinate
      } catch (err) {
        console.warn('Vault load failed:', err);
      } finally {
        setVaultLoading(false);
      }
    };
    hydrate();
  }, []);

  // Persist providers to vault
  const persistSecrets = useCallback(async (providers) => {
    vaultStateRef.current = { providers };
    await saveVault({ providers });
  }, []);

  const persistProviders = useCallback((providers) => {
    setProviders(providers);
    persistSecrets(providers).catch(err => console.warn('Vault save failed', err));
  }, [persistSecrets]);

  // Provider model fetching (declared ahead of saveProviderDraft, which depends on it)
  const beginProviderModelFetch = useCallback(() => {
    const generation = vaultGenerationRef.current;
    const controller = new AbortController();
    providerModelFetchesRef.current.add(controller);
    return {
      generation,
      signal: controller.signal,
      finish: () => providerModelFetchesRef.current.delete(controller)
    };
  }, []);

  const providerModelFetchCurrent = useCallback((generation) => (
    generation === vaultGenerationRef.current && !vaultLockedRef.current
  ), []);

  const invalidateProviderModelFetches = useCallback(() => {
    vaultGenerationRef.current += 1;
    providerModelFetchesRef.current.forEach(controller => controller.abort());
    providerModelFetchesRef.current.clear();
    setProviderModelFetching(false);
    setProviderRefreshing({});
  }, []);

  const syncProviderModels = useCallback(async (cp) => {
    const request = beginProviderModelFetch();
    setProviderModelFetching(true);
    try {
      const list = await fetchProviderModels(cp, request.signal);
      if (!providerModelFetchCurrent(request.generation)) return;
      if (list.length === 0) { return; }
      setProviders(prev => {
        if (!providerModelFetchCurrent(request.generation)) return prev;
        const next = prev.map(p => p.id === cp.id
          ? { ...p, models: [...new Set([...list, ...(p.models || [])])] }
          : p);
        persistProviders(next);
        return next;
      });
      setProviderModelErrors(prev => { const n = { ...prev }; delete n[cp.id]; return n; });
    } catch (err) {
      if (!providerModelFetchCurrent(request.generation)) return;
      setProviderModelErrors(prev => ({ ...prev, [cp.id]: projectDiagnosticText(err) }));
    } finally {
      request.finish();
      if (providerModelFetchCurrent(request.generation)) setProviderModelFetching(false);
    }
  }, [beginProviderModelFetch, providerModelFetchCurrent, persistProviders]);

  // Provider draft handlers
  const openProviderDraft = useCallback((provider = null) => {
    if (provider) {
      setProviderDraft({
        ...provider,
        allowPrivate: provider.allowPrivate === true,
        allowInsecureTransport: provider.allowInsecureTransport === true,
        modelsText: provider.models.join(', '),
      });
    } else {
      setProviderDraft({
        id: '',
        name: '',
        connector: 'openai',
        endpoint: '',
        modelsEndpoint: '',
        apiKey: '',
        rpm: 0,
        models: [],
        modelsText: '',
        method: 'POST',
        headers: '{}',
        bodyTemplate: '',
        responsePath: 'choices.0.message.content',
        notes: '',
        allowPrivate: false,
        allowInsecureTransport: false,
      });
    }
  }, []);

  const closeProviderForm = useCallback(() => setProviderDraft(null), []);

  const handleProviderDraftChange = useCallback((key, value) => {
    setProviderDraft(prev => prev ? { ...prev, [key]: value } : null);
  }, []);

  const saveProviderDraft = useCallback(async (e) => {
    e.preventDefault();
    if (vaultLocked) { throw new Error('The Key Vault is locked. Unlock it in the Key Vault section before saving providers.'); }
    const d = providerDraft;
    if (!d.name.trim()) { throw new Error('Provider name is required.'); }
    const dupName = providers.find(p => p.id !== d.id && p.name.trim().toLowerCase() === d.name.trim().toLowerCase());
    if (dupName) { throw new Error('A provider with this name already exists.'); }
    if (!d.endpoint.trim() || !/^https?:\/\//i.test(d.endpoint)) { throw new Error('A valid endpoint URL (http:// or https://) is required.'); }
    
    // Validate endpoint allowed
    assertProviderEndpointAllowed(d.endpoint, { allowPrivate: d.allowPrivate === true, allowInsecureTransport: d.allowInsecureTransport === true });
    if (d.modelsEndpoint.trim()) assertProviderEndpointAllowed(d.modelsEndpoint, { allowPrivate: d.allowPrivate === true, allowInsecureTransport: d.allowInsecureTransport === true });
    
    if (d.connector === 'raw' && !d.bodyTemplate.trim()) { throw new Error('Body Template is required for Raw connector.'); }
    if (d.headers.trim()) {
      try {
        const h = JSON.parse(d.headers);
        if (typeof h !== 'object' || Array.isArray(h)) throw new Error();
      } catch { throw new Error('Headers must be a valid JSON object.'); }
    }
    
    const models = d.modelsText.split(',').map(s => s.trim()).filter(Boolean);
    const provider = {
      id: d.id || `cp_${Date.now().toString(36)}`,
      name: d.name.trim(),
      endpoint: d.endpoint.trim(),
      apiKey: d.apiKey.trim(),
      rpm: Math.max(0, parseInt(d.rpm, 10) || 0),
      connector: d.connector,
      models,
      modelsEndpoint: d.modelsEndpoint.trim(),
      method: d.method.trim() || 'POST',
      headers: d.headers.trim(),
      bodyTemplate: d.bodyTemplate,
      responsePath: d.responsePath.trim() || 'choices.0.message.content',
      notes: d.notes.trim(),
      allowPrivate: d.allowPrivate === true,
      allowInsecureTransport: d.allowInsecureTransport === true,
    };
    
    const exists = providers.some(p => p.id === provider.id);
    await validateProviders(exists ? providers.map(p => p.id === provider.id ? provider : p) : [...providers, provider]);
    
    const nextProviders = exists ? providers.map(p => p.id === provider.id ? provider : p) : [...providers, provider];
    await saveVault({ providers: nextProviders });
    vaultStateRef.current = { providers: nextProviders };
    setProviders(nextProviders);
    setProviderDraft(null);

    // A form save that asserted `allowInsecureTransport: true` for a genuinely
    // secret-bearing cleartext endpoint is the operator's explicit action-time
    // consent, so record it once here — bound to the exact saved identity — and
    // later enable/probe/refresh/use of the unchanged config will not re-prompt.
    if (insecureTransportConsentRequired(provider)) recordInsecureTransportApproval(provider);

    // Auto-fetch models for the saved provider (if OpenAI-compatible and has models endpoint)
    if (provider.connector !== 'raw' && (provider.modelsEndpoint || provider.endpoint)) {
      // Use setTimeout to allow state to settle first
      setTimeout(() => syncProviderModels(provider), 0);
    }
  }, [providerDraft, providers, vaultLocked, syncProviderModels]);

  // Persistence-first deletion — a failed vault write leaves the
  // provider in place instead of claiming a deletion that did not persist.
  const deleteProvider = useCallback(async (id) => {
    const next = providers.filter(p => p.id !== id);
    if (next.length === providers.length) return false;
    try { await persistSecrets(next); } catch { return false; }
    setProviders(next);
    return true;
  }, [providers, persistSecrets]);

  const testProvider = useCallback(async (id) => {
    const provider = providers.find(p => p.id === id);
    if (!provider) return;
    // A saved secret-bearing cleartext provider must be approved before the probe
    // transmits its key. Decline leaves it disabled and issues zero requests.
    const approved = await requestInsecureTransportApproval(provider, () => providersRef.current.find(p => p.id === id) || provider);
    if (!approved) {
      setProviderTest(prev => ({ ...prev, [id]: { status: 'error', message: 'Insecure transport not approved — no request was sent.' } }));
      return;
    }
    setProviderTest(prev => ({ ...prev, [id]: { status: 'testing' } }));
    try {
      const result = await runProviderTest(provider, new AbortController().signal);
      const wasDisabled = provider.enabled === false;
      const baseMessage = `Connected — ${result.models?.length || 0} model(s) found`;
      const message = wasDisabled ? `${baseMessage} (verified — enabled for use)` : baseMessage;
      setProviderTest(prev => ({ ...prev, [id]: { status: 'ok', message } }));
      // A successful live probe doubles as the review for an imported (disabled)
      // provider: enable it so it can be selected for audits and judging.
      if (result.models?.length || wasDisabled) {
        const next = providers.map(p => p.id === id ? {
          ...p,
          ...(result.models?.length ? { models: result.models, modelsText: result.models.join(', ') } : {}),
          ...(wasDisabled ? { enabled: true } : {})
        } : p);
        persistProviders(next);
      }
    } catch (err) {
      setProviderTest(prev => ({ ...prev, [id]: { status: 'error', message: projectDiagnosticText(err) } }));
    }
  }, [providers, persistProviders]);

  const handleProviderTest = useCallback(async (providerLike, testKey) => {
    // If it's a provider object (like a draft), test it with key 'draft'
    // If it's an ID string, test the saved provider
    if (typeof providerLike === 'string') {
      return testProvider(providerLike);
    }
    // It's a provider object (draft or similar)
    const resolvedKey = testKey || 'draft';
    // Saved-provider probes (the row Test button) transmit the stored key; gate
    // them with the shared consent. The draft form test ('draft') is governed by
    // the form checkbox and the save-time endpoint assertion instead.
    if (resolvedKey !== 'draft') {
      const approved = await requestInsecureTransportApproval(providerLike, () => providersRef.current.find(p => p.id === providerLike.id) || providerLike);
      if (!approved) {
        setProviderTest(prev => ({ ...prev, [resolvedKey]: { status: 'error', message: 'Insecure transport not approved — no request was sent.' } }));
        return;
      }
    }
    setProviderTest(prev => ({ ...prev, [resolvedKey]: { status: 'testing', message: 'Testing connection…' } }));
    try {
      const result = await runProviderTest(providerLike, new AbortController().signal);
      const wasDisabled = providerLike.enabled === false;
      const baseMessage = `Connected — ${result.models?.length || 0} model(s) found`;
      const message = wasDisabled ? `${baseMessage} (verified — enabled for use)` : baseMessage;
      setProviderTest(prev => ({ ...prev, [resolvedKey]: { status: 'ok', message } }));
      if (result.models?.length) {
        setProviderTest(prev => ({ ...prev, [resolvedKey]: { ...prev[resolvedKey], models: result.models, modelsText: result.models.join(', ') } }));
      }
      // A successful live probe doubles as the review for an imported (disabled)
      // provider: enable it so it can be selected for audits and judging.
      if ((result.models?.length || wasDisabled) && providers.some(p => p.id === providerLike.id)) {
        const next = providers.map(p => p.id === providerLike.id ? {
          ...p,
          ...(result.models?.length ? { models: result.models, modelsText: result.models.join(', ') } : {}),
          ...(wasDisabled ? { enabled: true } : {})
        } : p);
        persistProviders(next);
      }
      return result;
    } catch (err) {
      console.error('[handleProviderTest] Error:', projectDiagnosticTextStrict(err));
      const message = projectDiagnosticText(err);
      setProviderTest(prev => ({ ...prev, [resolvedKey]: { status: 'error', message } }));
      throw new Error(message);
    }
  }, [providers, testProvider, persistProviders]);

  // Vault actions
  const handleUnlockVault = useCallback(async (passphrase) => {
    try {
      const data = await unlockVault(passphrase);
      // Decrypt the detailed audit history under the fresh session passphrase
      // BEFORE the UI flips unlocked. The unlock→restore window otherwise spans
      // an IndexedDB read plus a full PBKDF2 derive (seconds in a real browser),
      // and reports opened in that window silently render summaries-only detail.
      let detailed = null;
      try { detailed = await loadAuditHistory(); } catch { detailed = null; }
      restoredAuditHistoryRef.current = Array.isArray(detailed) ? detailed : null;
      setProviders(data.providers);
      vaultStateRef.current = { providers: data.providers };
      setVaultLocked(false);
      setVaultPassphraseSet(true);
      setUnlockPromptOpen(false);
      return { success: true };
    } catch (err) {
      restoredAuditHistoryRef.current = null;
      return { success: false, error: err?.message || 'Invalid passphrase' };
    }
  }, []);

  const lockVault = useCallback(async () => {
    await lockVaultImpl();
    setVaultLocked(true);
    setProviders([]);
    setUnlockPromptOpen(true);
    // vaultPassphraseSet remains true - the passphrase is still set, just locked
  }, []);

  const protectVaultAction = useCallback(async (passphrase) => {
    try {
      await protectVault({ providers, passphrase });
      setVaultPassphraseSet(true);
      setVaultLocked(false);
      return true;
    } catch {
      return false;
    }
  }, [providers]);

  const unprotectVaultAction = useCallback(async () => {
    await unprotectVault({ providers });
    setVaultPassphraseSet(false);
    setVaultLocked(false);
  }, [providers]);

  const clearVaultAction = useCallback(async () => {
    await clearVault();
    setVaultLocked(true);
    setVaultPassphraseSet(false);
    setProviders([]);
  }, []);

  const refreshProviderModels = useCallback(async (cp) => {
    const wasDisabled = cp.enabled === false;
    // A disabled secret-bearing cleartext provider would auto-enable on a
    // successful refresh; gate the probe (which transmits the key) and the
    // enable with the same consent. Decline = zero fetch, stays disabled.
    const approved = await requestInsecureTransportApproval(cp, () => providersRef.current.find(p => p.id === cp.id) || cp);
    if (!approved) {
      setProviderModelErrors(prev => ({ ...prev, [cp.id]: 'Insecure transport not approved — no request was sent.' }));
      return;
    }
    const request = beginProviderModelFetch();
    setProviderRefreshing(prev => ({ ...prev, [cp.id]: true }));
    try {
      const list = await fetchProviderModels(cp, request.signal);
      if (!providerModelFetchCurrent(request.generation)) return;
      if (list.length === 0) { return; }
      setProviders(prev => {
        if (!providerModelFetchCurrent(request.generation)) return prev;
        const next = prev.map(p => p.id === cp.id ? { ...p, models: list, ...(wasDisabled ? { enabled: true } : {}) } : p);
        persistProviders(next);
        return next;
      });
      setProviderModelErrors(prev => { const n = { ...prev }; delete n[cp.id]; return n; });
    } catch (err) {
      if (!providerModelFetchCurrent(request.generation)) return;
      setProviderModelErrors(prev => ({ ...prev, [cp.id]: projectDiagnosticText(err) }));
    } finally {
      request.finish();
      if (providerModelFetchCurrent(request.generation)) {
        setProviderRefreshing(prev => { const n = { ...prev }; delete n[cp.id]; return n; });
      }
    }
  }, [beginProviderModelFetch, providerModelFetchCurrent, persistProviders]);

  // Provider utilities
  const deriveModelsEndpoint = useCallback(async (cp) => deriveModelsEndpointUrl(cp), []);

  const autoLoadProviderModels = useCallback(async (onlyId = null) => {
    const request = beginProviderModelFetch();
    const targets = providers.filter(cp =>
      cp.enabled !== false && cp.connector !== 'raw' && (onlyId ? cp.id === onlyId : true) && deriveModelsEndpoint(cp)
    );
    try {
      if (targets.length === 0) return;
      const results = await Promise.all(
        targets.map(async (cp) => {
          try {
            return { cp, list: await fetchProviderModels(cp, request.signal), error: null };
          } catch (err) {
            return { cp, list: [], error: projectDiagnosticText(err) };
          }
        })
      );
      if (!providerModelFetchCurrent(request.generation)) return;
      const updates = {};
      const errors = {};
      results.forEach(({ cp, list, error }) => {
        if (error) {
          errors[cp.id] = error;
          console.warn('Custom model auto-fetch failed:', cp.name, projectDiagnosticTextStrict(error));
        } else if (list.length > 0) {
          updates[cp.id] = list;
        }
      });
      setProviderModelErrors(prev => ({ ...prev, ...errors }));
      if (Object.keys(updates).length > 0) {
        setProviders(prev => {
          if (!providerModelFetchCurrent(request.generation)) return prev;
          const next = prev.map(p => updates[p.id] ? { ...p, models: updates[p.id] } : p);
          persistProviders(next);
          return next;
        });
      }
    } finally {
      request.finish();
    }
  }, [providers, beginProviderModelFetch, providerModelFetchCurrent, persistProviders, deriveModelsEndpoint]);

  // Build a provider object from the draft form (mirrors saveProviderDraft).
  const cpFromDraft = useCallback((d) => {
    const models = (d.modelsText || '').split(',').map(s => s.trim()).filter(Boolean);
    return {
      id: d.id || 'draft',
      name: d.name,
      endpoint: d.endpoint.trim(),
      apiKey: d.apiKey.trim(),
      rpm: Math.max(0, parseInt(d.rpm, 10) || 0),
      connector: d.connector,
      models,
      modelsEndpoint: (d.modelsEndpoint || '').trim(),
      allowPrivate: d.allowPrivate === true,
      allowInsecureTransport: d.allowInsecureTransport === true,
      method: d.method.trim() || 'POST',
      headers: d.headers.trim(),
      bodyTemplate: d.bodyTemplate,
      responsePath: d.responsePath.trim() || 'choices.0.message.content'
    };
  }, []);

  const providerModelsFor = useCallback((cp) => (cp.models || []).map(m => ({ id: m, name: m })), []);

  // Single context-level consent gate: delegated to the shared primitive with a
  // live re-read of the current provider so a stale acceptance cannot authorize
  // a changed config. Return value is the authority decision for the action.
  const confirmInsecureTransport = useCallback(async (cp) => {
    return requestInsecureTransportApproval(cp, () => providersRef.current.find(p => p.id === cp?.id) || cp);
  }, []);

  const setPlaintextDismissal = useCallback((providerId) => {
    setPlaintextDismissals(prev => {
      const next = new Set(prev);
      next.add(String(providerId));
      try { localStorage.setItem('atlas_plaintext_vault_dismissals', JSON.stringify([...next])); } catch { /* storage unavailable */ }
      return next;
    });
  }, []);

  // Provider label helpers
  const providerLabel = useCallback((ref) => {
    if (ref === SANDBOX_PROVIDER_ID) return `Sandbox (${SANDBOX_MODELS.length} models)`;
    return resolveProviderLabel(ref, providers);
  }, [providers]);

  const modelTargetLabel = useCallback((provider, model) => {
    const cp = providers.find(p => p.id === provider);
    return `${cp ? cp.name : providerLabel(provider)} / ${model}`;
  }, [providers, providerLabel]);

  // Provider selection helpers (require useDemoMode from SettingsContext)
  const providerSelectable = useCallback((p, _useDemoMode) => {
    if (p === SANDBOX_PROVIDER_ID) return _useDemoMode;
    return providers.some(cp => cp.id === p && cp.enabled !== false);
  }, [providers]);

  const helperProviderSelectable = useCallback((p, _useDemoMode) => 
    p !== SANDBOX_PROVIDER_ID && providerSelectable(p, _useDemoMode), [providerSelectable]);

  // Model list helpers
  const getActiveModelList = useCallback((selectedProvider, _useDemoMode) => {
    if (selectedProvider === SANDBOX_PROVIDER_ID) return SANDBOX_MODELS;
    const cp = providers.find(p => p.id === selectedProvider);
    return cp ? cp.models : [];
  }, [providers]);

  // Context value
  const value = {
    // Vault state
    vaultLoading,
    vaultLocked,
    setVaultLocked,
    vaultPassphraseSet,
    setVaultPassphraseSet,
    unlockPromptOpen,
    setUnlockPromptOpen,
    plaintextDismissals,
    
    // Provider state
    providers,
    setProviders,
    persistProviders,
    providerDraft,
    setProviderDraft,
    providerModelFetching,
    providerTest,
    providerModelErrors,
    setProviderModelErrors,
    providerRefreshing,
    
    // Provider actions
    openProviderDraft,
    closeProviderForm,
    handleProviderDraftChange,
    saveProviderDraft,
    deleteProvider,
    testProvider,
    setProviderTest,
    handleProviderTest,
    
    // Vault actions
    handleUnlockVault,
    lockVault,
    protectVault: protectVaultAction,
    unprotectVault: unprotectVaultAction,
    clearVault: clearVaultAction,
    saveSourceUrls,
    
    // Model fetching
    autoLoadProviderModels,
    syncProviderModels,
    refreshProviderModels,
    beginProviderModelFetch,
    providerModelFetchCurrent,
    invalidateProviderModelFetches,
    
    // Provider utilities
    providerModelsFor,
    providerNeedsPrivateBypass,
    providerNeedsInsecureTransport,
    confirmInsecureTransport,
    setPlaintextDismissal,
    cpFromDraft,
    
    // Helpers
    providerLabel,
    modelTargetLabel,
    providerSelectable,
    helperProviderSelectable,
    getActiveModelList,
    SANDBOX_PROVIDER_ID,
    SANDBOX_MODELS,
    PROVIDER_PRESETS,
    
    // Refs for advanced coordination
    vaultLockedRef,
    vaultStateRef,
    vaultGenerationRef,
    providerModelFetchesRef,
    restoredAuditHistoryRef,
  };

  return (
    <ProvidersContext.Provider value={value}>
      {children}
    </ProvidersContext.Provider>
  );
}

// oxlint-disable-next-line react/only-export-components
export function useProviders() {
  const context = useContext(ProvidersContext);
  if (!context) throw new Error('useProviders must be used within a ProvidersProvider');
  return context;
}
export { ProvidersContext };
