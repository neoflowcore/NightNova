# NightNova v2.1 input-safe operator acceptance (2026-10-25)

## Completed source batch
- Tab rotation is delayed during recent input, without disabling per-conversation read-only supervision.
- Main-process Alt+Shift+X emergency stop reaches the operator from within a Chromium webview.
- A new preload event reports only *whether* the operator used the keyboard or mouse, never the keys or page text.
- Corrected per-tab prompt draft editing to store the chosen settingsTab, rather than the active webContentsId.
- Focused DOM script tests cover prepare vs commit, navigation changes, generation, draft conflict and script escaping.
- One Windows Actions workflow job will typecheck, run targeted tests, package NSIS, SHA256, and upload installer.

## Important: verified vs unverified
- Previous build 40194818772 (commit 34db3a0): PASS, SHA256-verifiable installer exists.
- This source bundle: status awaits one Windows gate and end-user interactive acceptance.
- ChatGPT site selectors can change. Mock DOM checks are not equivalent to a real authenticated ChatGPT tab.
- Full browser booking or payment handling is out of v2.1 MVP scope and always requires human approval.
- Action Economy: one functional integration and one Windows packaging gate, no parallel matrix or loops.

## Manual acceptance steps
Open a subscribed ChatGPT account in NightNova, start supervision for two conversations, verify no duplicate messages while generating and while a draft exists, type in a tab to ensure rotation yields, use Alt+Shift+X to stop instantly, and confirm stop survives reboot.
