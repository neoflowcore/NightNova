# NightNova B3 — Runtime, privacy and operator tooling

Implemented in this batch:
- Nightnova identity on Electron main and renderer; isolated userData directory by default (no implicit migration of Rever cookies).
- Native OS credential protection kept instead of forcing mock keychain/basic password store.
- Developer worktree Git review (status, branch, diff preview capped at 48KiB).
- Local JSON task-queue import/export through native file dialogs with validation and bounded size.
- Explicit Longshot-10 task bundle through the existing queue, no commit/push/CI per task.
- Agent tool-call status and per-run counts in main-owned progress snapshot.
- Fail-closed completion: a source change without an explicit NIGHTNOVA_RESULT: done is review-required, not falsely completed.
- Source integration with preload IPC and workbench controls.

## Action Economy
One consolidated main commit; no Actions, deployments, or APK artifacts. Full build / Windows packaging and Codex login still require local verification. Existing project completeness estimate is provisional and not a test pass.

## Safety and operator gates
Keep permission default read-only; file writes require explicit workspace edit permission. ACP tool permission callbacks are not a sandbox, and autonomous agents may use tools that do not ask the application. Run unattended development in a disposable isolated workspace.

Before release:
1. On Windows x64 install dependencies and run one consolidated typecheck/build/test.
2. Confirm Chromium page navigation and both split orientations.
3. Confirm Codex ACP executable and authenticated subscription session.
4. Confirm 10-task queue progress, deadline stop, restart recovery, and Git diff review.
5. Verify installer NSIS locally and generate SHA256 manifest.
