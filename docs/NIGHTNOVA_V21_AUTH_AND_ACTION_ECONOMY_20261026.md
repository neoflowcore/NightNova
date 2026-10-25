# NightNova v2.1 — Action Economy & OpenAI Login Recovery (2026-10-26)

Source implementation only. No Windows EXE, installer ZIP, Actions job or deployment generated.

## Prior verified blocker
Windows run 40206867139 failed in TypeScript: src/main/auth-support.test.ts used ../../shared/auth-support instead of ../shared/auth-support. Fixed in this batch. No login success is inferred from source changes.

## Changes
1. Windows Actions is manual-only (workflow_dispatch); source pushes and workflow-file changes DO NOT trigger an installer.
2. Focused tests include auth-support.test.ts only when a human explicitly requests Windows acceptance.
3. Browser session grants Storage Access only between verified HTTPS official OpenAI origins; other special permissions stay denied.
4. Memory-only authentication network diagnostics: official host, status, resource type, MIME type, safe issue category; no request URL, cookies, credentials or response body.
5. Bounded ring buffer and origin-matching tests, including adversarial lookalike domain cases.
6. "로그인 진단" reads safe network counters, proxy/direct status and last failed HTTP status for the current profile.
7. Existing cache-only "로그인 복구" remains cookie-preserving; repeat activation is disabled until completion.
8. CDP instrumentation is deferred during sign-in/identity provider pages, and can attach after navigation to a normal page.
9. The default supervised ChatGPT macro instructs the assistant not to run Actions or generate EXE/APK/install ZIP until the operator requests live acceptance.

## Important limitation
An HTML response where JSON is expected can have multiple causes. These compatibility changes are hypotheses, not proof of a login fix. Do not bypass official authentication or claim that protected sign-in succeeds. A real Windows login test is still required.

## Status and next gate
Source patch committed: YES.
Windows typecheck/tests: NOT RUN under strict Action Economy.
Windows EXE/artifacts: NOT GENERATED.
Authenticated browser and supervisor acceptance: NOT VERIFIED.
