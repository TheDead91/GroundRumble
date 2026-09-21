// Provisional BLACK-BOX inventory. Open denominators: this is not a saturation certificate.
// Controls are semantic control classes (repeated data rows are equivalence classes).
// A control marked exercised is not necessarily branch- or sequence-exhausted.
export const areas = [
  { area: 'Dashboard', capabilities: [['Overall Resilience Score', 4], ['Resilience by Model', 4], ['Audit History', 5]],
    exercised: ['history View', 'detail View/Hide', 'detail Close', 'model column sorting', 'provider column sorting', 'resilience column sorting', 'execution-tactic column sorting', 'multi-tactic sandbox audit + tactic columns (conv-1b)', 'model report', 'history report', 'delete audit (+Escape/backdrop/Cancel/Confirm/reload)', 'clear history (+Escape/backdrop/Cancel/Confirm/storage-fault/reload)'],
    remaining: [],
    dialogs: ['audit details', 'delete audit confirmation', 'clear history confirmation'],
    dependenciesVerified: ['audit → metrics', 'override → metrics', 'audit → history', 'current test edit → historical title', 'audit → history report content', 'audit → model report content'],
    dependenciesRemaining: [],
  },
  { area: 'ATLAS Matrix', capabilities: [['Matrix Grid', 5]],
    exercised: ['technique selection', 'sub-technique selection', 'mapped test Run', 'Add Prompt (prefill/create/X-discard/save/reload)'], remaining: [],
    dialogs: [], dependenciesVerified: ['generated test → technique detail', 'technique Run → Runner selection', 'ATLAS sync → metadata changes', 'ATLAS-created test → mapped prompts → reload'],
    dependenciesRemaining: [],
  },
  { area: 'Test Management', capabilities: [['AI Test Generation', 5], ['Test Cases', 5], ['Test Presets', 5]],
    exercised: ['add source', 'URL source type', 'pasted source type', 'source URL', 'source title', 'source description', 'source content', 'fetch/assess', 'source Back', 'source Cancel', 'source Add', 'source detail expand', 'source remove', 'source row selection', 'source review title edit', 'source review description edit', 'GitHub source fetch', 'open generator', 'wizard Next', 'wizard Back', 'wizard Cancel', 'wizard X (all panes)', 'advanced mode', 'simple mode', 'Fast mode', 'Deep mode', 'requested count + bounds', 'tests per call select', 'response size select', 'generator provider override', 'generator model override', 'Generate', 'Retry', 'error Back/X', 'profiles Continue', 'profile editing', 'screening editing', 'screening Back/Continue', 'Add without refining', 'review selection', 'Refine with AI', 'Refine & finish', 'New run', 'Add Selected', 'Add Custom Test', 'test name', 'test technique ID', 'test technique name', 'test tactic', 'test rationale', 'system prompt', 'attacker prompt', 'fail keywords', 'refusal keywords', 'Save Payload', 'Enter submit', 'Shift+Enter newline', 'Edit test', 'Update Test', 'form Cancel', 'form X', 'test search', 'Select all', 'Select none', 'Clear NEW markers', 'collapse toggles', 'technique filter', 'source filter', 'removed filter', 'table sorting (name/technique/source)', 'test row selection', 'save preset', 'preset name', 'preset OK', 'preset Apply', 'preset delete', 'Default preset delete/restore', 'duplicate preset replace Cancel/Confirm', 'Bulk Import', 'import content', 'import templates toggle', 'sample format select', 'Insert sample', 'Parse & Preview', 'import Select all', 'import Clear', 'import row selection', 'Import Selected', 'import Cancel', 'import close', 'CSV import', 'YAML import', 'JSONL import', 'oversized import limit', 'Remove test', 'delete Cancel', 'delete Confirm', 'focused Confirm Enter', 'Restore test', 'Reset Suite (+Escape/backdrop/Cancel/Confirm/reload)'],
    remaining: [], // source edit: N/A — no edit control exists (conv-1a); remove+add is the edit path
    dialogs: ['source intake/review', 'generation wizard', 'test create/edit', 'preset name', 'replace duplicate preset', 'bulk import', 'remove test confirmation', 'reset suite confirmation', 'delete Default preset confirmation'],
    dependenciesVerified: ['pasted source → AI requests', 'URL source → AI requests', 'GitHub source → AI requests', 'manual test → Runner', 'generated test → Runner', 'imported test → Runner', 'replaced source content → generation analysis', 'test selection → preset', 'preset → Runner options', 'preset deletion → Runner absence', 'removed test → saved preset availability drop', 'generated test → ATLAS', 'restored test → Runner', 'ATLAS-created test → candidate pool'],
    dependenciesRemaining: [],
  },
  { area: 'Auditor Runner', capabilities: [['Model Comparison Lineup', 5], ['Attack Payloads Selection', 5], ['Run Comparison Audit', 5]],
    exercised: ['Add to Comparison', 'target provider selector', 'target model selector', 'discovery-driven second model', 'model refresh', 'remove lineup entry', 'lineup reload persist', 'Heuristic Keywords', 'AI Judge', 'judge provider selector (+locked until AI Judge)', 'judge model selector', 'Select All', 'Clear All', 'Load preset', 'Save as preset', 'technique filter', 'payload search', 'payload checkbox', 'Run Comparison Audit', 'empty lineup/payload validation', 'Stop Audit', 'failed group toggle', 'inconclusive group toggle', 'succeeded group expand', 'result column sorting', 'verdict detail (+keyboard/X)', 'ERROR detail expand (row click)', 'Secure override', 'Vulnerable override', 'Inconclusive override', 'override reason (+Enter newline)', 'Save Override', 'override X/Cancel/Escape', 'Improve Judge with AI', 'override Cancel', 'Clear override', 'Download Report', 'Judge improvement Cancel', 'improvement re-run evaluation', 'improvement re-run canaries', 'improvement fine-tune', 'improvement Apply only', 'Apply prompt and re-evaluate all models', 'Show Console', 'Hide Console'],
    remaining: [],
    dialogs: ['verdict detail', 'override reason', 'Judge improvement', 'stale/forcing Judge confirmation'],
    dependenciesVerified: ['custom provider → audit', 'raw local provider → audit', 'discovery second model → lineup → audit → reload', 'target response → Judge', 'override → scoring', 'override reason stored + cleared', 'run → report', 'Judge feedback → rewrite request', 'Judge rewrite → reevaluation', 'preset → Runner selection', 'ATLAS Run → Runner selection'],
    dependenciesRemaining: [],
  },
  { area: 'AI Prompts', capabilities: [['AI Judge', 5], ['Source Analysis', 5], ['Test Generation', 5], ['Test Critique', 5], ['Placeholders', 4]],
    exercised: ['Judge System edit', 'Judge User edit', 'Propose edit', 'Assess edit', 'Analyzer edit', 'Generator edit', 'Critic edit', 'Reset to default (seven prompts)', 'Update with AI', 'feedback text', 'empty feedback submit', 'submit rewrite', 'pending rewrite X + late canaries', 'missing-placeholder rejection + Back', 'Skip canary preview (no eval calls)', 'review prompt edit', 'Re-run canaries', 're-run evaluation', 'Fine-tune with another AI pass', 'fine-tune failure → retry', 'blank Apply rejected', 'stale edit → confirm → Apply', 'cancel rewrite review', 'review Cancel/X/Escape/backdrop', 'Apply prompt', 'prompt save failure surfaced', 'placeholder removal validation', 'all seven prompts reload-persist + reset'],
    remaining: [],
    dialogs: ['prompt feedback/review', 'stale/forcing Judge confirmation'],
    dependenciesVerified: ['custom Propose → source request', 'custom Assess → source request', 'custom Analyzer → analysis', 'custom Generator → generation', 'custom Critic → critique', 'custom Judge User placeholders → evaluation', 'Judge improvement rewrite → prompt + reevaluation'],
    dependenciesRemaining: [],
  },
  { area: 'Shell/Nav', capabilities: [['Sidebar Navigation', 3], ['Notifications', 3]],
    exercised: ['collapse sidebar', 'expand sidebar (collapse is session-only; reload restores)', 'Show Dashboard sections', 'Show ATLAS Matrix sections', 'Show Test Management sections', 'Show Auditor Runner sections', 'Show AI Prompts sections', 'Show Settings sections', 'notification bell open', 'Clear notification history'],
    remaining: [],
    dialogs: [],
    dependenciesVerified: [],
    dependenciesRemaining: [],
  },
  { area: 'Settings', capabilities: [['Providers', 5], ['Helper Models', 5], ['MITRE ATLAS', 5], ['Proxy', 5], ['Account & Data', 5], ['Help & Onboarding', 5]],
    exercised: ['Add Provider', 'provider name', 'connector type', 'endpoint', 'private approval', 'API key', 'models list', 'raw response path', 'raw HTTP method (PUT)', 'raw headers', 'raw body template', 'Test Connection', 'helper connectivity failure→retry', 'provider Cancel', 'Save Provider', 'provider Edit (name/rate-limit/models/notes)', 'Save anyway', 'Set up encryption path', 'encryption warning Cancel/Escape/backdrop', 'imported provider Enable', 'provider Delete (immediate, provider-delete-no-confirmation)', 'model refresh/discovery', 'sandbox toggle', 'Judge provider', 'Judge model', 'Generator provider', 'Generator model', 'Test model (Judge + Generator)', 'Sync Live ATLAS (failure→retry→fixture→reload)', 'proxy URL', 'enable proxy toggle', 'article category', 'provider proxy category', 'private proxy category', 'article fetch mode', 'Test Proxy (+relay 500)', 'proxy consent Cancel', 'proxy consent Confirm', 'redirect-follow consent', 'vault passphrase', 'Protect with passphrase', 'passphrase change (short-reject + confirm + old-reject + reload + new-unlock)', 'Lock now', 'Unlock (+wrong/empty/Enter/Escape/backdrop)', 'read-only mode (+gates + Unlock keys reentry)', 'Remove passphrase (+Escape/Cancel/Confirm/reload)', 'backup passphrase', 'Export Backup (+download failure/retry)', 'Import Backup (+invalid JSON/schema/corrupt/file-read failure)', 'backup unlock (+wrong/correct/show-hide/Enter)', 'backup Cancel', 'import Confirm (+double-submit + prompt preview + localStorage-fault rollback)', 'Reset platform (+Escape/backdrop/Cancel/Confirm/welcome/reload)', 'Replay onboarding', 'welcome Skip/X/Enter', 'welcome previous export (invalid→correct)', 'welcome start → tutorial', 'tutorial all 19 steps + Back/Next/gates/Finish/keyboard/reload', 'Start interface tour', 'Groq/Gemini/HuggingFace/OpenRouter/Ollama preset prefills (conv-1b)', 'generator model honored in requests (conv-1c)'],
    remaining: [],
    dialogs: ['unencrypted key warning', 'provider encryption passphrase', 'vault unlock', 'remove passphrase confirmation', 'backup passphrase', 'backup import confirmation', 'proxy consent', 'welcome', 'guided tutorial', 'reset platform confirmation'],
    dependenciesVerified: ['provider → helpers', 'helper → source intake', 'helper → Judge evaluation', 'vault → disabled controls', 'backup → restored test', 'backup → provider review', 'backup → imported prompts win', 'proxy → fetched article', 'proxy provider relay → raw audit', 'vault quota → restore rollback', 'ATLAS sync → Matrix metadata', 'provider model edit → lineup options (discovery-gated)'],
    dependenciesRemaining: [],
  },
];

