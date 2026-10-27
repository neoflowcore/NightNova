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
  authVisible?: boolean
  online?: boolean
  useTurnWrappers?: boolean
}

function mockDom(options: MockDomOptions = {}) {
  let clicks = 0
  const attrs = new Map<string,string>()
  const editor: {
    isContentEditable: boolean
    innerText: string
    textContent: string
    focus: () => void
    isConnected: boolean
    setAttribute: (k:string,v:string)=>void
    getAttribute: (k:string)=>string|null
    removeAttribute: (k:string)=>void
  } = {
    isContentEditable: true,
    innerText: options.draft ?? '',
    textContent: options.draft ?? '',
    focus: () => undefined,
    isConnected: true,
    setAttribute:(k,v)=>{attrs.set(k,v)},
    getAttribute:k=>attrs.get(k)??null,
    removeAttribute:k=>{attrs.delete(k)}
  }
  const send = {
    disabled: false,
    isConnected: true,
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
      if (selector.includes('input[type="password"]')) {
        return options.authVisible ? { offsetWidth: 40, offsetHeight: 20, getClientRects: () => [1] } : null
      }
      return null
    },
    querySelectorAll: (selector:string) => {
      if (selector === '[data-message-author-role]' && options.useTurnWrappers) return []
      if (selector === '[data-testid^="conversation-turn-"]' && !options.useTurnWrappers) return []
      return [
        { getAttribute:(n:string)=>options.useTurnWrappers
          ? n==='data-testid' ? 'conversation-turn-user' : null
          : n==='data-message-author-role' ? 'user' : null },
        { getAttribute:(n:string)=>options.useTurnWrappers
          ? n==='data-testid' ? 'conversation-turn-assistant' : null
          : n==='data-message-author-role' ? (options.role ?? 'assistant') : null,
          innerText:'prior assistant', textContent:'prior assistant' }
      ]
    },
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
    Date,
    // Read the mutable mock state at execution time, not when the context is constructed.
    navigator: { get onLine() { return options.online !== false } },
    setTimeout: (callback: () => void) => { callback(); return 0 }
  }
  return {
    context,
    editor,
    getClicks: () => clicks
  }
}

const deadline = () => Date.now() + 10_000
const prepare = (prompt:string, target=url, id='test-operation') =>
  chatWatchPrepareScript(prompt,target,id,deadline())
const commit = (prompt:string, target=url, id='test-operation', until=deadline()) =>
  chatWatchCommitScript(prompt,target,id,until,1,1,'prior assistant')

describe('thinking macro DOM send two-stage protocol', () => {
  it('prepares only the authorized draft without clicking Send', async () => {
    const test = mockDom()
    const prompt = 'continue implementation'
    const result = await runInNewContext(prepare(prompt), test.context)
    expect(result.prepared).toBe(true)
    expect(test.editor.innerText).toBe(prompt)
    expect(test.getClicks()).toBe(0)
  })

  it('clicks once only after the authorized draft was prepared', async () => {
    const test = mockDom()
    const prompt = 'finish the task'
    await runInNewContext(prepare(prompt), test.context)
    const result = runInNewContext(commit(prompt), test.context)
    expect(result.clicked).toBe(true)
    expect(test.getClicks()).toBe(1)
  })

  it('uses Work conversation-turn wrappers consistently for prepare and commit', async () => {
    const test = mockDom({ useTurnWrappers:true })
    expect((await runInNewContext(prepare('resume'),test.context)).prepared).toBe(true)
    const script = chatWatchCommitScript('resume',url,'test-operation',deadline(),1,1,'prior assistant','turn-role')
    const outcome = runInNewContext(script,test.context)
    expect(outcome.clicked).toBe(true)
    expect(test.getClicks()).toBe(1)
  })
  it('refuses a selector-family change after preparing a draft', async () => {
    const options = { useTurnWrappers:false }
    const test = mockDom(options)
    expect((await runInNewContext(prepare('resume'),test.context)).prepared).toBe(true)
    options.useTurnWrappers = true
    const outcome = runInNewContext(commit('resume'),test.context)
    expect(outcome.clicked).toBe(false)
    expect(test.getClicks()).toBe(0)
  })
  it('rejects navigation changes before both prepare and commit', async () => {
    const test = mockDom({ origin: 'https://other.example', draft: 'finish the task' })
    const prep = await runInNewContext(prepare('finish the task'), test.context)
    const send = runInNewContext(commit('finish the task'), test.context)
    expect(prep.prepared).toBe(false)
    expect(send.clicked).toBe(false)
    expect(test.getClicks()).toBe(0)
  })

  it('never overwrites a manual user draft and never sends a changed draft', async () => {
    const test = mockDom({ draft: 'my unsent message' })
    const prep = await runInNewContext(prepare('resume'), test.context)
    const send = runInNewContext(commit('resume'), test.context)
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
      const result = runInNewContext(commit('resume'), test.context)
      expect(result.clicked).toBe(false)
      expect(test.getClicks()).toBe(0)
    }
  })

  it('blocks an expired queued Send even with a prepared matching draft', async () => {
    const test = mockDom()
    await runInNewContext(prepare('resume'),test.context)
    const result = runInNewContext(commit('resume',url,'test-operation',Date.now()-1),test.context)
    expect(result.clicked).toBe(false)
    expect(test.getClicks()).toBe(0)
  })
  it('rejects unprepared manual copy and reused operation identifiers', async () => {
    const test = mockDom({draft:'resume'})
    expect(runInNewContext(commit('resume'),test.context).clicked).toBe(false)
    expect(test.getClicks()).toBe(0)
    test.editor.innerText='';test.editor.textContent=''
    await runInNewContext(prepare('resume'),test.context)
    expect(runInNewContext(commit('resume'),test.context).clicked).toBe(true)
    expect(runInNewContext(commit('resume'),test.context).clicked).toBe(false)
    expect(test.getClicks()).toBe(1)
  })
  it('blocks preparation when an authentication challenge is on screen', async () => {
    const test = mockDom({ authVisible: true })
    const result = await runInNewContext(prepare('resume'), test.context)
    expect(result.prepared).toBe(false)
    expect(result.reason).toBe('authentication-required')
    expect(test.getClicks()).toBe(0)
  })
  it('blocks a click if login appears after a verified draft', async () => {
    const opts = { authVisible: false }
    const test = mockDom(opts)
    expect((await runInNewContext(prepare('resume'), test.context)).prepared).toBe(true)
    opts.authVisible = true
    const result = runInNewContext(commit('resume'), test.context)
    expect(result.clicked).toBe(false)
    expect(result.reason).toBe('authentication-required')
    expect(test.getClicks()).toBe(0)
  })
  it('never sends after the network goes offline during preparation', async () => {
    const opts = { online: true }
    const test = mockDom(opts)
    await runInNewContext(prepare('resume'), test.context)
    opts.online = false
    const result = runInNewContext(commit('resume'), test.context)
    expect(result.clicked).toBe(false)
    expect(result.reason).toBe('offline')
    expect(test.getClicks()).toBe(0)
  })
  it('does not evaluate prompt content as JavaScript', async () => {
    const test = mockDom()
    const prompt = 'resume"; throw new Error("injected"); //'
    const prepared = await runInNewContext(prepare(prompt), test.context)
    expect(prepared.prepared).toBe(true)
    expect(test.editor.innerText).toBe(prompt)
    expect(test.getClicks()).toBe(0)
  })
})
