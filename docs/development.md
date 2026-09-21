# Development

## Commands

```bash
npm run dev          # start the dev server
npm run build        # production build (dist/)
npm start            # build, then serve the production build (see "Production")
npm run serve        # serve an existing production build (dist/)
npm run lint         # oxlint
npm run audit        # npm audit --audit-level=high
npm run preview      # preview the production build
npm test             # Node regression: unit + integration + behavior + contract (tests/*.{unit,integration,behavior,contract}.test.mjs)
npm run test:browser # required real-browser regression: smoke + e2e workflows + tests/*.browser.test.mjs + workflow gate (starts its own preview server)
npm run test:exploratory # exploratory catalog validation (default) or run one harness/probe: -- --run <name>
npm run test:integrity # suite-integrity check: naming, reachability, orphan detection (also in release:check and CI)
npm run test:benchmark # standalone endpoint-policy timing benchmark (excluded from npm test)
npm run test:e2e:proxy # focused proxy end-to-end suite (also runs inside npm test)
npm run test:coverage:unit # Node tests with utility-only coverage
npm run test:coverage:ci   # Node + browser tests with full application coverage gates
npm run check:bundle # production entry-chunk size budget
npm run release:check # lint → audit → suite integrity → full coverage (includes build/browser) → bundle budget
npm run screenshots  # regenerate docs screenshots (scripts/capture-screenshots.mjs)
npm run atlas-bundle # rebuild the bundled ATLAS matrix (scripts/build-atlas-bundle.mjs)
```

## Production

A production release is served from `dist/`. `npm start` (build + `npm run serve`)
runs Vite's preview server on `127.0.0.1:4173`; `npm run serve` skips the rebuild
if `dist/` is already current. Use the preview server (not a generic static file
server) for anything that handles real credentials:

- It emits the application's security headers (CSP, `X-Frame-Options`, COOP/CORP,
  `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`).

Provider and article calls go **directly from the browser** to their hosts, so the
app works from any static hosting for those; requests you choose to relay go
through your configured external proxy instead. A plain static deployment of
`dist/` simply lacks the security headers. Deploy behind a
trusted reverse proxy that terminates TLS. Do not bind the preview server to
`0.0.0.0` on an untrusted network.

Before a release, run `npm run release:check` — it verifies lint, `npm audit`
(High severity), the coverage-gated Node/browser suites, the production build, the bundle
size budget, and the full browser suite against a fresh preview server.

## Project structure

```
src/
├── App.jsx              # UI, auditor runner, dashboard, custom-provider config (single-file React component)
├── main.jsx             # Entry point
├── components/
│   └── Tour.jsx         # Guided first-run tutorial (spotlight walkthrough)
├── utils/
 │   ├── api.js           # Provider clients, custom connectors, ATLAS fetcher, proxy routing, rate limiter, JSON repair
│   ├── ai-judge.js      # AI Judge evaluation + feedback-merge into the judge prompt
│   ├── ai-generator.js  # Test-generation pipeline (generate + critique, robust JSON parsing)
│   ├── ai-analyzer.js   # Source analysis into threat profiles + source assessment
│   ├── prompts.js       # User-editable AI prompts (judge, analyzer, generator, critic, assessor)
│   ├── backup.js        # Encrypted export/import of all settings & data
│   ├── testImporter.js  # Bulk test import (JSON, etc.)
│   └── vault.js         # Secure IndexedDB credential storage (optional passphrase encryption)
├── data/
│   ├── payloads.js      # Local ATLAS matrix, preset payloads, test archetypes
│   └── atlas-bundled.js # Pre-bundled MITRE ATLAS matrix (regenerate via npm run atlas-bundle)
└── App.css / index.css  # Styles
```

## The user-configured proxy

GroundRumble embeds no proxy server: `vite.config.js` only attaches security headers (plus a build-time CSP meta tag).
Selected article, provider, and private-network requests can be relayed through a user-configured external proxy URL
(see [Security & Privacy](security.md)), with per-request consent. This powers article fetching for AI Test Generation
when the browser blocks the direct request.

## Tests

`npm test` runs the Node regression suite in `tests/` — every
`*.unit`, `*.integration`, `*.behavior` and `*.contract` test:

- `generator.unit.test.mjs` — test-payload parsing/validation
- `payload-parsing.unit.test.mjs` — judge/payload JSON parsing
- `article-excerpt.unit.test.mjs` — Readability-based article extraction
- `ai-pipeline.integration.test.mjs` — end-to-end analysis → generation against
  a local mock model server (clean content, reasoning-only responses, garbage responses)
- `endpoint-resolution.unit.test.mjs`, `prompts.unit.test.mjs` — API endpoint + prompt utilities

Real-browser regression lives behind `npm run test:browser` (smoke, end-to-end
workflows, `tests/*.browser.test.mjs`, workflow gate); exhaustive exploration
lives behind `npm run test:exploratory`. See [Testing and coverage](testing.md)
for the naming convention, suite boundaries, and how to add a test without
orphaning it.

`npm run test:coverage:ci` combines Node and Chromium coverage over application
JavaScript and JSX, including hooks and components. It enforces 85% overall
lines, 100% lines for designated critical modules, and passing required browser
workflows. See [Testing and coverage](testing.md) for setup, targeted commands,
report locations, the assessment, and remaining test debt.

## Docs

These docs are built with **MkDocs** for Read the Docs:

```bash
pip install -r docs/requirements.txt
mkdocs serve          # local preview at http://127.0.0.1:8000
mkdocs build          # static build in site/
```

The Read the Docs build is configured in `.readthedocs.yaml`.

## Contributing

Pull requests welcome for new attack archetypes, evaluator improvements, provider integrations, and UI polish.
