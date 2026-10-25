import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { chatWatchCommitScript, chatWatchPrepareScript } from './dom'

const url = 'https://chatgpt.com/c/12345678-abcd-1234-efab-123456789012'

interface MockDomOptions {
  origin?: string
  pathname?: string
  role?: 'assistant' | 'user'
  draft?: string
  generating?: boolean
  sendAvailable?: boolean
}

function mockDom(options: MockDomOptions = {}) {
  let clicks = 0
  const editor: {
    isContentEditable: boolean
    innerText: string
    textContent: string
    focus: () => void
  } = {
    isContentEditable: true,
    innerText: options.draft ?? '',
    textContent: options.draft ?? '',
    focus: () => undefined
  }
  const send = {
    disabled: false,
    offsetWidth: 40,
    getClientRects: () => [1],
    click: () => { clicks++ }
  }
  const stop = { disabled: false }
  const document = {
    querySelector: (selector: string) => {
      if (selector.includes('#prompt-textarea')) return editor
      if (selector.includes('stop-button')) return options.generating ? stop : null
      if (selector.includes('send-button')) return options.sendAvailable === false ? null : send
      return null
    },
    querySelectorAll: () => [{
      getAttribute: (name: string) => name === 'data-message-author-role'
        ? options.role ?? 'assistant' : null
    }],
    execCommand: (_command: string, _show: boolean, value: string) => {
      editor.innerText = value
      editor.textContent = value
      return true
    }
  }
  const context = {
    document,
    location: {
      origin: options.origin ?? 'https://chatgpt.com',
      pathname: options.pathname ?? '/c/12345678-abcd-1234-efab-123456789012'
    },
    URL,
    setTimeout: (callback: () => void) => { callback(); return 0 }
  }
  return {
    context,
    editor,
    getClicks: () => clicks
  }
}

describe('thinking macro DOM send two-stage protocol', () => {
  it('prepares only the authorized draft without clicking Send', async () => {
    const test = mockDom()
    const prompt = 'continue implementation'
    const result = await runInNewContext(chatWatchPrepareScript(prompt, url), test.context)
    expect(result.prepared).toBe(true)
    expect(test.editor.innerText).toBe(prompt)
    expect(test.getClicks()).toBe(0)
  })

  it('clicks once only after the authorized draft was prepared', async () => {
    const test = mockDom()
    const prompt = 'finish the task'
    await runInNewContext(chatWatchPrepareScript(prompt, url), test.context)
    const result = runInNewContext(chatWatchCommitScript(prompt, url), test.context)
    expect(result.clicked).toBe(true)
    expect(test.getClicks()).toBe(1)
  })

  it('rejects navigation changes before both prepare and commit', async () => {
    const test = mockDom({ origin: 'https://other.example', draft: 'finish the task' })
    const prep = await runInNewContext(chatWatchPrepareScript('finish the task', url), test.context)
    const send = runInNewContext(chatWatchCommitScript('finish the task', url), test.context)
    expect(prep.prepared).toBe(false)
    expect(send.clicked).toBe(false)
    expect(test.getClicks()).toBe(0)
  })

  it('never overwrites a manual user draft and never sends a changed draft', async () => {
    const test = mockDom({ draft: 'my unsent message' })
    const prep = await runInNewContext(chatWatchPrepareScript('resume', url), test.context)
    const send = runInNewContext(chatWatchCommitScript('resume', url), test.context)
    expect(prep.prepared).toBe(false)
    expect(send.clicked).toBe(false)
    expect(test.editor.innerText).toBe('my unsent message')
    expect(test.getClicks()).toBe(0)
  })

  it('blocks an unanswered user message, generation and missing Send button', () => {
    for (const options of [
      { role: 'user' as const },
      { generating: true },
      { sendAvailable: false }
    ]) {
      const test = mockDom({ ...options, draft: 'resume' })
      const result = runInNewContext(chatWatchCommitScript('resume', url), test.context)
      expect(result.clicked).toBe(false)
      expect(test.getClicks()).toBe(0)
    }
  })

  it('does not evaluate prompt content as JavaScript', async () => {
    const test = mockDom()
    const prompt = 'resume"; throw new Error("injected"); //'
    const prepared = await runInNewContext(chatWatchPrepareScript(prompt, url), test.context)
    expect(prepared.prepared).toBe(true)
    expect(test.editor.innerText).toBe(prompt)
    expect(test.getClicks()).toBe(0)
  })
})
