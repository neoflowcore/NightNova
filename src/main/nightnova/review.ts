import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import type { NightnovaReview, NightnovaReviewedFile } from '../../shared/nightnova'
import { resolveWorkspace } from './security'

const exec = promisify(execFile)
const PREVIEW_LIMIT = 48 * 1024
const MAX_FILES = 120

async function readGit(cwd: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await exec('git', args, {
      cwd, windowsHide: true, timeout: 20_000, maxBuffer: 256 * 1024
    })
    return stdout.trim()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return '(unavailable: ' + message.slice(0, 160) + ')'
  }
}

function parseStatus(porcelain: string): NightnovaReviewedFile[] {
  const files: NightnovaReviewedFile[] = []
  const items = porcelain.split('\0')
  for (let i = 0; i < items.length && files.length < MAX_FILES; i++) {
    const entry = items[i]
    if (!entry || entry.length < 4) continue
    const code = entry.slice(0, 2)
    const file = entry.slice(3)
    if (code === '??' && !file) continue
    if (!file) continue
    const moved = code.includes('R') || code.includes('C')
    const previousPath = moved ? items[++i] ?? null : null
    files.push({ path: file, status: code, previousPath,
      staged: code[0] !== ' ' && code[0] !== '?' })
  }
  return files
}

function limitedDiff(workspace: string): Promise<{ output: string; truncated: boolean }> {
  return new Promise((resolve) => {
    const child = spawn('git', ['diff', '--no-ext-diff', '--no-textconv', 'HEAD', '--'], {
      cwd: workspace, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
    })
    let output = ''
    let bytes = 0
    let truncated = false
    let done = false
    let stderr = ''
    const finish = (): void => {
      if (done) return
      done = true
      clearTimeout(timeout)
      resolve({ output: output + (stderr ? '\n[git] ' + stderr.slice(0, 500) : ''), truncated })
    }
    const timeout = setTimeout(() => {
      truncated = true
      child.kill()
      finish()
    }, 15_000)
    child.stdout.on('data', (buf: Buffer) => {
      const room = PREVIEW_LIMIT - bytes
      if (room <= 0) {
        truncated = true
        child.kill()
        return
      }
      const slice = buf.subarray(0, room)
      output += slice.toString('utf8')
      bytes += slice.length
      if (slice.length < buf.length || bytes >= PREVIEW_LIMIT) {
        truncated = true
        child.kill()
      }
    })
    child.stderr.on('data', (buf: Buffer) => {
      stderr = (stderr + buf.toString('utf8')).slice(-1000)
    })
    child.on('error', (error) => {
      stderr = error.message
      finish()
    })
    child.on('close', () => finish())
  })
}

export async function nightnovaReview(workspace: string): Promise<NightnovaReview> {
  const root = await resolveWorkspace(workspace)
  const [branch, head, porcelain, stat, diff] = await Promise.all([
    readGit(root, ['branch', '--show-current']),
    readGit(root, ['rev-parse', '--short', 'HEAD']),
    readGit(root, ['status', '--porcelain=v1', '-z', '--untracked-files=normal']),
    readGit(root, ['diff', '--stat', 'HEAD']),
    limitedDiff(root)
  ])
  const files = parseStatus(porcelain)
  return {
    checkedAt: Date.now(), branch: branch || '(detached)', head,
    files, stat, diffPreview: diff.output,
    truncated: diff.truncated || files.length >= MAX_FILES,
    dirty: files.length > 0
  }
}
