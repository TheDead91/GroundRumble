// Required-browser-workflow manifest for the UI workflow gate.
//
// Each entry names a security-critical user flow that MUST be exercised by
// tests/browser-e2e.mjs and pass before the gate (scripts/ui-workflow-gate.mjs)
// accepts a build. The gate fails if any `required` workflow is missing from
// the e2e results file or did not pass.
export const UI_WORKFLOWS = [
  {
    id: 'override_transaction',
    name: 'Transactional human overrides and explicit Judge improvement',
    required: true,
    description: 'Cancel/X/Escape discard pending verdicts; Save never invokes AI; persistence failures preserve the entity; Improve persists before Judge requests; reasons survive reload and encrypted backup restoration.'
  },
  {
    id: 'source_modal_roundtrip',
    name: 'Source dialog validation and persistence',
    required: true,
    description: 'Validate keyboard URL entry and empty pasted content, preserve a draft through Back, edit metadata, save and reload, and commit wizard counts with Enter.'
  },
  {
    id: 'app_navigation_reset',
    name: 'App lineup, onboarding and reset',
    required: true,
    description: 'Edit and reload the comparison lineup, replay onboarding, start and close the tour, cancel then confirm a platform reset.'
  },
  {
    id: 'catalog_create_edit_import_reload_preserves_data',
    name: 'Catalog and prompt persistence',
    required: true,
    description: 'Create and edit a diagnostic, verify it after reload, recover from invalid bulk import, and persist/reset a manual prompt edit.'
  },
  {
    id: 'wizard_empty_sources_and_options_validates_and_persists',
    name: 'AI wizard source and option validation',
    required: true,
    description: 'An empty source selection blocks progression; valid selection enables persisted advanced generation options.'
  },
  {
    id: 'report_consistency',
    name: 'Report consistency',
    required: true,
    description: 'Demo audit renders a result matrix whose per-model scores, failure counts and downloadable report agree on the same verdicts.'
  },
  {
    id: 'cancellation',
    name: 'Audit cancellation',
    required: true,
    description: 'Stopping a run mid-flight persists a completed:false / cancelled:true history record and re-enables the runner.'
  },
  {
    id: 'vault_history_migration',
    name: 'Vault + history migration',
    required: true,
    description: 'Providers migrate from localStorage into the vault; locking strips sensitive detail from localStorage; unlocking restores detailed history.'
  },
  {
    id: 'vault_password_lifecycle',
    name: 'Vault password lifecycle',
    required: true,
    description: 'A fresh session asks for no password; setting a vault password makes the next reload require it, submitting it re-enables navigation, the password can be changed (the new value unlocks the following session) and removed (the reload after that prompts for nothing and Settings stays reachable).'
  },
  {
    id: 'lock_race',
    name: 'Lock race',
    required: true,
    description: 'Locking the vault while a provider request is in flight must not let the stale result repopulate state or leave model discovery disabled.'
  },
  {
    id: 'provider_review',
    name: 'Provider review',
    required: true,
    description: 'Adding a provider, testing its connection and syncing its models must surface deterministic results without page errors.'
  },
  {
    id: 'provenance_reject',
    name: 'Backup provenance rejection',
    required: true,
    description: 'Non-GroundRumble or malformed backup files must be rejected with an explicit error and never touch localStorage.'
  },
  {
    id: 'backup_replace',
    name: 'Backup replace restore',
    required: true,
    description: 'Exporting and re-importing a backup replaces settings atomically and reloads the app with the restored lineup.'
  },
  {
    id: 'encrypted_backup_onboarding',
    name: 'Encrypted backup import',
    required: true,
    description: 'An encrypted backup picked in the onboarding wizard opens a dedicated passphrase modal; a wrong passphrase is retried inline, the right one imports, and the reload skips the wizard.'
  },
  {
    id: 'imported_provider_review',
    name: 'Imported provider review',
    required: true,
    description: 'Imported providers arrive disabled for review; the private/loopback approval survives only for genuinely-local endpoints, and both the explicit Enable button and a successful connection test clear the disabled flag without re-saving the provider.'
  },
  {
    id: 'manual_model_fallback',
    name: 'Manual model fallback',
    required: true,
    description: 'A provider whose model discovery fails (or returns nothing) degrades to a manual model entry and a visible error warning, without crashing or leaking errors.'
  },
  {
    id: 'error_redaction',
    name: 'Provider error redaction',
    required: true,
    description: 'A provider error that echoes an API-key-shaped secret must be redacted in the result row, the console, and persisted history.'
  },
  {
    id: 'report_redaction',
    name: 'Live-run report redaction',
    required: true,
    description: 'A live run whose AI Judge reasoning echoes an API-key-shaped secret must not leak it into the downloadable printable report.'
  }
];
