# Testing and coverage

## Setup and execution

Use the latest **Current** Node.js release from nodejs.org and verify it with
`node --version` before running npm. This suite was developed with Node 26.9.0.
The React source loader uses Node's synchronous module hooks.

```bash
node --version
npm ci
npx playwright install --with-deps chromium

npm test                     # Node regression: unit + integration + behavior + contract
npm run test:browser         # Required real-browser regression (starts its own preview server)
npm run test:exploratory     # Exploratory catalog validation (default) or run one entry
npm run test:integrity       # Suite-integrity check: naming, reachability, orphan detection
npm run test:benchmark       # Standalone endpoint-policy timing benchmark
npm run test:coverage:unit    # Node suite, utility-only coverage (fast diagnostic)
npm run test:coverage         # Full Node + production-browser coverage
npm run test:coverage:ci      # Same suite, with enforced coverage/workflow gates
npm run lint
```

The full coverage command builds `dist/` with source maps, starts a preview on
an available loopback port, runs browser scenarios, and stops the preview.
No model credentials, Docker daemon, or external database is required. Provider
integration uses a local HTTP server on an ephemeral port; browser tests use
real IndexedDB and intercepted model/research responses.

To run just the browser suite against a fresh production build:

```bash
npm run build
npm run test:browser
# Or use an already-running local preview:
TEST_URL=http://127.0.0.1:4173/ npm run test:browser
```

Full coverage always uses its automatically built/local preview (ignoring
`TEST_URL`): the Chromium ranges must match the source-mapped assets in `dist/`.

## Suite layout and naming convention

Permanent executable tests are named `<domain>.<type>.test.mjs` and describe
product behavior, never the history that created them:

| Type | Meaning | Example |
| --- | --- | --- |
| `unit` | Focused function/module/class boundary | `provider-secret.unit.test.mjs` |
| `integration` | Multiple real internal modules/contexts/hooks/components | `audit-run.integration.test.mjs` |
| `behavior` | Product behavioral contract, used sparingly | `provider-delete.behavior.test.mjs` |
| `contract` | Deliberately stable interface/data/behavior contract | `history-privacy.contract.test.mjs` |
| `browser` | Genuinely requires real browser semantics/production browser build | `read-only-mode.browser.test.mjs` |

Test titles describe observable behavior (`provider save preserves the draft
when persistence fails`), never provenance (`T05 provider port`). Titles and
assertion messages describe the durable regression or exploratory behavior
being exercised, not the campaign that discovered it.

Execution boundaries:

| Suite | Files | Standard command |
| --- | --- | --- |
| Node regression | `tests/*.unit\|integration\|behavior\|contract.test.mjs` | `npm test` |
| Browser regression | `tests/browser-smoke.mjs`, `tests/browser-e2e.mjs`, `tests/*.browser.test.mjs`, workflow gate | `npm run test:browser` |
| Exploratory | `tests/exploratory/*` catalog entries | `npm run test:exploratory` |

`npm test` matches the four Node types explicitly, so a newly added canonical
Node test joins the suite with no runner edit; the browser runner discovers
`tests/*.browser.test.mjs` the same way.

## Adding a test without orphaning it

1. Pick the domain and the type above; name the file
   `<domain>.<type>.test.mjs` directly under `tests/`.
2. Give every `test()`/`describe()` title a behavior-led sentence.
3. Run the owning suite (`npm test` for Node types, `npm run test:browser`
   for browser types) plus `npm run test:integrity`.
4. `npm run test:integrity` fails on unrecognized names, provenance prefixes
   in titles, tests unreachable from their standard command, unregistered
   exploratory executables, stale `tests/<path>` references, and
   unjustified root-level executables. It runs in CI and `release:check`.

## Browser suite

`npm run test:browser` runs the complete required real-browser regression:
the smoke harness, the end-to-end workflow scenarios (`tests/browser-e2e.mjs`,
gated by `scripts/ui-workflow-gate.mjs` against `tests/ui-workflows.mjs`),
every `tests/*.browser.test.mjs` file, and the read-only-mode node:test suite.

Browser-only classification: files that need a live preview server and real
browser semantics are `*.browser.*` and never run under `npm test`. The
read-only suite additionally skips without `TEST_URL`, so a direct
`node tests/read-only-mode.browser.test.mjs` invocation stays inert instead
of failing. Do not force genuine browser tests into Node merely to remove
that gate.

Focused browser commands: `npm run test:browser:smoke`,
`npm run test:browser:e2e`, `npm run test:browser:gate` (gate only).

## Exploratory suite

Exhaustive/system exploration lives under `tests/exploratory/` and is
entirely separate from the required suites:

- `acceptance.mjs` — end-to-end acceptance walkthrough with evidence capture
  and opt-in finding checks (`--check all`).
- `dialog-exhaustion-*.mjs`, `dialog-probes.mjs`, `convergence-*.mjs`,
  `discovery-control-sweep.mjs`, `production-journeys.mjs` — black-box
  exploration harnesses; deviations are recorded as findings, not asserted
  as passes.
- `*-probe.mjs` — archived single-concern browser probes, individually runnable.
- `mock-provider-route.mjs`, `dialog-ledger.mjs` — shared route helper and
  dialog evidence index (imported by the harnesses, not executed directly).
- `exploration-inventory.mjs` — runnable control/dependency inventory summary.
- `REPORT-*.md` — archival exploration reports; historical evidence excluded
  from the public release.

```bash
npm run test:exploratory                  # validate the catalog (no browser)
npm run test:exploratory -- --run <name>  # run one entry (provide TEST_URL or EXPLORATORY_BASE_URL)
TEST_URL=http://127.0.0.1:4173/ node tests/exploratory/acceptance.mjs
```

