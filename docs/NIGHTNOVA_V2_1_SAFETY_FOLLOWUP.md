# NightNova v2.1 — follow-up safety integration (2026-10-25)

Source branch: feat/thinking-macro-v21-safety-observability.

- Split asynchronous ChatGPT editor insertion from a last-moment synchronous click gate.
- Require a confidently identified latest assistant message before resuming; unknown DOM role stops automatically.
- Allow each tab's settings to be prepared before arming supervision.
- Reject invalid automatic-message count rather than silently clamping the value.
- Keep independent timers, operator-visible decisions, payment stops, resume on visible tab, and no automatic restart.
- Existing compatibility keys such as window.rev and upstream attribution are retained deliberately.

**Important:** The changes here are SOURCE ONLY. Typecheck, Windows installer generation and live authenticated UI acceptance are NOT yet complete. No Actions run was dispatched in this batch. Windows x64 packaging is a one-shot release gate after code integration.
