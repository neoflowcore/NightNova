NightNova latest source acceptance gate (2026-10-26)

Windows run 40270761912 failed TS2769/TS2339/TS7053 in src/main/auth-support.test.ts. Fix already merged to main a33d36f; independent TS 5.8.3 compilation of matching typed-reduce snippet passed locally, NOT a full repository typecheck.

Additional source improvements:
- Single-flight ChatGPT supervisor start blocks duplicate Start from arming twice while DOM inspection is pending.
- Login recovery binds navigation to original tab after awaited cache clearance; never navigates whichever tab became active later.
- Auth diagnosis update is ignored if active tab changed before async result.
- Show descriptive safe login error category and avoid falsely labeling an unregistered conversation as live-send enabled.

ACTION ECONOMY: Windows workflow remains workflow_dispatch-only, source push does not build. No new Windows installer created from this code. Earlier EXEs are stale candidates and must NOT be labeled current.

Next acceptance: manually dispatch Windows workflow on latest main, verify TypeScript, focused tests, NSIS, SHA256. Then install Windows x64 and test official ChatGPT login, read-only supervision 15s/5s, live send 1x, user input protection, two-tab rotation, Alt+Shift+X, and restart unarmed.
