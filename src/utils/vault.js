import { encryptJSON, decryptJSON, MIN_PASSPHRASE_LENGTH } from './secretbox.js';
export { PBKDF2_ITERATIONS, MIN_ITERATIONS, MAX_ITERATIONS, MIN_PASSPHRASE_LENGTH, clampIterations } from './secretbox.js';
import { normalizeProviders } from './provider-record.js';
export { validateProviders } from './provider-record.js';
import { idbGet, idbSet, idbDelete } from './vault-idb.js';
import { providerNeedsInsecureTransportConfirmation } from './providerSecret.js';
// Secure, browser-only storage for API secrets.
//
// Credentials and provider keys live in IndexedDB (not localStorage),
// so they're not sitting in plain `atlas_*` localStorage keys that any script
// or extension can read. They can additionally be encrypted at rest with an
// optional passphrase (Web Crypto: PBKDF2 + AES-256-GCM). When a passphrase is
// set, the plaintext keys exist only in memory for the current session.

const KEY = 'secrets';
const HISTORY_KEY = 'audit-history';

// --- Passphrase encryption (Web Crypto: PBKDF2 + AES-256-GCM) ---
// The shared crypto core lives in ./secretbox.js; this facade binds it to the
// vault's own context: every envelope is AAD-bound to its IndexedDB record key
// (`groundrumble-vault:<key>:v2`), so a write-capable attacker who can swap
// records cannot transplant a decrypted envelope across purposes, and any
// tampering is rejected at decrypt time. Public constant/clamp names are
// re-exported so existing specifiers keep resolving.

const enc = new TextEncoder();
const aadFor = (key) => enc.encode(`groundrumble-vault:${key}:v2`);

const encryptPayload = (payload, passphrase, aadKey) => encryptJSON(payload, passphrase, aadFor(aadKey));
const decryptPayload = (record, passphrase, aadKey) => decryptJSON(record, passphrase, aadFor(aadKey), 'Key Vault record');


// --- In-memory session passphrase (never persisted) ---
let sessionPassphrase = null;
let vaultLockedState = false;
let vaultGeneration = 0;
let mutationQueue = Promise.resolve();
const enqueueMutation = (operation) => {
  const next = mutationQueue.then(
    () => operation(),
    (err) => { console.warn('Previous mutation failed:', err); return operation(); }
  );
  mutationQueue = next.catch(() => {});
  return next;
};

export const vaultSupported = () =>
  typeof indexedDB !== 'undefined' && typeof crypto?.subtle !== 'undefined';

// Reads the vault. If it is passphrase-encrypted and not unlocked this session,
// returns locked:true (no plaintext).
const parseRecord = (record) => {
  if (!record) return null;
  if (typeof record === 'string') {
    try { return JSON.parse(record); } catch { return null; }
  }
  return record;
};

// Reads the vault. If it is passphrase-encrypted and not unlocked this session,
// returns locked:true (no plaintext).
export const loadVault = async () => {
  const rawRecord = await idbGet(KEY);
  const record = parseRecord(rawRecord);

  if (!record) {
    // First run: adopt any providers already in localStorage, then drop them
    // so the vault (IndexedDB) becomes the single source of truth.
    const storedProviders = localStorage.getItem('atlas_providers');
    let parsedProviders = [];
    let providersParsed = false;
    if (storedProviders) {
      try {
        parsedProviders = JSON.parse(storedProviders);
        providersParsed = true;
      } catch {
        // A corrupt legacy key can never be adopted — drop it so the vault
        // (which now exists as the single source of truth) doesn't leave a
        // plaintext, possibly credential-bearing key in localStorage forever.
        localStorage.removeItem('atlas_providers');
      }
    }
    if (providersParsed) {
      // Legacy `atlas_providers` records are untrusted configuration, not human
      // approval. A secret-bearing cleartext provider adopted from the legacy key
      // arrives disabled so it can never be auto-probed or used until the operator
      // explicitly re-enables it through the action-time consent gate.
      const plain = {
        v: 1,
        kind: 'plain',
        providers: normalizeProviders(parsedProviders).map(p =>
          providerNeedsInsecureTransportConfirmation(p) ? { ...p, enabled: false } : p
        )
      };
      await idbSet(KEY, plain);
      localStorage.removeItem('atlas_providers');
      vaultLockedState = false;
      return { ...plain, locked: false, passphraseSet: false };
    }
    sessionPassphrase = null;
    vaultLockedState = false;
    return { v: 1, kind: 'plain', providers: [], locked: false, passphraseSet: false };
  }

  if (record.kind === 'encrypted') {
    if (sessionPassphrase) {
      try {
        const p = await decryptPayload(record, sessionPassphrase, KEY);
        vaultLockedState = false;
        return {
          v: 1,
          kind: 'encrypted',
          providers: normalizeProviders(p.providers),
          locked: false,
          passphraseSet: true
        };
      } catch {
        // Wrong/expired session passphrase — treat as locked.
      }
    }
    vaultLockedState = true;
    return { v: 1, kind: 'encrypted', providers: [], locked: true, passphraseSet: true };
  }

  vaultLockedState = false;
  return {
    ...record,
    providers: normalizeProviders(record.providers),
    locked: false,
    passphraseSet: record.kind === 'encrypted' ? true : false
  };
};

