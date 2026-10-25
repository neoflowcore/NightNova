# NightNova v2.1 RC — Windows first acceptance (2026-10-25)

## Status
Implementation candidate; **NOT Windows accepted** until the one-shot Actions job completes and actual installer artifact exists. Live authenticated ChatGPT tab interaction still requires manual observation.

## Release-candidate bundle
- A global emergency STOP button visible even outside the ChatGPT supervisor panel.
- Preserve manual Pause/Stop state through an in-flight ChatGPT send receipt check.
- Verify a newly sent message by read-only DOM observation up to three times, never re-click Send.
- Gate automatic sends to the real visible, non-minimized app window.
- Show sent/attempted counts, per-tab control, direct interval input and explicit human gates.
- Windows NSIS product branding uses NightNova with a matching one-day artifact.

## Action economy
Exactly one functional integration commit triggers the Windows hosted build through the workflow-file path. No scheduled builds, no matrix jobs and no Vercel deployment. Do not rerun automatically on a failure.

## Acceptance
1. TypeScript check PASS, focused NightNova tests PASS, Electron/NSIS build PASS.
2. SHA256 manifest generated, artifact available for download.
3. On Windows: install, launch, open signed-in ChatGPT conversations, configure 15 seconds/30 minutes/60 minutes, observe actual visible tab and any handoff.
4. Verify emergency stop, draft preservation, duplicate suppression and payment gate.
5. Mark MVP 100% only after actual interactive inspection.

## Traceability
- Previous workflow 40160487073 failed TS2367 in policy.ts before packaging.
- Next candidate includes that source fix from commit 22f18f7, plus this integration.
