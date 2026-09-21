# Security Policy

GroundRumble is a client-side security testing tool. It intentionally runs
entirely in the browser with no backend, so there is no server to compromise and
no telemetry to leak. That said, bugs happen — please report them responsibly.

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Instead, report privately via GitHub's private security advisory:

1. Open the repo and go to **Security → Report a vulnerability**.
2. Describe the issue: affected area, steps to reproduce, impact, and a
   suggested fix if you have one.
3. Include as much context as useful (browser, version, configuration).

You will receive an acknowledgement, and fixes are coordinated with you before
any public disclosure.

## What we look for

- XSS or privilege issues that could expose the user's stored API keys.
- Weaknesses in the encryption/decryption of the browser Key Vault.
- Logic bugs that could produce incorrect or misleading security verdicts.
- Secrets or sensitive material accidentally committed to the repository.

## Scope

The built application is a set of static files. The codebase itself
(`src/`, `scripts/`, `vite.config.js`) is in scope. Vulnerabilities in
third-party dependencies, provider APIs, or your own infrastructure are out of
scope (but still interesting — feel free to share).

## Responsible use

GroundRumble is a red-teaming tool. Only test models you own or are explicitly
authorized to test. Jailbreak and injection payloads can provoke disallowed
behavior in AI systems — keep your testing scoped and ethical.
