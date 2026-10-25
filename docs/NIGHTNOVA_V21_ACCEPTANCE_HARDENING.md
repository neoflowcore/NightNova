# NightNova v2.1 - acceptance hardening batch (2026-10-25)

Base: 953ab77, the first Windows NSIS build with typecheck and 33 focused tests passing. The **base installer** is verified as a GitHub Actions artifact, but live authenticated browser operation is not verified.

## Implemented in this batch
- Supervisor header shows total registered, watching, and human-review sessions.
- Per-tab idle countdown and progress indicator (strictly read-only; time reaching zero does not force a Send).
- Tab View and Settings Select actions independent of the current browser focus.
- Clearly surfaced top-level emergency stop button while any watch is armed.
- Copy non-sensitive diagnostics (status, timestamps, decision reason, count, capped logs) without page text/cookies.
- Cancel queued/initializing starts with a hub epoch on pause/stop and reject late initialization from re-arming.
- Displayed user branding NightNova in browser toolbar.
- Focused tests for countdowns and large-duration formatting.

## Acceptance limitations
No new Windows artifact, full regression or actual authenticated ChatGPT test is included in this source batch. The older Windows installer does **not** contain these changes. Do not report 100% functional acceptance until a new build passes and an operator observes actual Send/Stop behavior.