export const durableMutations = {
  checked: ['provider save/edit/delete', 'manual test create', 'manual test edit cancel', 'generated tests add', 'preset save/delete/replace/restore', 'test remove/restore', 'lineup add/remove', 'helper model selections', 'ATLAS sync', 'audit completion summaries', 'history delete/clear', 'suite reset', 'override save/clear + reason', 'Judge improvement prompt', 'seven prompt edits', 'backup restore', 'vault protection/change/removal/unlock', 'restore rollback (IDB + localStorage faults)', 'proxy URL/toggle/mode'],
  remaining: ['source edit: N/A — no edit control (conv-1a)'],
};

export const aiClasses = {
  successAndFailureOrCancel: ['source proposal', 'source assessment', 'source analysis', 'test generation', 'test critique', 'Judge evaluation', 'prompt rewrite', 'Judge improvement', 'helper-model connectivity'],
  successOnly: [],
};

export const sequences = [
  'manual invalid save → correct → save', 'manual edit → cancel → original', 'manual → selection → preset',
  'manual → sandbox comparison → results', 'override → save → scoring', 'clear override → reload → Dashboard',
  'provider blank-key connectivity → rejection', 'provider key edit → connectivity → save',
  'pasted source → malformed proposal/assessment → review → Back → valid retry → add',
  'analysis semantic failure → Retry → successful profiles', 'generation semantic failure → Retry → candidates',
  'candidates → malformed critique fallback → accept → reload', 'ATLAS technique → mapped generated test → Runner',
  'live target → Judge → result → history reload', 'rewrite semantic invalid response → canaries → cancel',
  'export invalid passphrase → correct → encrypted download', 'vault protect → lock → wrong password → unlock',
  'encrypted backup cancel → mutate → wrong password → correct → confirm → reconstruction',
  'vault read-only → disabled settings/runner → reload → unlock', 'local raw endpoint invalid approval → approve → connectivity',
  'raw local provider → manual audit', 'import invalid → correct JSON → preview → import',
  'imported test remove cancel → remove confirm → restore → audit', 'audit → printable report',
  'URL → proxy declined → inferred assessment', 'proxy configure/test → URL → consent → fetched assessment',
  'advanced generator → profiles → screening → critique 500 → review → cancel',
  'seven prompt edits → blur → reload → reset', 'Propose rewrite → apply → later source request',
  'restore IDB quota → reload → prior entities preserved', 'Judge feedback → rewrite → preview failure → cancel',
  'Judge feedback → valid rewrite → apply/re-evaluate → reload', 'current test edit → historical detail',
  'target auth failure → retry success', 'Judge malformed verdict → inconclusive → retry success',
  'target empty → retry success', 'target connection failure → retry success', 'target 429 → retry success',
  'target 500 → retry success', 'held target → stop → late response → new run',
  'mobile create form → cancel', 'keyboard Enter → type → Cancel Enter',
  'source remove+same-title replacement → generation analysis', 'duplicate preset name → replace Cancel/Confirm',
  'rewrite transport failure → Back → retry success', 'canary 500 → error X → close',
  'provider rename → history report reflects', 'override reason → history report reflects',
  'read-only mutation control hidden', 'remove-passphrase IDB fault → error (encrypted persists)',
  'sidebar collapse (session-only) → section toggles → notification clear',
  'preset prefills all five providers', 'generator model override → request model',
  'Deep mode reconstruct across X-reopen', 'source remove → reload absent',
  'delete-audit double Confirm → single delete', 'history detail after test delete',
  'multi-tactic sandbox audit → tactic sort', 'keyboard tour Finish via Enter',
  'rewrite hold → no Cancel mid-flight → reload discards',
];

if (process.argv[1]?.endsWith('exploration-inventory.mjs')) {
  const { dialogLedger } = await import('./dialog-ledger.mjs');
  const exhausted = dialogLedger.filter(d => d.pending.filter(p => !/N\/A|HARNESS-LIMITED/i.test(p)).length === 0).length;
  for (const a of areas) console.log(`${a.area}: controls ${a.exercised.length}/${a.exercised.length + a.remaining.length}; dependencies ${a.dependenciesVerified.length}/${a.dependenciesVerified.length + a.dependenciesRemaining.length}`);
  const sum = key => areas.reduce((n, a) => n + a[key].length, 0);
  console.log(JSON.stringify({ capabilities: areas.flatMap(a => a.capabilities).length, controls: [sum('exercised'), sum('exercised') + sum('remaining')], dialogs: [exhausted, dialogLedger.length], dependencies: [sum('dependenciesVerified'), sum('dependenciesVerified') + sum('dependenciesRemaining')], meaningfulSequences: sequences.length }));
}
