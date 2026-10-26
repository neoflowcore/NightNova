// Scripts executed ONLY after main has verified the host is an explicitly
// armed chatgpt.com conversation. The scripts read the last assistant message
// transiently and never fetch cookies, tokens or full chat transcripts.
export const CHAT_WATCH_INSPECT_SCRIPT = String.raw`(() => {
  const visible = (el) => !!el && !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length)
  const nodes = Array.from(document.querySelectorAll('[data-message-author-role]'))
  const assistantNodes = nodes.filter(el => el.getAttribute('data-message-author-role') === 'assistant')
  const userNodes = nodes.filter(el => el.getAttribute('data-message-author-role') === 'user')
  const last = assistantNodes[assistantNodes.length - 1]
  const lastNode = nodes[nodes.length - 1]
  const lastRole = lastNode?.getAttribute('data-message-author-role')
  const editor = document.querySelector('#prompt-textarea, [data-testid="composer-text-input"], [contenteditable="true"][role="textbox"]')
  const draftText = editor ? (editor.value ?? editor.innerText ?? editor.textContent ?? '') : ''
  const stop = document.querySelector('[data-testid="stop-button"], button[aria-label="Stop streaming"], button[aria-label="Stop generating"], button[aria-label="응답 중지"]')
  const generating = visible(stop) && !stop.disabled
  const password = document.querySelector('input[type="password"]')
  const challenge = document.querySelector('iframe[src*="challenges.cloudflare.com"], iframe[src*="hcaptcha"], #cf-challenge-running')
  const alerts = Array.from(document.querySelectorAll('[role="alert"]'))
    .filter(visible).slice(-3).map(el => (el.innerText ?? '').slice(0, 180)).join(' ')
  return {
    url: location.href,
    assistantCount: assistantNodes.length,
    userCount: userNodes.length,
    lastMessageRole: lastRole === 'user' || lastRole === 'assistant' ? lastRole : 'unknown',
    lastAssistantText: last ? (last.innerText || last.textContent || '').slice(-4000) : '',
    generating,
    online: navigator.onLine,
    // A hidden webview can have a working editor but no visible layout.
    // Supervision can inspect the editor while hidden; send is separately
    // restricted by main process to the tab that the operator is viewing.
    composerReady: !!editor && editor.isConnected && !editor.hasAttribute('disabled'),
    hasDraft: !!draftText.trim(),
    needsLogin: !!password && visible(password),
    challenge: !!challenge && visible(challenge),
    alertText: alerts.slice(0, 350)
  }
})()`

export function chatWatchPrepareScript(
  prompt: string, expectedUrl: string, operationId: string, deadlineAt: number
): string {
  // Only user-configured prompt text is injected; JSON.stringify prevents
  // remote page/script interpolation and is not evaluated as source.
  return String.raw`(async () => {
    const message = ${JSON.stringify(prompt)}
    const expected = new URL(${JSON.stringify(expectedUrl)})
    const operationId = ${JSON.stringify(operationId)}
    const deadline = ${JSON.stringify(deadlineAt)}
    if (!operationId || !Number.isFinite(deadline) || Date.now() > deadline) {
      return { prepared: false, reason: 'expired-prepare-command' }
    }
    if (location.origin !== expected.origin ||
        location.pathname.replace(/\/$/, '') !== expected.pathname.replace(/\/$/, '')) {
      return { prepared: false, reason: 'conversation-url-changed' }
    }
    const editor = document.querySelector('#prompt-textarea, [data-testid="composer-text-input"], [contenteditable="true"][role="textbox"]')
    const stop = document.querySelector('[data-testid="stop-button"], button[aria-label="Stop streaming"], button[aria-label="Stop generating"], button[aria-label="응답 중지"]')
    if (!editor || (stop && !stop.disabled)) return { prepared: false, reason: 'busy-or-missing-editor' }
    const messages = document.querySelectorAll('[data-message-author-role]')
    if (!messages.length || messages[messages.length - 1].getAttribute('data-message-author-role') !== 'assistant') {
      return { prepared: false, reason: 'no-completed-assistant-response' }
    }
    // Authentication/verification and offline transitions always block
    // preparation. A stale conversation can remain visible while logged out.
    const challenge = document.querySelector(
      'input[type="password"], iframe[src*="challenges.cloudflare.com"], iframe[src*="hcaptcha"], #cf-challenge-running'
    )
    if (challenge && (challenge.offsetWidth || challenge.offsetHeight || challenge.getClientRects().length)) {
      return { prepared: false, reason: 'authentication-required' }
    }
    if (!navigator.onLine) return { prepared: false, reason: 'offline' }
    const current = String(editor.value ?? editor.innerText ?? editor.textContent ?? '').trim()
    if (current) return { prepared: false, reason: 'existing-user-draft' }
    editor.focus()
    if (editor.isContentEditable) {
      // React/ProseMirror uses beforeinput rather than a plain textContent
      // assignment. execCommand(insertText) is still supported by Chromium's
      // editing engine and produces user-style input events.
      if (!document.execCommand('insertText', false, message)) {
        return { prepared: false, reason: 'editor-insertion-refused' }
      }
    } else if (typeof editor.value === 'string') {
      const descriptor = Object.getOwnPropertyDescriptor(
        editor.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value'
      )
      descriptor?.set?.call(editor, message)
      editor.dispatchEvent(new Event('input', { bubbles: true }))
    } else return { prepared: false, reason: 'unsupported-editor' }
    await new Promise(resolve => setTimeout(resolve, 350))
    if (Date.now() > deadline) return { prepared: false, reason: 'expired-prepare-command' }
    if (location.origin !== expected.origin ||
        location.pathname.replace(/\/$/, '') !== expected.pathname.replace(/\/$/, '')) {
      return { prepared: false, reason: 'conversation-url-changed' }
    }
    const actual = String(editor.value ?? editor.innerText ?? editor.textContent ?? '').trim()
    if (actual !== message.trim()) return { prepared: false, reason: 'draft-verification-failed' }
    const finalMessages = document.querySelectorAll('[data-message-author-role]')
    if (!finalMessages.length ||
        finalMessages[finalMessages.length - 1].getAttribute('data-message-author-role') !== 'assistant') {
      return { prepared: false, reason: 'conversation-changed-during-prepare' }
    }
    // A per-attempt identifier protects against an unrelated identical draft.
    // If React replaces the editor, the marker is absent and Send fails closed.
    editor.setAttribute('data-nightnova-draft-token', operationId)
    // Preparation never clicks Send; main process must recheck user intervention.
    return { prepared: true, reason: 'verified-draft' }
  })()`
}

