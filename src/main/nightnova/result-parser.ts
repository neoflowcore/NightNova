export interface NightnovaAgentResult {
  signal: 'done' | 'blocked' | 'unknown'
  summary: string
  nextTask: string | null
  warnings: string[]
}

const safeLine = (text: string): string => text.replace(/[\x00-\x1f\x7f]/g, ' ').trim()

export function parseNightnovaAgentResult(output: string): NightnovaAgentResult {
  const raw = output.slice(-60_000)
  const result = raw.match(/^NIGHTNOVA_RESULT:\s*(done|blocked)\b/i)?.[1]?.toLowerCase()
  const suggestion = raw.match(/^NIGHTNOVA_NEXT_TASK:\s*(.+)$/mi)?.[1] ?? ''
  const summary = raw.match(/^NIGHTNOVA_SUMMARY:\s*(.+)$/mi)?.[1] ??
    raw.split(/\r?\n/).filter(Boolean).slice(-6).join(' ')
  const cleanNext = safeLine(suggestion)
  return {
    signal: result === 'done' || result === 'blocked' ? result : 'unknown',
    summary: safeLine(summary).slice(0, 1200),
    nextTask: cleanNext.length >= 10 && cleanNext.length <= 800 ? cleanNext : null,
    warnings: []
  }
}

export function nightnovaTaskPrompt(
  instruction: string,
  opts: { autoNext: boolean; attempt: number; previousError: string | null; expectChanges: boolean; workspace: string }
): string {
  const lines = [
    'NIGHTNOVA AUTONOMOUS DEVELOPMENT TURN',
    '',
    'You are implementing one bounded task inside the user-selected local Git repository.',
    'Workspace root: ' + opts.workspace,
    'Stay strictly within this repository; preserve existing code, pending changes, configuration and secrets.',
    'Use existing source architecture; implement working functionality rather than a plan-only answer.',
    'Do NOT create Git commits, push, merge, deploy, change GitHub Actions, or run destructive commands.',
    'Do NOT run repeated project-wide regression suites; validation is consolidated by Nightnova at the end.',
    'Do not read or transmit unrelated personal files, credential stores, or secret files.',
    'If necessary permission is unavailable, clearly report BLOCKED instead of claiming completion.',
    'Do not claim a feature was implemented when you only described it.',
    'Do not silently modify files outside the chosen repository.',
    '',
    'Return these status lines after your normal explanation:',
    'NIGHTNOVA_RESULT: done | blocked',
    'NIGHTNOVA_SUMMARY: <one-line concrete result>',
    opts.autoNext
      ? 'NIGHTNOVA_NEXT_TASK: <one bounded in-scope follow-up task, only when useful>'
      : 'Do not suggest or enqueue other tasks.',
    '',
    'Task:',
    instruction
  ]
  if (opts.expectChanges) {
    lines.push('', 'This task requires a tangible source or documentation change; a no-change response is not completion.')
  } else {
    lines.push('', 'This task is marked research/review-only; do not make code changes unless explicitly requested.')
  }
  if (opts.attempt > 1) {
    lines.push('', 'RETRY CONTEXT', opts.previousError ?? 'Previous attempt did not satisfy completion evidence.',
      'Inspect the previous attempt results, avoid unnecessary repetition, and correct the failure.')
  }
  return lines.join('\n')
}
