# NightNova source integration checkpoint — 2026-10-26

## Implemented (not yet Windows-accepted)
- Resolve the actual selected OpenAI webview's Electron.Session through its webContents ID for login diagnosis and cache-only recovery; do not touch shared or another profile by guessing a tab string.
- Validate renderer ownership, genuine webview ID, and official HTTPS OpenAI URL on both login IPC paths.
- Prevent outdated asynchronous login diagnosis from updating a different tab; prevent cache-recovery navigation of a different webview.
- Track mouse-down in the native NightNova renderer, alongside existing embedded webview keyboard/mouse detection.
- Withdraw active auto-Send eligibility when the browser changes to an external browsing mode or no webview is visible.
- Emergency pause-all, stop-all, individual pause and stop authorize sender synchronously, then invalidate running sessions without waiting on disk-loading initialization.
- Auto-resume preparation and commit fail closed when a login/challenge appears or the browser goes offline.
- Add targeted DOM cases for login during preparation, login after preparation, offline before click.

## Budget gates
Normal pushes to main do NOT start Windows Actions. No new EXE/ZIP or artifact in this source batch.
Focused tests authored but not executed through Windows CI; the current source is NOT a verified installer.

## Next user-requested hands-on acceptance
1. Dispatch NightNova Windows Manual Acceptance exactly once on newest main. Require TypeScript, focused Vitest, Windows NSIS, SHA256 manifest and artifact upload to succeed.
2. Install, open chatgpt.com, complete normal login, and confirm conversation pages. On HTML/JSON mismatch use sanitized Login Diagnostics and cache-only recovery; verify active profile remains independent.
3. Start with read-only supervisor 15-second resume / 5-second check. Confirm decisions but no outgoing messages.
4. On disposable conversation explicitly enable live Send, confirm one click only, then exercise manual draft, offline, login challenge, tab switching, typing and eight-second operator grace.
5. Run two tabs, pause/stop during pending start, Alt+Shift+X emergency stop and app restart. Confirm read-only default and no re-arming.
6. Log PASS/FAIL, batch fixes. Do not declare 100% until successful Windows installation and live authenticated test.

No claim of runtime success or 30-minute elapsed work.
