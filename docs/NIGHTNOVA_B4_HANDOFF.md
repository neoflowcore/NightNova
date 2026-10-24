# NightNova B4 runtime batch

- Per-turn ACP execution timeout (5-180 minutes), with AbortSignal-backed cancellation.
- Pause after current turn (no next turn); fail-stop or continue-after-error mode.
- Manual task edit, clone, skip and completed-task pruning; read-only state recovery remains the default.
- Tool permission approval/denial counters, current turn start time and UI controls.
- Config bounds retained for both old checkpoint migrations and new runs.
- Explicit caveat: an ACP adapter can execute without invoking permission callbacks. Tool approval is not an OS sandbox.
- Action Economy: one batched Git commit, no Actions workflows/deployments/artifacts.
- Windows installer and actual authenticated ACP execution remain unverified. Execute one consolidated local typecheck/test/build after all features are implemented.
