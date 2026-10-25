# NightNova v2.1 / Windows build gate, 2026-10-25

## Confirmed failure
Workflow 40187532825 failed before package creation. The Windows log reports TypeScript TS2367 at src/main/chatgpt-watch/service.ts:209. The narrowed status comparison has been replaced with the epoch check that is valid across awaits.

## Final batch
- Prevent a concurrently pending start from arming after Stop/Pause by relying on session epochs.
- Pause/stop all supervisors concurrently: invalidate each timer before awaiting persistence, including queued multi-tab starts.
- A separate per-tab settings selector avoids changing the watched browser tab while configuring it.
- Align remaining visible NightNova product labels and installer ancillary scripts.
- Keep authentication, payments and re-login behind a human gate.
- Run one Actions Windows packaging job only on a workflow-file revision, not on arbitrary commits.

## Acceptance ledger
Source update: committed.
Static typecheck: unverified until workflow runs.
Focused unit tests: unverified until workflow runs.
NSIS installer and SHA256 manifest: unverified until generated.
Real authenticated ChatGPT tab supervision: unverified until manual Windows execution.

## Budget
Single Windows runner, no matrix, no periodic builds, artifact retention 1 day. Do not automatically rerun failed workflows.
