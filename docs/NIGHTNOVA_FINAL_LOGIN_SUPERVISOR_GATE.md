# NightNova login + supervisor safety consolidation, 2026-10-26
Source-only code changes, NOT a verified Windows release.

- OpenAI/ChatGPT and recognized SSO identity-provider webpages are exempt from automatic Chrome DevTools Protocol attachment, including logged-in conversations. ChatGPT supervisor uses narrow Electron webview executeJavaScript and does not require CDP to send.
- User-requested Pause All invalidates pending asynchronous start operations before the first DOM inspection can finish; completed, paused and human-review status remain untouched.
- Added focused official/SSO domain checks to auth-support tests.
- Existing stale queued-send nonce, deadline and one-click protections remain unchanged.
- No automatic Actions run or binary artifact. Manual-only workflow remains in effect.

## One-shot Windows acceptance gate
When operator requests executable: run manual NightNova Windows workflow on latest main; verify TypeScript, focused Vitest, NSIS, SHA256. On Windows launch and sign in to chatgpt.com; verify JSON/HTML auth error is gone, profile persists, tab IDs appear without debugger. Test default read-only 15-second/5-second intervals, zero sending, then explicitly enable live-send in a disposable chat and verify exactly one send, operator input grace, 2-tab rotation, Alt+Shift+X, pause while Start is pending, and restart unarmed. Log each PASS/FAIL. Do not claim login is fixed until actual Windows sign-in succeeds.

Current build status: NOT BUILT. TypeScript/tests: NOT EXECUTED. Login: NOT VERIFIED.
