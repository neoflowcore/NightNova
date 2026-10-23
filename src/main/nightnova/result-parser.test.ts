import { describe, expect, it } from 'vitest'
import { parseNightnovaAgentResult, nightnovaTaskPrompt } from './result-parser'

describe('Nightnova ACP result parser', () => {
  it('captures a bounded in-scope follow-up without completing it prematurely', () => {
    const result = parseNightnovaAgentResult([
      'Edited src/agent.ts and wiring.',
      'NIGHTNOVA_RESULT: done',
      'NIGHTNOVA_SUMMARY: Implemented persistent agent loop.',
      'NIGHTNOVA_NEXT_TASK: Add visible queue progress and retry state.'
    ].join('\n'))
    expect(result.signal).toBe('done')
    expect(result.summary).toBe('Implemented persistent agent loop.')
    expect(result.nextTask).toContain('visible queue')
  })
  it('recognizes a blocked turn', () => {
    const result = parseNightnovaAgentResult('NIGHTNOVA_RESULT: blocked\nNIGHTNOVA_SUMMARY: Permission unavailable.')
    expect(result.signal).toBe('blocked')
  })
  it('rejects absurdly long follow-ups instead of bloating the queue', () => {
    const result = parseNightnovaAgentResult('NIGHTNOVA_NEXT_TASK: ' + 'x'.repeat(900))
    expect(result.nextTask).toBeNull()
  })
  it('does not claim success on an ambiguous answer', () => {
    expect(parseNightnovaAgentResult('I think this is done').signal).toBe('unknown')
  })
  it('instructs retries to act on previous errors and not commit or deploy', () => {
    const prompt = nightnovaTaskPrompt('Implement the feature', {
      autoNext: true, attempt: 2, previousError: 'No Git diff',
      expectChanges: true, workspace: '/tmp/nightnova-test'
    })
    expect(prompt).toContain('No Git diff')
    expect(prompt).toContain('Do NOT create Git commits')
    expect(prompt).toContain('NIGHTNOVA_RESULT:')
  })
})
