# NightNova v2.1 — Supervisor operator-safety batch (2026-10-26)

## Source changes
- Main process records physical operator key/mouse activity from Chromium webview input events. No keys, text, coordinates, cookies or messages are recorded.
- Send remains disabled for eight seconds after operator activity. A visible tab alone is not send permission.
- Initialize each supervisor slot exactly once; concurrent configure/start waits for its existing initialization promise. Stop/pause invalidates pending settings restoration.
- "Pause all" does not change already completed, paused, stopped or human-review sessions.
- Read-only pure-function tests added for the input grace boundary, invalid times and operator override.

## Action Economy
- The Windows workflow stays workflow_dispatch-only.
- This batch does not trigger GitHub Actions, package EXE/ZIP or claim live login success.
- Focused tests are authored but have not been run against the newest source; a future explicitly requested Windows acceptance gate must execute TypeScript and focused tests once.

## Hands-on acceptance once operator requests installer
1. Explicitly request Windows EXE build and keep the successful previous candidate until SHA256 and installer integrity pass.
2. Launch on Windows, open https://chatgpt.com, sign in normally, and confirm conversation list. If login fails, read sanitized "로그인 진단", note host/status, and use cache-only "로그인 복구" once. Never export cookies or tokens.
3. On one logged-in conversation, inspect the DOM, arm watch and choose a 15s resumed-idle interval and 5s check interval. Ensure new user messages and active generation are never duplicated.
4. Start two conversations. Move focus and type/click in one tab. Verify no automated Send during the 8-second input grace; verify rotation yields to interaction.
5. Verify "모두 일시정지" leaves completed sessions marked completed, and Alt+Shift+X stops active sessions even inside a webview.
6. Restart NightNova, verify no automation starts without explicit operator approval. Confirm completion signal, payment gate, and last-run diagnostic export.
7. Collect all failures and fix in a batched follow-up, avoid repeated CI.

## Completion accounting
Implementation is source-only. No new Windows integration check, hosted tests or authenticated real-browser verification occurred; production acceptance is NOT 100%.
