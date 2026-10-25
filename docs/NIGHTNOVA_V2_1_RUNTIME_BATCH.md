# NightNova v2.1 — thinking macro runtime batch

**Date:** 2026-10-25. **Status:** source implementation only; Windows installer and live browser acceptance NOT VERIFIED.

## Basis
- Earlier foundational master design v1.3 (2026-10-23), followed by the user-confirmed v2.1 decisions (2026-10-24).
- The original v2.1 downloadable MD/ZIP was not mounted in this execution; exact byte-for-byte comparison has not been claimed.
- User-visible, interruptible automation must act in the actual browser tab; independent project monitors observe -> decide -> act -> confirm.
- Free numeric time amount + seconds/minutes/hours/days unit, with task-specific validation limits.

## Implemented
1. Input time conversion supports days, fractions representing whole seconds, and rejects fractional seconds.
2. DOM observer reports latest message role; pending user messages cannot trigger auto-resume.
3. Manual chat message changes also set the awaiting-response state.
4. Active reasoning is distinct from idle completion, with a conservative stall threshold (max 30 min / 3x resume interval).
5. Session epoch invalidates stale asynchronous checks after pause/stop; an already-clicked send is logged but not recalled.
6. UI shows each monitored tab's decision reason, last message role, generation status and unsent drafts.
7. Explicit payment requests always stop for human approval, including legacy unchecked payment configuration.
8. Align About/product/installer visible casing to NightNova. Preserve internal compatibility identifiers, historic attribution and legacy installer patterns.
9. Added targeted policy and time conversion test cases.

## Deferred and unverified
- No transaction or ticket-booking automation. Any future final purchase requires explicit user authorization.
- No Windows build, NSIS output, authenticated ChatGPT prompt submission, source-level TypeScript verification or full regression was executed in this batch.
- No GitHub Actions workflow edits, dispatches, CI or new Windows artifacts.
- If pauses race with an already-running renderer script, it cannot undo a click already initiated. Browser-level synchronous abort is a future hardening item.

## Single acceptance gate (Windows x64, not yet executed)
1. Locked dependencies; one TypeScript check and focused Vitest run.
2. One NSIS package + SHA256 manifest; verify visible app name and executable.
3. Two authenticated conversations, visible tab rotation, independent 15s/30m/60m/1d settings.
4. Observe long generating reply and unanswered manual message; ensure zero duplicate sends.
5. Pause or stop during DOM inspection; inspect draft protection, login challenge and payment gate.
6. Confirm one intended send, receipt in DOM, and no restart resend.
7. Restart: settings load, automation stays paused; inspect audit logs.
8. Record pass/fail separately for source, Windows installer, real browser and MVP.

**Action Economy:** a single source commit in an isolated branch; no repeated hosted CI.
