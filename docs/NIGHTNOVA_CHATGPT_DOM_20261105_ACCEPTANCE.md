# NightNova — ChatGPT conversation DOM drift, 2026-11-05

## Live operator report / evidence
- Windows portable NightNova launches, Chrome-webview ChatGPT is logged in, an existing project conversation visibly renders completed user and assistant messages.
- ChatGPT Watch > "설정 준비" succeeds, and "상태 확인" returns **roleSource=unknown, assistantCount=0, userCount=0**, despite the visible transcript.
- The screenshot alone does not establish the exact site DOM selectors. Do not claim successful automatic Send.

## Root cause / supported hypothesis
- Existing NightNova inspector recognizes only `[data-testid^=conversation-turn-]` and `[data-message-author-role]`.
- A current ChatGPT app-shell variant has been independently reported with *both* selectors returning 0 despite loaded text content. Other recent third-party reports show semantic content markers `[data-markdown-text-style="assistant-message"]` and `[data-user-message-bubble="true"]`.
- Neither class names nor inferred turn positions are sufficient authorization for sending a message. Virtualized conversation DOMs can mount only part of the history.

## Source hardening batch
1. Observe explicit role markers across `data-testid`, `data-test-id`, `data-turn-key`, and explicitly named author/role attributes when they exist.
2. Add **semantic-content** observation-only fallback, reading current visible user/assistant content blocks without treating them as verified, complete turns.
3. Add a tiny `selectorProbe` diagnostics object to the transient panel snapshot: counters + app-shell-present flag **only**, no message text, URL, cookies, user IDs, or account details.
4. Gate all live-send paths: policy (needs-human), start (error), preflight and click (deny), main send handler (deny) when roleSource is semantic-only or unknown.
5. Add DOM mock tests and policy checks that prove a new app-shell can yield read-only observations without a Send click.

## Hands-on acceptance instructions (NO LIVE SEND YET)
- Load the *new* Windows portable EXE built from the corrected commit. Do not delete the adjacent `NightNova-Data` profile directory.
- Reopen the same ChatGPT conversation. In ChatGPT 감독, keep **모의실행 ON**, select tab, press **상태 확인**.
- Expected on a semantic-content variant: `semantic-content` plus nonzero visible content counters, warning that live-send is forbidden. Counts are visible DOM blocks, **not the total number of messages**.
- Expand **DOM 판독 진단**; copy sanitized counts if the panel still says unknown. With no markers, fail safely and record the counts for a follow-up targeted adapter, not an arbitrary selector guess.
- Do not check actual automatic submission until role-boundary selectors are verified on the real variant and pass a separate live-send gate.
- Future GitHub/third-party permission `Allow` prompts must require operator approval; do not automate OAuth consent or changes of scope.
