# NightNova — 2026-10-27 source-only guardrails and acceptance
## Changes
- Distinguish navigator.offline from ChatGPT's visible disconnected/network-error banners. Live automatic Send stops and requests the operator when either fails. Read-only mode continues observing, never sends.
- Immediately before preparing/sending, require connectionProblem=false and online=true.
- Sanitize restored last-run summaries by rejecting negative counts and sentCount greater than attemptCount.
- Add decision and state validation tests for disconnection and corrupted summaries.
## Remaining acceptance
- Source changes only, no installer generated or Actions triggered. No Windows integration/typecheck/real-browser results claimed for latest source.
- On next explicitly requested Windows installer: run manual-only Actions, require TypeScript/focused tests/NSIS/sha256; install and test ChatGPT clipboard copy, conversation role inspector, 2-minute read-only supervision, live Send only in disposable conversation, disconnected-toast blocking, pause/Alt+Shift+X, 8-hour deadline and restart-safe last-run summary.
- GitHub Actions budget: normal main push must never build; no repeated installer artifacts outside user-requested real-device check.
