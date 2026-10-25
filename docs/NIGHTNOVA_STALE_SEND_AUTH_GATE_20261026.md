# NightNova — stale command and login navigation hardening

Source-only development batch. No GitHub Actions, Windows EXE or installation artifact generated.

## Implemented
- The two-stage ChatGPT auto-send has a random operation identifier and independent short expiry timestamps. An out-of-date queued browser script is refused.
- After draft preparation, final route, assistant role and actual draft are rechecked. An operation marker stored on the actual editor is required before Send.
- The final Send script rechecks URL, message counts, last assistant text, generation state, edited draft, presence of the Send button and expiry. The marker is consumed before one click.
- DOM focused tests cover expired and reused commands, user drafts, absent send button and navigation mismatch.
- Embedded Chromium CDP attachment is single-flight and rejects late attachment results after a navigation, a login route or component unmount.
- The real webContents ID is still surfaced while on an auth page; signing in does not require debugger attachment.

## Remaining acceptance
Latest code is not Windows typechecked, run, packaged or used to authenticate. No claim of OpenAI login success. Source work only.

## Next real-device check, only when operator explicitly requests a build
1. Trigger manual Windows workflow once and require TypeScript / targeted Vitest / NSIS / SHA256 PASS.
2. Install and sign into ChatGPT normally; verify session persistence and no earlier HTML-vs-JSON login error. If needed use sanitized Login Diagnostics and cache-only Login Recovery, never bypass authentication.
3. Open two completed test conversations. Start read-only supervision with 15-second resume and 5-second check; virtual readiness increases but no prompt is sent.
4. On one disposable conversation, explicitly disable read-only while paused and re-arm. Check one-click budget, manual draft protection, long generation handling and the 8-second operator input grace.
5. Pause / Alt+Shift+X emergency stop during preparation, tab switching and queued send; confirm there is no stale click after the operator stops.
6. Toggle between sign-in routes and normal conversation routes; check that login remains interactable, a visible tab is recognized, and no debugger remains attached to authentication pages.
7. Restart NightNova and confirm saved settings but no auto-arming or implicit live-Send consent. Capture defects together for the next approved source batch.
