# NightNova v2.1 — explicit terminal signal / URL guard

Date: 2026-10-25. Source-only branch, not included in the last Windows installer.

- A standalone final-line `[[NIGHTNOVA:COMPLETE]]` marker indicates that the supervised conversation reports all work finished. The model's assertion is **not independent evidence** of completion.
- Automatic resume remains bounded by session, last-message role, manual draft, count and payment approval gates.
- Both asynchronous draft preparation and synchronous click reject navigation away from the armed ChatGPT conversation URL.
- DOM script execution is bounded by the existing 15-second deadline; ambiguous outcomes do not resend.
- The operator HUD shows completed sessions separately from watched or needs-human sessions.
- No full regression, hosted Windows build, or authenticated end-user UI acceptance executed for this branch.

Acceptance: review source; run TypeScript and focused Vitest before merging; build once only if this branch is accepted as the final functional candidate.
