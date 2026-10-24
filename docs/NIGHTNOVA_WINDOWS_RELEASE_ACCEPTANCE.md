# NightNova Windows Release — First runnable acceptance

This document separates a successful source commit from a verified Windows installer.

## One-shot Windows packaging
The workflow `.github/workflows/nightnova-windows-once.yml` runs on the first commit adding/changing *that workflow file* on `main`. It will not rerun on ordinary future source commits. It also supports a manual `workflow_dispatch` rerun if explicitly desired.

- Hosted runner: `windows-2022`, one job, maximum 25 minutes.
- Installs dependency tree once; no multiple CI matrices or nightly triggers.
- Runs TypeScript check, focused NightNova unit tests, then one Electron build and NSIS Windows x64 package.
- Uploads only the NSIS `.exe` and SHA256 manifest; artifact retention 1 day.
- No automatic Git commit, push, deployment or cloud runtime provisioning.
- The installer is unsigned and may trigger Windows SmartScreen. Do not disable security protections to run it.

## Local Windows setup
In PowerShell from the cloned repository:

```powershell
node --version
git --version
npm install --no-audit --no-fund
npm run typecheck
npx vitest run src/main/nightnova
npm run package:win
npm run release:manifest
```

If the hosted job cannot run because billing/actions are disabled, use this local route. Do not claim a release was built until `release/Nightnova-*-setup.exe` exists and has a checksum.

## End-to-end manual UI / Codex acceptance
1. Install and open NightNova on a Windows x64 test PC.
2. Open two normal web tabs, toggle left-right and top-bottom split, drag the divider, navigate both tabs, restart and confirm ratio restored.
3. Dock the agent panel on the right and bottom; open **자동개발**, select a throwaway Git repository.
4. Run **환경 점검**, install `codex-acp` locally if missing, authenticate Codex via its supported login, and confirm the real ACP session handshake.
5. Start a read-only task with a realistic deadline. Verify agent response, permissions, and checkpoint. Code-changing tasks need explicit workspace permission.
6. Start a small code-changing task on a throwaway repo, inspect actual Git changes and verify no automatic commit/push.
7. Test manual stop, stop after current task, explicit resume and 5-minute deadline gate. Inspect the handoff Markdown.
8. If any step fails, attach error logs/screenshot; this is an acceptance failure, not 100% complete.

## Cost controls
This project has a strict Action Economy budget. Only one short hosted Windows job is defined. There is no workflow for every push, no matrix, and no background scheduled builds. Artifacts expire after one day. Re-run only when explicitly requested. 
