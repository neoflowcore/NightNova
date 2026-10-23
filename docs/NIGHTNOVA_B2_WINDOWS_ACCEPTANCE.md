# Nightnova B2 — Windows-first acceptance and action economy

This is an engineering checklist, not an assertion that the executable has passed.

## Source status
- Current B2 batch includes a main-process run coordinator, automatic read-only checkpoint hydration, bounded ACP turns, git-diff evidence gates, a single final validation pass, and a release inventory helper.
- Browser layouts include independently mounted Chromium webviews, a draggable split divider, an AI panel dock and restoration of normal-tab URLs. Ephemeral proxy/incognito tabs must not be restored.
- No GitHub Actions or cloud deployments are required for these functions.
- Official Electron Chromium and app auto-updates remain Phase 2, deliberately outside this MVP.

## One-time local acceptance (Windows x64)
1. Install Git and Node.js on a Windows x64 machine with C++ build prerequisites for native node-pty modules. Confirm supported Electron/Node versions.
2. In a clean clone, run `npm install`; confirm native rebuild completes without shell or DLL errors.
3. Run `npm run dev`. The Nightnova tab bar, 2-way webview split (left/right and top/bottom), bottom-docked AI window, URL navigation, and existing ACP chat should all render.
4. Add two browser tabs, drag the divider, navigate both pages; restart and confirm normal-tab URLs plus ratio/dock persist. Incognito/proxy tabs must not reappear.
5. Open **자동개발**, run **환경 점검**, pick a throwaway Git repo, verify Codex ACP is installed and authenticated.
6. Start with a research-only task and file edits disabled; observe one successful response, logs and checkpoint. Start a separate source-change task only after explicitly enabling workspace editing.
7. Check the resulting Git diff, task evidence state, and one consolidated validation. Failure or an unchanged diff must not silently become a completed coding task.
8. Verify stop, app close during a turn and manual recovery without automatic duplicate execution.
9. Run `npm run typecheck` and `npm run build` once after the feature batch. If all pass, `npm run package:win` creates a local Windows installer.
10. Run `npm run release:manifest` to produce SHA256 metadata, then inspect the NSIS executable on Windows. No build artifact is asserted until the executable actually exists.

## Runtime and safety constraints
- A connected ACP implementation may execute actions without exposing a permission callback. Nightnova's permission policy is not an OS sandbox. Use a disposable workspace/VM for unattended coding and do not work on production or credential-bearing repositories without additional isolation.
- Git push, merge, deployment, and application auto-updates are not performed by the coordinator.
- A source-change task is marked complete only if Git fingerprint differs before vs. after; this is change evidence, not proof of correctness. Human code review and final tests still matter.
- User state is saved in Electron userData/nightnova (not a repository commit). Previous checkpoints are retained as recovery backups; handoff records are capped.
- Normal tab URLs are stored in app localStorage for session restore. Avoid sensitive URLs if local machine privacy is a concern.

## Cost policy
- No default GitHub Actions workflow.
- Only one manual/local consolidated validation run after implementation.
- The optional local `release:prune` command defaults to dry run; `release:prune:apply` deletes older NSIS files in `release/`, retaining 3 newest installers.
- Use a single integration commit per functional milestone. No CI re-run loop or artifact fanout.

## Not yet verified
Windows NSIS build and start, Codex ACP subscription login, local development writes, secure containment and long-hour reliability. These require an actual machine. Do not report them as PASS on the basis of a source commit.