// Phase 2: a synchronous, last-moment state check and one Send click.
export function chatWatchCommitScript(
  prompt: string, expectedUrl: string, operationId: string, deadlineAt: number,
  expectedAssistantCount: number, expectedUserCount: number, expectedAssistantText: string
): string {
  return String.raw`(() => {
    const message = ${JSON.stringify(prompt)}
    const expected = new URL(${JSON.stringify(expectedUrl)})
    const operationId = ${JSON.stringify(operationId)}
    const deadline = ${JSON.stringify(deadlineAt)}
    if (!operationId || !Number.isFinite(deadline) || Date.now() > deadline) {
      return { clicked: false, reason: 'expired-send-command' }
    }
    if (location.origin !== expected.origin ||
        location.pathname.replace(/\/$/, '') !== expected.pathname.replace(/\/$/, '')) {
      return { clicked: false, reason: 'conversation-url-changed' }
    }
    const editor = document.querySelector('#prompt-textarea, [data-testid="composer-text-input"], [contenteditable="true"][role="textbox"]')
    const stop = document.querySelector('[data-testid="stop-button"], button[aria-label="Stop streaming"], button[aria-label="Stop generating"], button[aria-label="응답 중지"]')
    const messages = document.querySelectorAll('[data-message-author-role]')
    if (!messages.length || messages[messages.length - 1].getAttribute('data-message-author-role') !== 'assistant') {
      return { clicked: false, reason: 'conversation-changed' }
    }
    if (messages.length !== ${JSON.stringify(expectedAssistantCount + expectedUserCount)}) {
      return { clicked: false, reason: 'conversation-message-count-changed' }
    }
    const assistant = Array.from(messages).filter(node =>
      node.getAttribute('data-message-author-role') === 'assistant')
    const users = Array.from(messages).filter(node =>
      node.getAttribute('data-message-author-role') === 'user')
    if (assistant.length !== ${JSON.stringify(expectedAssistantCount)} ||
        users.length !== ${JSON.stringify(expectedUserCount)}) {
      return { clicked: false, reason: 'conversation-role-count-changed' }
    }
    const lastAssistant = assistant[assistant.length - 1]
    if (!lastAssistant ||
        String(lastAssistant.innerText || lastAssistant.textContent || '').slice(-4000) !==
          ${JSON.stringify(expectedAssistantText.slice(-4000))}) {
      return { clicked: false, reason: 'assistant-response-changed' }
    }
    if (!editor || (stop && !stop.disabled)) return { clicked: false, reason: 'busy-or-missing-editor' }
    // Fail closed if login/challenge appears after draft preparation, or the
    // network goes offline immediately before the irreversible click.
    const challenge = document.querySelector(
      'input[type="password"], iframe[src*="challenges.cloudflare.com"], iframe[src*="hcaptcha"], #cf-challenge-running'
    )
    if (challenge && (challenge.offsetWidth || challenge.offsetHeight || challenge.getClientRects().length)) {
      return { clicked: false, reason: 'authentication-required' }
    }
    if (!navigator.onLine) return { clicked: false, reason: 'offline' }
    if (editor.getAttribute('data-nightnova-draft-token') !== operationId) {
      return { clicked: false, reason: 'unverified-draft-origin' }
    }
    if (String(editor.value ?? editor.innerText ?? editor.textContent ?? '').trim() !== message.trim()) {
      return { clicked: false, reason: 'draft-changed-before-send' }
    }
    const send = document.querySelector('button[data-testid="send-button"], button[aria-label="Send prompt"], button[aria-label="Send message"], button[aria-label="메시지 보내기"]')
    if (!send || send.disabled || !(send.offsetWidth || send.getClientRects().length)) {
      return { clicked: false, reason: 'send-button-unavailable' }
    }
    if (Date.now() > deadline || !editor.isConnected || !send.isConnected) {
      return { clicked: false, reason: 'expired-or-detached-send-control' }
    }
    // Invalidate the proof BEFORE the irreversible click. One-click budget.
    editor.removeAttribute('data-nightnova-draft-token')
    send.click()
    return { clicked: true, reason: 'send-clicked' }
  })()`
}
