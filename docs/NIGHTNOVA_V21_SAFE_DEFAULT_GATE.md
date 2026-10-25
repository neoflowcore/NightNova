# NightNova v2.1 safe acceptance batch — 2026-10-26

## Source changes
- Default newly configured ChatGPT supervision to read-only, not live Send.
- On NightNova restart, restore historical intervals and prompts but NEVER restore live-send consent: read-only must be explicitly disabled again.
- Track and display virtual eligible-send decisions in read-only mode independently of actual Send attempts. Deduplicate repeated readiness observations of the same unchanged response.
- Route keyboard interaction from NightNova's toolbar and native renderer UI to the same main-process operator activity guard used by Chromium webviews.
- Preserve 8-second operator activity grace when determining live sends.
- Add isolated default and no-send predicate tests.

## Explicit acceptance limitation
No TypeScript check, Vitest, Windows NSIS, GitHub Actions or EXE run in this development batch. Code changes are SOURCE ONLY. No actual authenticated browser login or completion claim.

## Manual hands-on acceptance after the operator explicitly requests an EXE
1. Run the manual-only Windows workflow once; require typecheck/focused test PASS, NSIS artifact, SHA256 match.
2. In NightNova, visit chatgpt.com. Sign in through the official page (Google/Apple/Microsoft optional). Never bypass challenges. On the earlier HTML-instead-of-JSON failure, inspect sanitized Login Diagnostics, try cache-only recovery once, log the status and host without recording tokens.
3. Open a completed test conversation. Configure a 15-second idle resume interval and a 5-second check interval, keep read-only ON (default). Start watching and verify eligible-send count increases once but zero actual messages or draft edits occur.
4. Pause, deliberately disable read-only mode and confirm visible live-send warning; start on a harmless disposable chat, observe a single Send only when idle and assistant complete.
5. While the user types in webview or NightNova UI, confirm no live Send during the 8-second grace period. Confirm rotation respects interaction.
6. Pause/stop from the panel and from Alt+Shift+X. Start two conversations and verify per-tab independent counters and completion. Restart app and confirm all sessions remain unarmed and read-only restored.
7. Gather PASS/FAIL and diagnostics, batch all defects; only a further explicit installation request may trigger another expensive Windows build.

## Current estimate
Overall v2.1 MVP about 90% development, latest source unverified. Login remains the highest-risk unaccepted gate.