Do not rerun full saturation merely for naming or refactoring; the required
suites never execute exploratory harnesses.

## Benchmark

`tests/endpoint-policy-benchmark.mjs` (`npm run test:benchmark`) is a
standalone timing benchmark. It is intentionally excluded from `npm test`:
wall-clock assertions do not belong in the deterministic regression suite.

## Focused tests

```bash
# Unit boundaries and deterministic clocks
node --test tests/transport-boundaries.unit.test.mjs

# Real audit hook + HTTP transport + verdicts + record construction
node --test tests/audit-run.integration.test.mjs

# Interactive React components (JSDOM)
node --test tests/modal-workflows.integration.test.mjs tests/wizard-results.behavior.test.mjs

# Individual scenario
node --test --test-name-pattern='AuditRun_ConcurrentStartAndStop' tests/audit-run.integration.test.mjs

# Serialized execution, useful when diagnosing isolation
node --test --test-concurrency=1 tests/transport-boundaries.unit.test.mjs tests/audit-run.integration.test.mjs tests/modal-workflows.integration.test.mjs tests/wizard-results.behavior.test.mjs

# Existing domain subsets
node --test tests/vault.integration.test.mjs tests/backup.unit.test.mjs tests/storage.unit.test.mjs
node --test tests/ai-pipeline.integration.test.mjs tests/judge-evaluation.integration.test.mjs tests/generator-pipeline.integration.test.mjs
```

## Reports and enforced scope

- Full HTML report: `.tmp/coverage-all/index.html`
- Full machine-readable summary: `.tmp/coverage-all/coverage-summary.json`
- Utility-only HTML report: `.tmp/coverage/index.html`
- Required browser workflow results: `.tmp/ui-workflow-results.json`
- Browser screenshots and console evidence: `tests/screenshots/e2e-run/`
- Exploratory evidence: `tests/exploratory/*.md` reports plus per-run output
  directories (default `.tmp/exploratory/`)
- GitHub Actions uploads the full report and browser evidence, including on failure.

The full run cleans its report directory first. Failures in any subprocess stop
the pipeline. The report includes **every `src/**/*.js` and `src/**/*.jsx` file**,
including unimported modules. The only exclusion is the generated
`src/data/atlas-bundled.js` research snapshot; its thousands of data lines must
not inflate application coverage. Development/proxy scripts remain tested by
their existing integration suites but are outside the application denominator.

CI requires:

1. At least **85% application line coverage** and **70% branch coverage**.
2. **100% line coverage** for the nine critical modules listed in
   `scripts/check-test-coverage.mjs`: encryption, vault storage, audit record
   construction, verdict scoring, deadlines, source/provider policy, and provider
   request configuration.
3. Every required security/user workflow in `tests/ui-workflows.mjs` passing,
   plus the smoke, matrix and read-only browser suites.
4. Mapped function execution for representative JSX and hook modules. This
   catches invalid source-map reports that show 100% lines but zero functions.
5. `npm run test:integrity` passing: zero orphan or misclassified executables.

These gates define the measured critical-path scope. They do **not** mean every
possible path through every component has 100% branch coverage. In particular,
minified browser function names can differ from Node function names; combined
function percentages are diagnostic, not a CI threshold.

Verified with `npm run test:coverage:ci` on Node 26.9.0:

| Measure | Result |
| --- | --- |
| Node tests | **1,965 passed**, zero failures, zero skips |
| Browser suites | smoke, 18/18 e2e workflows, matrix, read-only (3/3), workflow gate |
| Suite integrity | 173 Node + 2 browser + 28 exploratory entries, 0 orphans |
| Coverage gates | 85% lines / 70% branches thresholds plus 9/9 critical modules at 100% lines (measured 97.91% lines, 94.5% branches) |

## Remaining test debt

The source-text contract suites pin architecture deliberately but are not
substitutes for behavioral coverage. Consult the HTML report for uncovered
AI-generation orchestration, tour, settings and dialog branches.
`src/routes.jsx` is retained in the denominator even though the current App
uses its own tab composition.

## Fixtures, isolation and conventions

- `tests/fixtures/audit-factory.mjs`: fresh provider/test/dependency factories;
  every invocation owns new arrays, state and refs.
- `tests/fixtures/atlas-document.mjs`: deterministic ATLAS response shared by
  browser smoke and end-to-end tests.
- `tests/helpers/react-harness.mjs`: real React roots, `act`-wrapped interactions,
  fresh JSDOM/localStorage, restoration of global descriptors, unmount/close
  cleanup, and uncaught-event assertions.
- `tests/helpers/source-loader.mjs`: resolves application imports and transforms
  JSX with source maps without extracting or rewriting function bodies.
- `tests/helpers/browser-coverage.mjs`: opt-in Chromium V8 coverage mapped to
  local source files. Source-map paths are normalized before c8 filtering.
- `tests/helpers/httpx.mjs`: existing HTTP factories; fast timers now advance
  `Date.now` and honor cancellation, so deadline/rate-limit logic is testable.
- `tests/helpers/dom.mjs`: existing lightweight IndexedDB/localStorage doubles;
  real browser workflows cover persistence semantics beyond those doubles.

New tests use behavior-led titles and explicit Arrange/Act/Assert sections.
Node test files run in isolated processes. Global fetch/clock mocks are
test-scoped and restored; tests sharing a JSDOM global environment execute
serially within their file. Use deferred promises and mocked time for
concurrency rather than wall-clock sleeps. New HTTP servers listen on
port `0` and close connections in teardown. Browser scenarios use fresh contexts.
