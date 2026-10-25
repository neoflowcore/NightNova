# NightNova OpenAI Login Recovery - 2026-10-26
Observed in Windows v2.1: auth.openai.com/workspace displays "Unexpected token '<' <!DOCTYPE is not valid JSON".

This diagnostic means an HTML response was parsed as JSON. The exact server-side cause is not yet confirmed. It can arise from a non-JSON challenge or authentication response.

Implementation:
- Restrict Storage Access permission exceptions to HTTPS official OpenAI origin pairs; do not grant camera/microphone/general permissions.
- Add an in-browser Login Recovery button on official OpenAI tabs. Clears only the active profile HTTP cache, preserves all cookies, and returns to the ordinary ChatGPT login entry point. No login token migration.
- Add focused allowlist and sanitized response-classification tests. Never persist URLs with query strings or credentials.
- This is a hypothesis-based compatibility fix, NOT a guaranteed login success. A real Windows sign-in test must pass to close the blocker.
- Do not attempt to circumvent bot protection or disable authentication requirements.
