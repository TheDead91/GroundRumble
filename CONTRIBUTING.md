# Contributing

Thanks for your interest in GroundRumble! This project is built with a small,
focused codebase and a lot of care. Contributions that respect that are very
welcome.

## Ground rules

- **Branding**: The product is called **GroundRumble**. Keep all user-facing
  text, identifiers, and docs consistent with that name and the current
  positioning (research-grounded, editable test generation; visual
  model/deployment comparison; glass-box prompts; privacy-first architecture).
- **No secrets**: Never commit API keys, tokens, or credentials. Everything
  sensitive lives in the browser's Key Vault at runtime.
- **MITRE ATLAS**: The bundled ATLAS data is Apache-2.0 (copyright The MITRE
  Corporation). Keep the attribution header in `src/data/atlas-bundled.js` and
  the notices in `THIRD_PARTY_NOTICES.md` intact. GroundRumble is not
  affiliated with or endorsed by MITRE.

## What's useful

- **New attack archetypes** and curated test presets (with ATLAS technique
  mappings).
- **Evaluator improvements** — keyword heuristics and AI Judge prompt quality.
- **Provider integrations** and better custom-provider support.
- **Bug reports with substance** — a wrong verdict, a mis-parsed AI response,
  a score that doesn't add up, or an edge case in a custom provider. If you can
  say what you did, what you saw, and what you expected, we can act on it.
- **UI polish** — the app is a single-file React component; keep it readable.
- **Documentation** fixes and improvements (see `docs/`).

## Found a bug?

The reports that matter most are ones where the tool **got the answer wrong** —
a verdict that doesn't match the conversation, a resilience score that doesn't
add up, a generated test that mis-parsed. For those, an issue with three lines
goes a long way: what you did, what you saw, what you expected. Repro steps and
the browser/model combo beat a screenshot alone, but both are welcome.

## Development

```bash
npm install
npm run dev       # dev server
npm run lint      # oxlint
npm run build     # production build
npm run test      # unit + integration tests
npm run screenshots  # regenerate the docs screenshots
```

See [Testing and coverage](docs/testing.md) for the Current Node.js prerequisite,
browser installation, focused subsets, fixtures, and repository-wide coverage
gates. Run `npm run test:coverage:ci` for the complete Node + browser check.

### Dependency install scripts

The `allowScripts` field in `package.json` records the only two transitive
dependencies permitted to run install scripts: `fsevents@2.3.2` and
`fsevents@2.3.3`. Both are macOS-only optional dependencies (of Playwright and
Vite, respectively) whose native build step produces the file-watching addon
used during development on macOS; neither is installed on Linux or Windows.
Approvals are pinned to exact versions so that a future version change requires
a fresh review. Use `npm install-scripts ls` to inspect the current set.

### Project structure

```
src/
├── App.jsx              # UI, auditor runner, dashboard, custom-provider config
├── main.jsx             # entry point
├── components/Tour.jsx  # guided first-run tutorial
├── utils/               # api, ai-judge, ai-generator, ai-analyzer, prompts,
│                        # backup, vault, testImporter
└── data/payloads.js     # local ATLAS matrix, preset payloads, test archetypes
```

`utils/ai-judge.js`, `utils/ai-generator.js`, `utils/ai-analyzer.js` and
`utils/prompts.js` hold the AI pipeline; `utils/api.js` is the transport layer.

## Pull requests

1. Fork the repository and create your branch from `main`.
2. Make focused, logical commits — one concern per commit.
3. Run `npm run lint` and `npm test` before submitting; build to be safe.
4. Reference the issue you're fixing, if any.
5. If you change prompts or the ATLAS bundle, regenerate the affected files
   (`npm run atlas-bundle`, and screenshots if the UI changed).

## Questions?

Open a discussion or an issue. Pull requests that improve the tool for everyone
are always appreciated.
