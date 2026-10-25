# NightNova

**NightNova** is a local, personal Chromium/Electron AI development browser for Windows-first workflows.

> Status: thinking-macro v2.1 safety source batch. Windows installer, live ChatGPT supervision and Codex ACP have **not** been verified. Source integration is not a release.

## Included

- Existing Rever Browser Chromium webviews and ACP agent infrastructure (upstream 0.1.6).
- **Autonomous development workbench:** choose a local Git repository, enqueue up to 40 tasks, use Codex/Claude ACP, inspect turn logs, pause and resume from checkpoints.
- Main-process **absolute deadline gates**: no new turns at T-5m, cancel at T-30s, process kill at T-25s, write handoff to userData on finish.
- **Action Economy:** no app-generated Git commits/pushes/merges/deployments or background GitHub Actions; optional single end-of-run validation.
- **Browser split layout:** one, two side-by-side, or two stacked embedded tabs with draggable divider; optional bottom-docked AI panel.
- Local checkpoint and Markdown handoff artifacts; restricted tool auto-approval and read-only default.

## B2 improvements

- Auto-restore persisted task queue on startup, without automatically launching agents; interrupted turns require explicit review.
- Streamed Git worktree fingerprint before/after each coding turn, bounded retries and review status on interrupted turns.
- Environment doctor, presets, bulk queue, result evidence and local handoff controls in the workbench.
- Local project-aware single final validation; Git diff check and optional typecheck/test/build, with cancellation.
- Normal browser tab and split-ratio restoration; ephemeral/proxy tabs intentionally excluded.
- Offline Windows release manifest with SHA256; optional local NSIS retention dry-run.

See [B2 Windows acceptance checklist](docs/NIGHTNOVA_B2_WINDOWS_ACCEPTANCE.md). Live ACP and Windows installer verification remain outstanding.

## Start locally

1. Install supported Node.js, npm, Git and a Codex ACP executable; authenticate the CLI on the machine.
2. Install Bun, then run `bun ci` (uses the committed `bun.lock`; Electron and native node-pty rebuild require the desktop build toolchain).
3. `npm run dev`, then open the **자동개발** panel.
4. Choose a **Git repository root**, set a future deadline at least 5 minutes away, add a bounded task, explicitly enable workspace editing if needed, then press Start.
5. Inspect the local working tree and validation before using `npm run package:win` on a Windows x64 system.

Your local Codex subscription may have rate/usage limits. NightNova does not bypass those limits.

## Important

An ACP agent may have tools that do not request permission; therefore the approval filter is not an OS sandbox. Do not run unattended development against sensitive workspaces. Use a disposable repository and review the final Git diff. Chrome browser updates are not Electron Chromium updates.

## Repository provenance

- Upstream: [Rever Browser](https://github.com/greekr4/rever-browser) v0.1.6 (`5955503ae5a9d6244d03df141991a7cffd80c029`).
- Keep upstream MIT `LICENSE` and `NOTICE`.
- [B1 implementation and acceptance gates](docs/NIGHTNOVA_B1_IMPLEMENTATION.md).

## GitHub Actions

No CI workflows were enabled during B1. Run a single consolidated local verification after the functional batch. The full Windows packaging acceptance gate remains outstanding.

## Thinking macro v2.1 source batch

Visible ChatGPT supervision now records per-tab decision reasons, supports user-entered seconds/minutes/hours/days, protects unanswered user messages, separates long reasoning from idle detection, invalidates stale inspections on pause/stop, and always escalates payment-related requests. Actual Windows and authenticated ChatGPT browser acceptance are still required. See [v2.1 batch record](docs/NIGHTNOVA_V2_1_RUNTIME_BATCH.md).