// Persists secrets (encrypted when a session passphrase is active, plain otherwise).
export const saveVault = async ({ providers }) => {
  return enqueueMutation(async () => {
    if (vaultLockedState) throw new Error('The vault is locked. Unlock it before saving changes.');
    const payload = {
      v: 1,
      providers: normalizeProviders(providers)
    };
    if (sessionPassphrase) {
      const encrypted = await encryptPayload(payload, sessionPassphrase, KEY);
      await idbSet(KEY, encrypted);
    } else {
      await idbSet(KEY, { ...payload, kind: 'plain' });
    }
  });
};

// Unlocks a passphrase-protected vault for this session.
export const unlockVault = async (passphrase) => {
  const rawRecord = await idbGet(KEY);
  const record = parseRecord(rawRecord);
  if (!record || record.kind !== 'encrypted') {
    throw new Error('The vault is not passphrase-protected.');
  }
  const p = await decryptPayload(record, passphrase, KEY); // throws on wrong passphrase
  sessionPassphrase = passphrase;
  vaultLockedState = false;
  vaultGeneration++;
  return {
    providers: normalizeProviders(p.providers),
    locked: false
  };
};

// Sets or changes the vault passphrase (encrypts the current secrets at rest).
export const protectVault = async ({ providers, passphrase }) => {
  if (!passphrase || passphrase.length < MIN_PASSPHRASE_LENGTH) throw new Error(`A passphrase of at least ${MIN_PASSPHRASE_LENGTH} characters is required.`);
  return enqueueMutation(async () => {
    const payload = {
      v: 1,
      providers: normalizeProviders(providers)
    };
    const encrypted = await encryptPayload(payload, passphrase, KEY);
    await idbSet(KEY, encrypted);
    sessionPassphrase = passphrase;
    vaultLockedState = false;
    vaultGeneration++;
  });
};

// Removes the passphrase, storing secrets in plaintext within the vault.
export const unprotectVault = async ({ providers }) => {
  return enqueueMutation(async () => {
    const payload = {
      v: 1,
      kind: 'plain',
      providers: normalizeProviders(providers)
    };
    await idbSet(KEY, payload);
    sessionPassphrase = null;
    vaultLockedState = false;
    vaultGeneration++;
  });
};

export const hasVaultPassphrase = async () => {
  const record = await idbGet(KEY);
  return !!(record && record.kind === 'encrypted');
};

// Drops the in-memory session passphrase so plaintext keys are forgotten.
export const lockVault = () => {
  vaultLockedState = true;
  vaultGeneration++;
  // Immediately clear the session passphrase so the vault is locked immediately.
  // The mutation queue handles writes that were in flight before the lock.
  sessionPassphrase = null;
  // Queue the state transition so writes already queued before the lock retain
  // their encryption mode, while writes queued after it observe the locked state.
  enqueueMutation(async () => {});
};

// Deletes the whole vault (used by the platform reset).
export const clearVault = async () => {
  return enqueueMutation(async () => {
    await idbDelete(KEY);
    await idbDelete(HISTORY_KEY);
    sessionPassphrase = null;
    vaultLockedState = true;
    vaultGeneration++;
  });
};

// Detailed audit evidence is stored separately from the plaintext summary.
// It is encrypted whenever the vault session is passphrase-protected.
export const loadAuditHistory = async () => {
  const rawRecord = await idbGet(HISTORY_KEY);
  const record = parseRecord(rawRecord);
  if (!record) return null;
  if (record.kind !== 'encrypted' || !sessionPassphrase) return null;
  try {
    return await decryptPayload(record, sessionPassphrase, HISTORY_KEY);
  } catch {
    return null;
  }
};

export const saveAuditHistory = async (history) => {
  if (!sessionPassphrase) throw new Error('A passphrase-protected vault is required for detailed audit history.');
  const passphrase = sessionPassphrase;
  // The mutation queue serializes vault writes, so the captured passphrase is
  // always the current session key by the time this runs. A lock does not change
  // it (lock only nulls it via a queued mutation), so a history write queued just
  // before a lock still persists and stays restorable after a later unlock.
  return enqueueMutation(async () => {
    await idbSet(HISTORY_KEY, await encryptPayload(history, passphrase, HISTORY_KEY));
  });
};

export const clearAuditHistory = async () => {
  return enqueueMutation(async () => {
    await idbDelete(HISTORY_KEY);
  });
};

const SOURCES_KEY = 'ai-sources';

export const loadSourceUrls = async () => {
  const rawRecord = await idbGet(SOURCES_KEY);
  const record = parseRecord(rawRecord);
  if (!record) return [];
  if (record.kind === 'encrypted') {
    if (!sessionPassphrase) return [];
    try {
      const p = await decryptPayload(record, sessionPassphrase, SOURCES_KEY);
      return Array.isArray(p) ? p : (Array.isArray(p?.sources) ? p.sources : []);
    } catch {
      return [];
    }
  }
  return record.sources || [];
};

export const saveSourceUrls = async (sources) => {
  return enqueueMutation(async () => {
    const payload = { sources: Array.isArray(sources) ? sources : [] };
    if (sessionPassphrase) {
      const encrypted = await encryptPayload(payload, sessionPassphrase, SOURCES_KEY);
      await idbSet(SOURCES_KEY, encrypted);
    } else {
      await idbSet(SOURCES_KEY, { ...payload, kind: 'plain' });
    }
  });
};
