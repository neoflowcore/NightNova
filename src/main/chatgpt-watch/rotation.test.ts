import { describe, expect, it } from 'vitest'
import { nextWatchedTabId, createChatWatchSnapshot, assertChatWatchSeconds, secondsFromIntervalInput, intervalInputFromSeconds } from '../../shared/chatgpt-watch'
import { decideChatWatch } from './policy'
import type { ChatWatchDomObservation } from '../../shared/chatgpt-watch'
describe('thinking macro: displayed tab rotation', () => {
  it('supports user-defined seconds, minutes and hours', () => {
    expect(secondsFromIntervalInput(15, 'seconds')).toBe(15)
    expect(secondsFromIntervalInput(30, 'minutes')).toBe(1800)
    expect(secondsFromIntervalInput(1, 'hours')).toBe(3600)
    expect(intervalInputFromSeconds(1800)).toEqual({amount:30,unit:'minutes'})
    expect(assertChatWatchSeconds(3600, 'resume')).toBe(3600)
    expect(() => assertChatWatchSeconds(1, 'resume')).toThrow()
    expect(() => assertChatWatchSeconds(0, 'rotation')).toThrow()
  })
  it('rotates visible project order without skipping and loops', () => {
    expect(nextWatchedTabId('t1',['t1','t2','t3'])).toBe('t2')
    expect(nextWatchedTabId('t2',['t1','t2','t3'])).toBe('t3')
    expect(nextWatchedTabId('t3',['t1','t2','t3'])).toBe('t1')
    expect(nextWatchedTabId('t4',['t1','t2','t3'])).toBe('t1')
    expect(nextWatchedTabId('t1',[])).toBeNull()
  })
  it('uses independent default stop checkbox objects per conversation', () => {
    const first = createChatWatchSnapshot()
    const second = createChatWatchSnapshot()
    first.config.stopOn.manualVerification = true
    expect(second.config.stopOn.manualVerification).toBe(false)
  })
  it('waits for the assistant before submitting another prompt', () => {
    const page: ChatWatchDomObservation = {
      url:'https://chatgpt.com/c/12345678-abcd-1234-efab-123456789012',
      assistantCount:2,userCount:2,generating:true,online:true,composerReady:true,hasDraft:false,
      needsLogin:false,challenge:false,alertText:'',lastAssistantText:''
    }
    const config=createChatWatchSnapshot().config
    const result=decideChatWatch(page,{
      now:30_000,lastProgressAt:0,intervalSeconds:config.intervalSeconds,
      sentCount:0,maxAutoMessages:config.maxAutoMessages,
      awaitingResponse:false,stableObservations:3,stopOn:config.stopOn
    })
    expect(result.type).toBe('wait')
  })
})
