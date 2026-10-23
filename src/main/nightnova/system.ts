import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import type { NightnovaGitSummary, NightnovaValidationMode, NightnovaValidationResult } from '../../shared/nightnova'

const exec = promisify(execFile)

async function gitText(workspace: string, args: string[]): Promise<string> {
  try {
    const result = await exec('git', args, { cwd: workspace, timeout: 15_000, maxBuffer: 512 * 1024 })
    return result.stdout.trim().slice(0, 16_000)
  } catch (error) {
    return `unavailable: ${error instanceof Error ? error.message.slice(0, 150) : String(error)}`
  }
}

export async function nightnovaGitSummary(workspace: string): Promise<NightnovaGitSummary> {
  const [head, changes, diffStat] = await Promise.all([
    gitText(workspace, ['rev-parse', '--short', 'HEAD']),
    gitText(workspace, ['status', '--short']),
    gitText(workspace, ['diff', '--stat'])
  ])
  return { head, changes, diffStat }
}

interface Preset {
  name: string
  command: string
  args: string[]
  timeout: number
}

function presets(mode: NightnovaValidationMode): Preset[] {
  if (mode === 'none') return []
  const base: Preset[] = [
    { name: 'git diff --check', command: 'git', args: ['diff', '--check'], timeout: 20_000 },
    { name: 'typecheck', command: 'npm', args: ['run', 'typecheck'], timeout: 240_000 }
  ]
  if (mode === 'full') {
    base.push(
      { name: 'unit tests', command: 'npm', args: ['run', 'test'], timeout: 300_000 },
      { name: 'build', command: 'npm', args: ['run', 'build'], timeout: 300_000 }
    )
  }
  return base
}

function runPreset(
  cwd: string,
  preset: Preset,
  signal: AbortSignal
): Promise<NightnovaValidationResult> {
  return new Promise((resolve) => {
    const started = Date.now()
    let output = ''
    let settled = false
    let timeout: ReturnType<typeof setTimeout> | null = null
    const finish = (ok: boolean, exitCode: number | null, extra = ''): void => {
      if (settled) return
      settled = true
      if (timeout) clearTimeout(timeout)
      signal.removeEventListener('abort', onAbort)
      resolve({ name: preset.name, ok, exitCode, output: (output + extra).slice(-8000), durationMs: Date.now() - started })
    }
    if (signal.aborted) {
      finish(false, null, 'Cancelled before start')
      return
    }
    const executable = process.platform === 'win32' && preset.command === 'npm' ? 'npm.cmd' : preset.command
    const child = spawn(executable, preset.args, {
      cwd, shell: process.platform === 'win32' && preset.command === 'npm',
      windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
    })
    const collect = (chunk: Buffer): void => { output = (output + chunk.toString('utf8')).slice(-8000) }
    child.stdout?.on('data', collect)
    child.stderr?.on('data', collect)
    const onAbort = (): void => { child.kill(); finish(false, null, '\nCancelled at stop gate') }
    signal.addEventListener('abort', onAbort, { once: true })
    timeout = setTimeout(() => { child.kill(); finish(false, null, '\nValidation timeout') }, preset.timeout)
    child.on('error', (error) => finish(false, null, '\n' + error.message))
    child.on('close', (code) => finish(code === 0, code))
  })
}

export async function runNightnovaValidation(
  workspace: string,
  mode: NightnovaValidationMode,
  signal: AbortSignal
): Promise<NightnovaValidationResult[]> {
  const results: NightnovaValidationResult[] = []
  for (const preset of presets(mode)) {
    if (signal.aborted) break
    const result = await runPreset(workspace, preset, signal)
    results.push(result)
    if (!result.ok) break // one final validation gate, not a rerun loop
  }
  return results
}
