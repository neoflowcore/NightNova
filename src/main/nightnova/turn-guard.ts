// Main-process deadline + manual abort protection for a single ACP turn.
// The wrapped SDK promise may reject after we finish; Promise.race attaches
// a rejection handler, so a late disconnect cannot become unhandled.
export class NightnovaTurnTimeout extends Error {
  constructor(minutes: number) {
    super('ACP 작업 턴이 최대 실행 시간 (' + minutes + '분)을 초과했습니다.')
    this.name = 'NightnovaTurnTimeout'
  }
}

export class NightnovaTurnCancelled extends Error {
  constructor() {
    super('ACP 턴이 중단되었습니다. Git 변경 확인 후 재개하세요.')
    this.name = 'NightnovaTurnCancelled'
  }
}

export function guardedNightnovaTurn<T>(
  run: () => Promise<T>,
  signal: AbortSignal,
  timeoutMs: number
): Promise<T> {
  if (signal.aborted) return Promise.reject(new NightnovaTurnCancelled())
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1) {
    return Promise.reject(new Error('잘못된 턴 실행 제한시간입니다.'))
  }
  return new Promise<T>((resolve, reject) => {
    let done = false
    const complete = (value?: T, error?: unknown): void => {
      if (done) return
      done = true
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      if (error !== undefined) reject(error)
      else resolve(value as T)
    }
    const onAbort = (): void => complete(undefined, new NightnovaTurnCancelled())
    const timer = setTimeout(
      () => complete(undefined, new NightnovaTurnTimeout(Math.ceil(timeoutMs / 60000))), timeoutMs
    )
    timer.unref?.()
    signal.addEventListener('abort', onAbort, { once: true })
    if (signal.aborted) { onAbort(); return }
    try {
      Promise.resolve(run()).then(
        (result) => complete(result),
        (error) => complete(undefined, error)
      )
    } catch (error) {
      complete(undefined, error)
    }
  })
}
