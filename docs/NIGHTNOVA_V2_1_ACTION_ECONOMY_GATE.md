# NightNova v2.1 Action Economy batch — 2026-10-25

Source follow-up after failed Windows gate `40160487073`.

## Confirmed blocker
- Windows TypeScript check failed with TS2367 in `src/main/chatgpt-watch/policy.ts:116` after successful dependency installation. Redundant comparison removed.
- The earlier workflow failed before unit tests or packaging; it produced no installer.

## Improvements in this batched change
- Recognize regular and nested project ChatGPT conversation URLs with one strict host/protocol validator shared by main and renderer.
- Reject unknown last-message roles; never send based solely on historical assistant counts.
- Release watcher slots when their Electron webContents are destroyed.
- Ignore stale Start requests if Pause/Stop or another Start changes the epoch while DOM inspection awaits.
- Respect Pause/Stop after asynchronous persistence, and avoid reviving supervision after a send completes.
- Bound DOM reads with a 15-second timeout to prevent an indefinitely blocked inspection.
- Add the explicitly requested **지금 판단** command. It uses the existing idle/cap/permission policy rather than bypassing safety rules.
- Add a visible **종료** control per tab and last check/progress timestamps.
- Add focused tests for project URL recognition and timer conversions.

## Gate and provenance
- No repeat workflows or Windows builds are triggered by this source-only commit.
- The installed Windows artifact has **not** been generated for this revision. The existing older successful workflow artifact is not a v2.1 acceptance.
- Live authenticated browser operation, long-duration stability, Windows packaging and end-user acceptance remain unverified.
- Preserve the upstream MIT notices and internal compatibility names.
