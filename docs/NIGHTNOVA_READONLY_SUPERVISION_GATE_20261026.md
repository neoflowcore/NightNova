# NightNova v2.1 — Read-only supervision batch (2026-10-26)

Source-only implementation, no Windows builds or installation artifacts.

## Functionality
- Optional independent per-conversation read-only mode: runs polling and idle decision but never calls two-phase draft preparation or Send.
- Explicit state label for read-only monitoring, and operator checkbox locked while supervision is armed.
- Fail-closed Send gating for read-only sessions regardless of current visible tab.
- Focused decision-gating tests; these tests were authored but not run in Windows CI.

## Acceptance checklist for the NEXT explicitly requested Windows installation
1. Run one manual GitHub Actions workflow. Require TypeScript PASS, focused Vitest PASS, NSIS PASS, SHA256 manifest PASS. Do not rerun for cosmetic changes.
2. Log into ChatGPT in visible NightNova Chromium. If OpenAI responds with HTML instead of JSON, record sanitized Login Diagnostics, use cache-only Login Recovery once, and report persistent blockers; never bypass a CAPTCHA or weaken authentication.
3. Open an existing conversation and arm read-only monitoring with 15-second idle / 5-second checks. Verify decisions appear, zero messages are sent, existing drafts are untouched.
4. Pause read-only mode, switch it off, configure a harmless test conversation, arm live supervision and verify one resume only, no duplicate Send while generating or waiting for reply.
5. With two tabs, verify screen rotation defers to operator interaction, input grace, Alt+Shift+X emergency stop, completed state, and restart-safe paused startup.
6. Record PASS/FAIL per case, collect defects into one source batch and trigger a new build only on an explicit real-device acceptance request.

## Validation state
The latest source is not compiled/tested or authenticated on Windows. The prior Windows candidate is not equivalent to this branch.
