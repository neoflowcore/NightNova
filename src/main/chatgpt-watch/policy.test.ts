import { describe, expect, it } from 'vitest'
import { decideChatWatch, detectChatWatchActionRequests } from './policy'
import type { ChatWatchDomObservation, ChatWatchStopConditions } from '../../shared/chatgpt-watch'

const base: ChatWatchDomObservation = {
  url: 'https://chatgpt.com/c/12345678-abcd-1234-efab-123456789012',
  assistantCount: 5, userCount: 5, generating: false, online: true,
  composerReady: true, hasDraft: false, needsLogin: false, challenge: false,
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
  it('does not send another prompt while generation is ongoing', () => {
    expect(decideChatWatch({ ...base, generating: true }, { ...context, now: 20_000 }).type)
      .toBe('wait')
  })
})
