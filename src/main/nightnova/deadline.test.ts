import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NightnovaDeadline, type DeadlineGate } from './deadline'

describe('Nightnova absolute deadline', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-24T01:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('blocks new turns at T-5m and stages cancellation/killing only once', async () => {
    const gates: DeadlineGate[] = []
    const deadline = new NightnovaDeadline((gate) => gates.push(gate))
    deadline.start(Date.now() + 360_000)
    expect(deadline.canStartTurn()).toBe(true)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(deadline.canStartTurn()).toBe(false)
    expect(gates).toEqual(['prepare'])
    await vi.advanceTimersByTimeAsync(270_000)
    expect(gates).toEqual(['prepare', 'cancel'])
    await vi.advanceTimersByTimeAsync(5_000)
    expect(gates).toEqual(['prepare', 'cancel', 'kill'])
    await vi.advanceTimersByTimeAsync(25_000)
    expect(gates).toEqual(['prepare', 'cancel', 'kill', 'expired'])
    deadline.check()
    expect(gates).toHaveLength(4)
    deadline.stop()
  })

  it('rejects a deadline in the past and stays fail-closed', () => {
    const deadline = new NightnovaDeadline(() => undefined)
    expect(() => deadline.start(Date.now() - 1)).toThrow()
    expect(deadline.canStartTurn()).toBe(false)
  })

  it('stops ticking after shutdown', async () => {
    const gates: DeadlineGate[] = []
    const deadline = new NightnovaDeadline((gate) => gates.push(gate))
    deadline.start(Date.now() + 500_000)
    deadline.stop()
    await vi.advanceTimersByTimeAsync(600_000)
    expect(gates).toEqual([])
  })
})
