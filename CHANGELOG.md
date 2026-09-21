# Changelog

## 1.0.0 — First public release

GroundRumble is a browser-local research and testing workbench for repeatable LLM security evaluation.

- Turn security articles, papers, repositories, URLs, or pasted research into editable, evidence-backed attack suites mapped to MITRE ATLAS.
- Run the same suite across multiple configured providers, models, local endpoints, or guarded deployments and compare results side by side.
- Evaluate responses with offline keyword heuristics or a configurable AI Judge, with manual overrides and inspectable reasoning.
- Review generated tests through source evidence, threat profiles, critique, ATLAS mappings, and human confirmation before adding them to a suite.
- Keep providers, prompts, tests, audit history, and reports in the browser, with an optional passphrase-encrypted Key Vault and encrypted backup/restore.
- Export printable reports and inspect comparison history, resilience scores, technical outcomes, and per-test evidence.
- Use sandbox mode to explore the workflow with simulated secure and vulnerable models without API credentials.

GroundRumble has no hosted backend, account system, or telemetry. Provider calls go directly from the browser to endpoints configured by the user; optional proxy routing is user-configured and consent-gated. Scores measure behavior under the selected suite and configuration and do not prove that a model or deployment is secure. The 1.0.0 release verification covered deterministic local/provider mocks and Chromium; real third-party credentials, Firefox/WebKit, and browser-specific local-network permission behavior were not part of that assurance.

The project is distributed under the MIT License. MITRE ATLAS data is included under its applicable Apache-2.0 notice; GroundRumble is independent of and not endorsed by The MITRE Corporation.
