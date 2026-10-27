# NightNova — 2026-10-27 LOOKMIRROR unattended acceptance ledger

Source-only development batch; no Windows Actions or installer was run.
Previous source head 31a7ae7 added bounded night supervision and ChatGPT Work read-only inspection.

New feature: persist last ended session summary only (start/end timestamps, status, actual send count, dry-run-ready count, attempt count, brief reason) without saving user messages, transcript, URL, passwords, tokens or resume prompt in the summary. On restart preserve saved configuration but reset live-Send consent to read-only; show last session result on the dashboard and include it in sanitized diagnostics. Reject invalid or tampered summaries.

Release acceptance (requires explicit real-device test):
1. On a Windows candidate, verify Electron login and ChatGPT first-party copy.
2. Click ChatGPT 감독, 설정 준비, select LOOKMIRROR conversation, choose read-only, resume 15 seconds, check 5 seconds, deadline 2 minutes. Click 시작. Verify watching count 1, no actual Send and visible reason.
3. Stop and relaunch. Confirm no automatic arming or live-Send permission; last run summary appears with duration and counters.
4. After this safe pass, configure overnight limit 8 hours, idle 15 minutes, checking 30 seconds, max 12 sends; explicitly approve live Send on disposable chat before any unattended run.
5. Confirm incomplete response, user draft, authentication challenge, offline, Windows sleep and hidden browser block auto send; Alt+Shift+X immediately cancels and logged completion is truthful.
6. GitHub workflow must remain manual-only. Only the operator's explicit request for EXE triggers a one-shot Windows build after consolidation.

Status: all files source-updated; integration typecheck, packaged installer and live overnight reliability NOT verified. No 100% acceptance.
