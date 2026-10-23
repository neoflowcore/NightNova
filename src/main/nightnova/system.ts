import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { readFile, access } from 'node:fs/promises'
import { promisify } from 'node:util'
import path from 'node:path'
import type {
  NightnovaGitSummary, NightnovaValidationMode, NightnovaValidationResult
} from '../../shared/nightnova'

const exec = promisify(execFile)
const OUTPUT_LIMIT = 8_000

async function gitText(workspace: string, args: string[]): Promise<string> {
  try {
    const result = await exec('git', args, {
      cwd: workspace, timeout: 15_000, maxBuffer: 512 * 1024, windowsHide: true
    })
    return result.stdout.trim().slice(0, 16_000)
  } catch (error) {
    return 'unavailable: ' + (error instanceof Error ? error.message.slice(0, 150) : String(error))
  }
}

export async function nightnovaGitSummary(workspace: string): Promise<NightnovaGitSummary> {
  const [head, changes, diffStat] = await Promise.all([
    gitText(workspace, ['rev-parse', '--short', 'HEAD']),
    gitText(workspace, ['status', '--short', '--untracked-files=normal']),
    gitText(workspace, ['diff', '--stat', 'HEAD'])
  ])
  return { head, changes, diffStat }
}

interface Preset {
  name: string
  command: string
  args: string[]
  timeout: number
}

type Manager = 'npm' | 'pnpm' | 'yarn' | 'bun'

async function exists(fullPath: string): Promise<boolean> {
  try { await access(fullPath); return true } catch { return false }
}

async function packageScripts(workspace: string): Promise<{ scripts: string[]; manager: Manager }> {
  let scripts: string[] = []
  let specified = ''
  try {
    const manifest: unknown = JSON.parse(await readFile(path.join(workspace, 'package.json'), 'utf8'))
    if (manifest && typeof manifest === 'object') {
      const data = manifest as { scripts?: unknown; packageManager?: unknown }
      if (data.scripts && typeof data.scripts === 'object') scripts = Object.keys(data.scripts)
      if (typeof data.packageManager === 'string') specified = data.packageManager
    }
  } catch { /* Non-JS projects can still run the Git diff check. */ }
  let manager: Manager = 'npm'
  if (specified.startsWith('pnpm@')) manager = 'pnpm'
  else if (specified.startsWith('yarn@')) manager = 'yarn'
  else if (specified.startsWith('bun@')) manager = 'bun'
  else if (!specified && await exists(path.join(workspace, 'pnpm-lock.yaml'))) manager = 'pnpm'
  else if (!specified && await exists(path.join(workspace, 'yarn.lock'))) manager = 'yarn'
  else if (!specified && await exists(path.join(workspace, 'bun.lock'))) manager = 'bun'
  return { scripts, manager }
}

function commandFor(manager: Manager): string {
  return process.platform === 'win32' ? manager + '.cmd' : manager
}

async function planPresets(workspace: string, mode: NightnovaValidationMode): Promise<Array<Preset | string>> {
  if (mode === 'none') return []
  const list: Array<Preset | string> = [
    { name: 'git diff --check', command: 'git', args: ['diff', '--check'], timeout: 20_000 }
  ]
  const { scripts, manager } = await packageScripts(workspace)
  for (const name of mode === 'full' ? ['typecheck', 'test', 'build'] : ['typecheck']) {
    if (!scripts.includes(name)) {
      list.push(name)
      continue
    }
    list.push({
      name, command: commandFor(manager),
      args: ['run', name],
      timeout: name === 'typecheck' ? 240_000 : 300_000
    })
  }
  return list
}

function killProcessTree(child: ChildProcess): void {
  const pid = child.pid
  if (!pid) { child.kill('SIGTERM'); return }
  if (process.platform === 'win32') {
    // npm.cmd is a cmd.exe wrapper: killing the wrapper alone leaves Node
    // descendants running after a deadline. Windows taskkill /T terminates
    // the full spawned process tree.
    const killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
      windowsHide: true, stdio: 'ignore'
    })
    killer.on('error', () => { child.kill() })
  } else {
    try { process.kill(-pid, 'SIGTERM') }
    catch { child.kill('SIGTERM') }
  }
}

function runPreset(cwd: string, preset: Preset, signal: AbortSignal): Promise<NightnovaValidationResult> {
  const started = Date.now()
  return new Promise((resolve) => {
    let output = ''
    let settled = false
    let timeout: ReturnType<typeof setTimeout> | null = null
    let child: ChildProcess | null = null
    const onAbort = (): void => {
      if (child) killProcessTree(child)
      finish(false, null, '\nCancelled by the Nightnova stop gate')
    }
    const finish = (ok: boolean, exitCode: number | null, extra = ''): void => {
      if (settled) return
      settled = true
      if (timeout) clearTimeout(timeout)
      signal.removeEventListener('abort', onAbort)
      resolve({
        name: preset.name, ok, exitCode,
        output: (output + extra).slice(-OUTPUT_LIMIT), durationMs: Date.now() - started
      })
    }
    if (signal.aborted) { finish(false, null, 'Cancelled before start'); return }
    try {
      child = spawn(preset.command, preset.args, {
        cwd, windowsHide: true,
        shell: process.platform === 'win32' && preset.command.endsWith('.cmd'),
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe']
      })
    } catch (error) {
      finish(false, null, error instanceof Error ? error.message : String(error))
      return
    }
    const append = (buf: Buffer): void => { output = (output + buf.toString('utf8')).slice(-OUTPUT_LIMIT) }
    child.stdout?.on('data', append)
    child.stderr?.on('data', append)
    child.on('error', (error) => finish(false, null, '\n' + error.message))
    child.on('close', (code) => finish(code === 0, code))
    timeout = setTimeout(() => {
      if (child) killProcessTree(child)
      finish(false, null, '\nTimed out after ' + preset.timeout + 'ms')
    }, preset.timeout)
    signal.addEventListener('abort', onAbort, { once: true })
    if (signal.aborted) onAbort()
  })
}

// Called ONCE after the feature queue settles, never on every ACP turn.
// The caller owns the cancellation controller; an absolute deadline can
// interrupt any preset at any point without running later presets.
export async function runNightnovaValidation(
  workspace: string,
  mode: NightnovaValidationMode,
  signal: AbortSignal,
  report?: (result: NightnovaValidationResult) => void
): Promise<NightnovaValidationResult[]> {
  const results: NightnovaValidationResult[] = []
  for (const preset of await planPresets(workspace, mode)) {
    if (signal.aborted) break
    const result: NightnovaValidationResult =
      typeof preset === 'string'
        ? {
          name: preset, ok: true, skipped: true, exitCode: null,
          output: 'No "' + preset + '" script in project package.json; skipped.',
          durationMs: 0
        }
        : await runPreset(workspace, preset, signal)
    results.push(result)
    report?.(result)
    if (!result.ok) break
  }
  return results
}
