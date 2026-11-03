# NightNova login recovery — Windows portable / Google SSO (2026-11-04)

## Report
An operator launched the NightNova standalone Windows x64 EXE and selected Google login for OpenAI. Windows Security displayed a USB security key / passkey request for google.com and identified the app as an unverified executable from an AppData\\Local\\Temp\\...\\NightNova.exe runtime path.

### Diagnosis
- The Windows Security prompt is an operating-system-mediated authentication request initiated by the identity provider, not a NightNova installer. A Google account may preferentially request passkeys or require a security key depending on account policy.
- Electron-builder **portable** EXEs unpack to an ephemeral Temp location at runtime. NightNova's profile is deliberately anchored beside the original EXE as `NightNova-Data` via `PORTABLE_EXECUTABLE_DIR`. The warning is not proof of malware or proof of publisher identity.
- The current portable workflow is not Authenticode code-signed. Do not claim that renaming the EXE, changing the user agent, or deleting the browser profile can make Windows verify the publisher.
- Do not bypass WebAuthn, disable identity-provider security requirements, inject passwords, reuse browser cookies, or auto-click an authentication consent form.

## Operator steps (current executable, no rebuild necessary)
1. If an unexpected security-key prompt appears, click **Cancel** in Windows Security.
2. On the **official Google login page**, choose **Try another way / 다른 방법 시도** if offered, and use another method enrolled on the account (password, Google prompt, registered phone/passkey). If the account requires a physical security key, that requirement cannot be bypassed by NightNova.
3. If the Google OAuth flow becomes stuck, use NightNova's existing Back control or return to `https://chatgpt.com/auth/login` in the **same embedded browser tab**; don't clear `NightNova-Data`.
4. After login, confirm the authenticated ChatGPT UI and verify login persistence across app restarts. Note that portable login data is separate from an installed NightNova profile.

## Source UX batch
- Recognize exact HTTPS authentication provider hosts and OpenAI login routes. Untrusted sites do not gain the login recovery banner.
- On Google SSO pages display a brief explanation of security-key prompts and the provider's legitimate **Try another way** option.
- Provide an explicitly clicked **ChatGPT 로그인 처음부터** control in the same browser tab. It stops automatic ChatGPT supervision first and navigates to the official login entry URL without clearing cookies, passwords or local storage.
- Keep password handling and passkey decisions entirely inside the official identity-provider and Windows UI.
- Add trusted-host/invalid-host classification coverage.

## Verification gates
- Source committed; Windows runtime, native Windows Security pop-up, Google account policy, and real sign-in are not verified by a code commit.
- Next executable request: do one manual-only Windows portable gate, run TypeScript and focused tests once, produce one artifact, then verify login with a real account.
- No normal push-triggered Windows workflow.
