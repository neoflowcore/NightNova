# NightNova 2026-10-27 unattended WATCH — Source change ledger

## Motivation
Prior real Windows installation passed GitHub Actions and ChatGPT login, but ChatGPT copy and the Watch Start user flow were reported broken. Clipboard write/scoped copy and sticky Start errors were added in previous source commit 5e599a1, NOT yet tested in a Windows installer.

## Current source-only batch
- Add configurable maximum supervision duration, default 28,800 seconds (8 hours), 60..604800s bounded; accepts seconds/minutes/hours/days. A deadline independently stops supervision even if the browser stalls or the foreground app is idle. No background agent is promised beyond the running app.
- Show remaining runtime in HUD; display actionable 'starting / inspecting' progress.
- Allow read-only supervision with unfamiliar ChatGPT Work DOM, without authorizing any Send when the last role or message counts cannot be established. Live Send remains fail closed.
- Recognize both data-message-author-role and conversation-turn-* role-bearing DOM wrappers for inspection, reporting how the role was detected.
- Add focused runtime limit and unfamiliar DOM policy tests.

## Not done
Latest TypeScript and focused tests NOT executed. No automatic GitHub Actions, EXE, APK, ZIP or CI packaging. No live overnight acceptance; actual work depends on ChatGPT being logged in, UI structure, an awake host, app foreground tab, and user-provided approval for live sending. Do not mark untested paths as PASS.

## Next explicitly requested Windows acceptance
1. Run the manual-only Windows workflow once on current main and verify TypeScript, focused tests, NSIS setup and SHA256 manifest.
2. Install, log into chatgpt.com, test copy without granting clipboard read.
3. Open LOOKMIRROR chat, open ChatGPT 감독, 설정 준비, leave 모의실행 ON, set resume 15s, check 5s and run 2 minutes. Verify watched count >=1, roles and status appear, actual sends=0.
4. If no unsafe errors, pause, set maximum run duration 8h, resume 15m, check 30s and maximum 12 sends. Explicitly disable read-only for one test chat, verify one send first, then arm for overnight with NightNova visible, no host sleep.
5. Check stop-on-login, payment, permission and manual verification; emergency Alt+Shift+X; run deadline; restart always unarmed/read-only.
6. Record actual PASS/FAIL; batch fixes; do not repeat Windows build until another explicit hands-on request.
