# NightNova 2026-11-04 — conversation supervision safety batch

## Baseline
- Target: neoflowcore/NightNova, main @ 6d046d995d28c8dcf26d275bf2cbfd2f1ba5fd19.
- Current portable profile and Windows manual-only workflows remain unchanged.
- This is a **source-only** batch. No Windows binary, artifact, GitHub Actions dispatch, or real ChatGPT interactive acceptance is claimed.

## Implementation
1. Prefer chronological ChatGPT turn wrappers for role recognition. Unrecognized final turns must not be interpreted as the last recognized assistant message.
2. Expose a count of unrecognized messages in read-only diagnostic snapshots and operator UI. Live Send is blocked during start, normal policy checks, and final pre-Send verification if any role is unresolved.
3. Recheck visible connection-loss/error toasts inside both the draft preparation and the irreversible click script; offline checks remain independent.
4. Bind conversation sameness to the trusted exact HTTPS origin as well as the path, and reject custom ports, embedded credentials and untrusted hosts.
5. Treat explicit card-detail and bank-transfer instructions as payment approval requests that always require a person.
6. Add focused mock-DOM and decision tests for role ambiguity, disconnect races, unsafe URL and payment wording.

## Acceptance gate
Source gates: `npm run typecheck`; `npx vitest run src/main/chatgpt-watch`. Only perform final source checks once after the functionality batch. Windows acceptance is NOT complete based on a source commit.

### HIGH VISIBILITY — WINDOWS HANDS-ON TEST REQUIRED BEFORE RELEASE
- Use the **manual-only** NightNova Windows Portable workflow if a newer executable is explicitly requested.
- In a Windows x64 machine, launch `NightNova-0.1.8-portable.exe` without installation; check adjacent `NightNova-Data` persistence.
- Log into a real ChatGPT conversation. Confirm user-side Copy works. Open two or three chats and configure independent free-form intervals.
- Start **read-only** supervision; observe reasons, progress, unknown-role warnings, error banners, tab rotation and emergency Alt+Shift+X.
- For authorized live-send tests, use only a disposable conversation; verify exactly one expected send, no duplicate after pause/stop, and no send when role unknown, generating, disconnected, or user draft exists.
- Restart: verify settings restored without unattended execution. No acceptance percentage should be inferred from the above until an operator records results.

## Action Economy
One batched source commit, no automatic Push-triggered workflows. The previous Windows portable binary does **not** contain this source hardening.
