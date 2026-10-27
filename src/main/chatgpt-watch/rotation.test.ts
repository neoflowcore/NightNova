import { describe, expect, it } from 'vitest'
import { nextWatchedTabId, createChatWatchSnapshot, assertChatWatchSeconds, secondsFromIntervalInput, intervalInputFromSeconds, chatWatchIdleCountdown, chatWatchRunRemainingSeconds, formatWatchDuration, shouldRotateWatchedTab, canSendAfterOperatorActivity, OPERATOR_SEND_GRACE_MS, mayCommitChatWatchPrompt, validWatchRunSummary } from '../../shared/chatgpt-watch'
import { decideChatWatch } from './policy'
import type { ChatWatchDomObservation } from '../../shared/chatgpt-watch'
describe('thinking macro: displayed tab rotation', () => {
  it('supports user-defined seconds, minutes and hours', () => {
    expect(secondsFromIntervalInput(15, 'seconds')).toBe(15)
    expect(secondsFromIntervalInput(30, 'minutes')).toBe(1800)
    expect(secondsFromIntervalInput(1, 'hours')).toBe(3600)
    expect(secondsFromIntervalInput(1, 'days')).toBe(86400)
    expect(secondsFromIntervalInput(0.5, 'hours')).toBe(1800)
    expect(Number.isNaN(secondsFromIntervalInput(0.01, 'seconds'))).toBe(true)
    expect(intervalInputFromSeconds(86400)).toEqual({amount:1,unit:'days'})
    expect(intervalInputFromSeconds(1800)).toEqual({amount:30,unit:'minutes'})
    expect(assertChatWatchSeconds(3600, 'resume')).toBe(3600)
    expect(() => assertChatWatchSeconds(1, 'resume')).toThrow()
    expect(() => assertChatWatchSeconds(0, 'rotation')).toThrow()
    expect(assertChatWatchSeconds(28_800, 'session')).toBe(28_800)
    expect(() => assertChatWatchSeconds(0, 'session')).toThrow()
  })
  it('does not accept timers with fractional seconds or negative input', () => {
    expect(Number.isNaN(secondsFromIntervalInput(1.25, 'seconds'))).toBe(true)
    expect(Number.isNaN(secondsFromIntervalInput(-1, 'hours'))).toBe(true)
    expect(secondsFromIntervalInput(2.5, 'minutes')).toBe(150)
  })
  it('computes honest read-only idle countdowns including long schedules', () => {
    expect(chatWatchIdleCountdown(25_000, 10_000, 30)).toEqual({
      elapsedSeconds: 15, remainingSeconds: 15, progressPercent: 50
    })
    expect(chatWatchIdleCountdown(80_000, 10_000, 30)).toEqual({
      elapsedSeconds: 70, remainingSeconds: 0, progressPercent: 100
    })
    expect(chatWatchIdleCountdown(1_000, null, 30).progressPercent).toBe(0)
    expect(formatWatchDuration(30)).toBe('00:30')
    expect(formatWatchDuration(3_661)).toBe('1:01:01')
    expect(formatWatchDuration(86_400)).toBe('24:00:00')
  })
  it('bounds unattended runtime and reports honest remaining time', () => {
    expect(chatWatchRunRemainingSeconds(1_000, null, 28_800)).toBeNull()
    expect(chatWatchRunRemainingSeconds(1_000, 1_000, 28_800)).toBe(28_800)
    expect(chatWatchRunRemainingSeconds(29_800_999, 1_000, 28_800)).toBe(0)
    expect(chatWatchRunRemainingSeconds(40_000_000, 1_000, 28_800)).toBe(0)
  })
  it('defers automatic tab rotation during user typing and interaction', () => {
    expect(shouldRotateWatchedTab(30_000, 0, 30, false)).toBe(true)
    expect(shouldRotateWatchedTab(45_000, 30_000, 30, false)).toBe(false)
    expect(shouldRotateWatchedTab(61_000, 30_000, 30, false)).toBe(true)
    expect(shouldRotateWatchedTab(999_999, 30_000, 30, true)).toBe(false)
    expect(shouldRotateWatchedTab(200_000, 100_000, 3_600, false)).toBe(false)
    expect(shouldRotateWatchedTab(221_000, 100_000, 3_600, false)).toBe(true)
    expect(shouldRotateWatchedTab(1_000, 2_000, 15, false)).toBe(false)
  })
  it('never sends while the operator is actively interacting', () => {
    expect(canSendAfterOperatorActivity(100_000, 0)).toBe(true)
    expect(canSendAfterOperatorActivity(100_000, 99_999)).toBe(false)
    expect(canSendAfterOperatorActivity(100_000, 100_000 - OPERATOR_SEND_GRACE_MS + 1)).toBe(false)
    expect(canSendAfterOperatorActivity(100_000, 100_000 - OPERATOR_SEND_GRACE_MS)).toBe(true)
    expect(canSendAfterOperatorActivity(99_000, 100_000)).toBe(false)
    expect(canSendAfterOperatorActivity(Number.NaN, 1)).toBe(false)
  })
  it('never commits Send in read-only supervision mode', () => {
    expect(mayCommitChatWatchPrompt(true,true,'send')).toBe(false)
    expect(mayCommitChatWatchPrompt(true,false,'send')).toBe(false)
    expect(mayCommitChatWatchPrompt(false,false,'send')).toBe(false)
    expect(mayCommitChatWatchPrompt(false,true,'wait')).toBe(false)
    expect(mayCommitChatWatchPrompt(false,true,'send')).toBe(true)
  })
  it('rotates visible project order without skipping and loops', () => {
    expect(nextWatchedTabId('t1',['t1','t2','t3'])).toBe('t2')
    expect(nextWatchedTabId('t2',['t1','t2','t3'])).toBe('t3')
    expect(nextWatchedTabId('t3',['t1','t2','t3'])).toBe('t1')
    expect(nextWatchedTabId('t4',['t1','t2','t3'])).toBe('t1')
    expect(nextWatchedTabId('t1',[])).toBeNull()
  })
  it('accepts bounded session summary but rejects forged persisted status', () => {
    const summary = { startedAt:10,endedAt:20,outcome:'paused' as const,
      readOnly:true,sentCount:0,dryRunReadyCount:2,attemptCount:0,reason:'수동 종료' }
    expect(validWatchRunSummary(summary)).toEqual(summary)
    expect(validWatchRunSummary({...summary,endedAt:5})).toBeNull()
    expect(validWatchRunSummary({...summary,outcome:'watching'})).toBeNull()
    expect(validWatchRunSummary({...summary,reason:'x'.repeat(241)})).toBeNull()
    expect(validWatchRunSummary(null)).toBeNull()
  })
  it('defaults to non-sending supervision and independent virtual metrics', () => {
    const first = createChatWatchSnapshot()
    const second = createChatWatchSnapshot()
    expect(first.config.readOnly).toBe(true)
    expect(first.dryRunReadyCount).toBe(0)
    expect(first.lastDryRunReadyAt).toBeNull()
    first.dryRunReadyCount++
    expect(second.dryRunReadyCount).toBe(0)
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
