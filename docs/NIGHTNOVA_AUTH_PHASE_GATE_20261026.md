# NightNova v2.1 — Phase authentication hardening, Action Economy

2026-10-26. Source changes only, not released or tested on a real authenticated Windows browser.

## Code
- Restrict OAuth-related Storage Access to OpenAI and explicitly named provider origins (Google, Apple, Microsoft); reject deceptive hosts and HTTP.
- Refuse malformed tab identifiers before cache-only authentication retry.
- Detach CDP when an embedded tab navigates to an authentication route. Defer reattachment during auth, attempt reattachment only on a normal document.
- Clear tab-specific authentication diagnostics when selecting a different tab.
- Extend targeted permission and privacy tests for provider allowlists, query-string redaction and lookalikes.
- Correct README release status: old installer passed; current source has not.
- Keep the Windows workflow manual-only. No push-triggered Actions, EXE, ZIP or hosted tests.

## Before real-device acceptance (Windows)
1. After explicitly requesting an EXE, run the single manual workflow. Require TypeScript and focused tests PASS, NSIS and manifest PASS.
2. Install on Windows x64. Open an ordinary ChatGPT login. Confirm OpenAI account login and optional Google/Apple/Microsoft flows without clearing credentials or bypassing any challenge.
3. If HTML is returned instead of JSON, use the in-app login diagnostics, capture only safe HTTP status/MIME/host and retry once; do not export session cookies, query strings, or tokens.
4. Test signed-in two conversation tabs: create project watch, seconds/minutes/hours/day configurations, timed idle decision, explicit completion marker, draft/long-generation protection.
5. Pause, then Alt+Shift+X emergency stop, restart application (must remain unarmed), confirm no duplicate sends. Check logs and failure handling.
6. Record failures per feature and batch fixes before another one-shot build.
7. Only declare MVP 100% after a user-observed real Windows pass.

No actual login or hosted test occurred in this source batch. No claim of acceptance is implied.
