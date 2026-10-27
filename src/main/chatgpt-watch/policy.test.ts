import { describe, expect, it } from 'vitest'
import { decideChatWatch, detectChatWatchActionRequests, hasExplicitChatWatchCompletion, isChatGptConversation } from './policy'
import type { ChatWatchDomObservation, ChatWatchStopConditions } from '../../shared/chatgpt-watch'

const base: ChatWatchDomObservation = {
  url: 'https://chatgpt.com/c/12345678-abcd-1234-efab-123456789012',
  assistantCount: 5, userCount: 5, generating: false, online: true,
  composerReady: true, hasDraft: false, lastMessageRole: 'assistant', needsLogin: false, challenge: false,
  alertText: '', lastAssistantText: '수기 검증이 필요합니다. 직접 확인해 주세요.'
}
const defaultStops: ChatWatchStopConditions = {
  login: false, approval: false, manualVerification: false, payment: true
}
const context = { now: 601000, lastProgressAt: 0, intervalSeconds: 600,
  sentCount: 0, maxAutoMessages: 12, awaitingResponse: false,
  stableObservations: 3, stopOn: defaultStops }
describe('ChatGPT supervisor configurable stop categories', () => {
  it('does not pause for manual verification with the checkbox off', () => {
    expect(decideChatWatch(base, context).type).toBe('send')
  })
  it('stops for manual verification with checkbox checked', () => {
    expect(decideChatWatch(base, { ...context, stopOn: { ...defaultStops, manualVerification: true } }).type)
      .toBe('needs-human')
  })
  it('detects login, approval, payment separately', () => {
    expect(detectChatWatchActionRequests('로그인이 필요합니다. 로그인해 주세요.')).toContain('login')
    expect(detectChatWatchActionRequests('권한 승인이 필요합니다.')).toContain('approval')
    expect(detectChatWatchActionRequests('결제 승인이 필요합니다.')).toContain('payment')
  })
  it('never mistakes a real authentication page for successful login', () => {
    expect(decideChatWatch({ ...base, needsLogin: true }, context).type).toBe('needs-human')
  })
  it('does not resume while the latest message is unanswered user input', () => {
    const pending = { ...base, lastMessageRole: 'user' as const }
    expect(decideChatWatch(pending, { ...context, now: 10000, intervalSeconds: 15 }).type).toBe('wait')
    expect(decideChatWatch(pending, { ...context, now: 16000, intervalSeconds: 15 }).type).toBe('needs-human')
  })
  it('keeps long reasoning separate from idle completion', () => {
    expect(decideChatWatch({ ...base, generating: true }, { ...context, now: 900000 }).type).toBe('wait')
    expect(decideChatWatch({ ...base, generating: true }, { ...context, now: 2000000 }).type).toBe('needs-human')
  })
  it('always gates explicit payment requests', () => {
    expect(decideChatWatch({ ...base, lastAssistantText: '결제 승인이 필요합니다.' }, { ...context, stopOn: { ...defaultStops, payment: false } }).type).toBe('needs-human')
  })
  it('allows observation-only on an unfamiliar Work DOM, never Send', () => {
    const missing = { ...base, assistantCount: 0, lastMessageRole: 'unknown' as const }
    expect(decideChatWatch(missing, {...context, readOnly:true}).type).toBe('wait')
    expect(decideChatWatch(missing, {...context, readOnly:false}).type).toBe('needs-human')
    expect(decideChatWatch({...base,lastMessageRole:'unknown'}, {...context,readOnly:true}).type).toBe('wait')
    expect(decideChatWatch({...base,lastMessageRole:'unknown'}, {...context,readOnly:false}).type).toBe('needs-human')
    expect(decideChatWatch({...base,hasDraft:true}, {...context,readOnly:true}).type).toBe('wait')
    expect(decideChatWatch({...base,composerReady:false}, {...context,readOnly:true}).type).toBe('wait')
    expect(decideChatWatch({...base,needsLogin:true}, {...context,readOnly:true}).type).toBe('needs-human')
  })
  it('fails closed if the latest message role cannot be verified', () => {
    expect(decideChatWatch({ ...base, lastMessageRole: 'unknown' }, context).type).toBe('needs-human')
  })
  it('recognizes supported nested ChatGPT project conversations', () => {
    expect(isChatGptConversation('https://chatgpt.com/g/g-demo-project/c/12345678-abcd-1234-efab-123456789012')).toBe(true)
    expect(isChatGptConversation('http://chatgpt.com/c/12345678-abcd-1234-efab-123456789012')).toBe(false)
    expect(isChatGptConversation('https://chatgpt.com.evil.test/c/12345678-abcd-1234-efab-123456789012')).toBe(false)
  })
  it('does not resume with a user draft, offline session, or missing composer', () => {
    const ready = { ...base, lastMessageRole: 'assistant' as const }
    expect(decideChatWatch({ ...ready, hasDraft: true }, context).type).toBe('needs-human')
    expect(decideChatWatch({ ...ready, online: false }, context).type).toBe('wait')
    expect(decideChatWatch({ ...ready, composerReady: false }, context).type).toBe('needs-human')
  })
  it('ends supervision only for a standalone final-line marker', () => {
    expect(hasExplicitChatWatchCompletion('확인 완료.\n[[NIGHTNOVA:COMPLETE]]')).toBe(true)
    expect(hasExplicitChatWatchCompletion('[[NIGHTNOVA:COMPLETE]] 이어서 진행')).toBe(false)
    expect(hasExplicitChatWatchCompletion('문서에서 [[NIGHTNOVA:COMPLETE]] 를 설명했습니다.')).toBe(false)
    expect(decideChatWatch({ ...base, lastAssistantText: '검증 완료.\n[[NIGHTNOVA:COMPLETE]]' }, context).type).toBe('complete')
  })
  it('never concludes while the message is still generating or unanswered', () => {
    const signal = '확인 완료.\n[[NIGHTNOVA:COMPLETE]]'
    expect(decideChatWatch({ ...base, generating: true, lastAssistantText: signal }, context).type).toBe('wait')
    expect(decideChatWatch({ ...base, lastMessageRole: 'user', lastAssistantText: signal }, context).type).toBe('needs-human')
  })
  it('does not send another prompt while generation is ongoing', () => {
    expect(decideChatWatch({ ...base, generating: true }, { ...context, now: 20_000 }).type)
      .toBe('wait')
  })
})
