import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { guardedNightnovaTurn, NightnovaTurnCancelled, NightnovaTurnTimeout } from './turn-guard'
describe('Nightnova bounded ACP turns', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())
  it('resolves a normal result', async () => {
    const ctrl = new AbortController()
    await expect(guardedNightnovaTurn(async () => 'done', ctrl.signal, 5000)).resolves.toBe('done')
  })
  it('interrupts an unresolved request when manually stopped', async () => {
    const ctrl = new AbortController()
    const pending = guardedNightnovaTurn(() => new Promise<string>(()=>{}), ctrl.signal, 5000)
    const assertion=expect(pending).rejects.toBeInstanceOf(NightnovaTurnCancelled)
    ctrl.abort()
    await assertion
  })
  it('times out without a repeated loop or global timer', async () => {
    const ctrl = new AbortController()
    const pending = guardedNightnovaTurn(() => new Promise<string>(()=>{}), ctrl.signal, 5000)
    const assertion=expect(pending).rejects.toBeInstanceOf(NightnovaTurnTimeout)
    await vi.advanceTimersByTimeAsync(5000)
    await assertion
  })
  it('refuses an already aborted task before invoking the agent', async () => {
    const ctrl = new AbortController()
    ctrl.abort()
    const run=vi.fn(async()=> 'bad')
    await expect(guardedNightnovaTurn(run, ctrl.signal, 5000)).rejects.toBeInstanceOf(NightnovaTurnCancelled)
    expect(run).not.toHaveBeenCalled()
  })
})
