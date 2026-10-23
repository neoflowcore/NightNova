// Absolute wall-clock deadlines are enforced in Electron main, independently
// from React renders, tab visibility and agent streaming.
export type DeadlineGate = 'prepare' | 'cancel' | 'kill' | 'expired'

export class NightnovaDeadline {
  private timer: ReturnType<typeof setInterval> | null = null
  private fired = new Set<DeadlineGate>()
  private at = 0

  constructor(private readonly onGate: (gate: DeadlineGate) => void) {}

  start(at: number): void {
    if (!Number.isFinite(at) || at <= Date.now()) throw new Error('마감 시각은 현재 이후여야 합니다.')
    this.stop()
    this.at = at
    this.fired.clear()
    this.timer = setInterval(() => this.check(), 1000)
    this.timer.unref?.()
    this.check()
  }

  left(): number {
    return this.at ? Math.max(0, this.at - Date.now()) : 0
  }

  // Called both periodically and at every state transition, so long system
  // sleeps cannot allow an extra turn after the deadline.
  check(): void {
    if (!this.at) return
    const remaining = this.left()
    const schedule: Array<[DeadlineGate, number]> = [
      ['prepare', 300_000],
      ['cancel', 30_000],
      ['kill', 25_000],
      ['expired', 0]
    ]
    for (const [gate, threshold] of schedule) {
      if (remaining <= threshold && !this.fired.has(gate)) {
        this.fired.add(gate)
        this.onGate(gate)
      }
    }
  }

  canStartTurn(): boolean {
    this.check()
    return this.at > 0 && this.left() > 300_000
  }

  canValidate(): boolean {
    this.check()
    return this.at > 0 && this.left() > 45_000
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.at = 0
    this.fired.clear()
  }
}
