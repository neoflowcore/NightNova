# Nightnova B1 — Implementation and operating contract

## Implemented modules
- Main-owned ACP RunCoordinator: bounded queue (40), bounded turns (40), retries (0–2), per-turn checkpoint, user-initiated recovery, no auto-push, no auto-commit.
- Absolute deadline: T-5m prevents new work, T-30s cancels, T-25s kills, main-process handoff. The app blocks shutdown briefly while the coordinator stops and writes its handoff.
- Explicit workspace picker: only a Git repository root, not an arbitrary renderer-provided directory. Read-only default; workspace edit permission is an explicit UI toggle.
- Single final validation: off / light (diff-check + typecheck) / full (typecheck + unit tests + build).
- Read-only Git summary and local Markdown handoff; checkpoint files are outside the repo in Electron userData/nightnova.
- Two-way visual split (horizontal or vertical) with drag-to-resize, secondary tab selector, React state persistence; AI panel can dock on right or bottom.
- Windows NSIS product branding; Windows-safe postinstall and icon generation are separate from CI.

## Important limitations / acceptance gates
1. This is an Electron application using bundled Chromium, not a fresh Chromium engine fork.
2. Local agent CLI must be installed and authenticated on the Windows PC; the app does not provide credentials or bypass subscription limits.
3. ACP permission grants cannot guarantee containment against agent-side actions that do not request permission. For high-trust unattended coding use a disposable workspace/VM and inspect the working tree.
4. Shell commands requested by an ACP agent are not automatically approved except tightly restricted read-only inspection. Agents that require unrestricted shell tooling may fail; this is intentional.
5. A completed ACP turn means the agent responded; it does not prove the task's code was implemented. Inspect the Git diff and final validation.
6. Splitting external Chrome screencast mode is not supported; split controls target the embedded Chromium webviews.
7. Windows NSIS packaging is defined but is not evidence that an installer has been built or tested on Windows.
8. Electron/Chromium runtime auto-updates and application auto-updates are Phase 2, not B1.
9. Upstream 11 binary assets are not present in the source-only import. Icon generation is run before packaging; separately audit any missing non-icon runtime resources.
10. GitHub Actions remain disabled and no new workflow is introduced.

## Manual Windows acceptance
1. Install Node and dependencies with the repository's chosen package manager; inspect postinstall native module handling.
2. Run typecheck; perform one local build; exercise Windows NSIS package creation.
3. Confirm Codex ACP executable, interactive login, prompt and cancel on a throwaway repository.
4. Exercise 2 webview tabs, both split directions and resize, tab close/switch, restart layout restore, right/bottom dock and existing chat.
5. Confirm deadline and checkpoint behavior on a harmless task with a deadline at least 5 minutes out.
6. Inspect the final Git diff, handoff file, and logs; only then approve release.

## Action Economy
Single integrated functionality batch; no GitHub Actions, workflows, artifact uploads, auto-commits, deployment or repeated full CI.
