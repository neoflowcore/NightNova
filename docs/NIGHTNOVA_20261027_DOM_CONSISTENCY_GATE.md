# NightNova 2026-10-27 — DOM consistency source checkpoint

Source-only changes. No Actions/EXE/ZIP generated.

Root cause addressed: inspection recognized conversation-turn-* messages but the two-stage Send scripts verified only data-message-author-role. Now all three stages share the same role and message selection logic, and the final irreversible click checks that the selector family did not change. Added focused tests for Work-style turn wrappers and selector-family changes. Human gate no longer rewrites stopped/paused sessions.

Important: This is NOT a tested installer. Real ChatGPT Work DOM structures may differ. The app must refuse sending when role/counts cannot be verified. Existing official ChatGPT login, clipboard permission, and night-run summary changes are present in main but not yet acceptance-tested as a combined Windows installer.

Next explicit real Windows acceptance: run one manual Actions workflow on main, require TypeScript and focused tests PASS, NSIS and artifact PASS, then install and test clipboard copy; ChatGPT watch read-only mode at 15s/5s; Work page message role counts; live Send on a disposable chat only; multiple tabs; pause/stop; eight-hour session deadline; restart unarmed; complete marker. Collect failures before another build. No external service purchases.
