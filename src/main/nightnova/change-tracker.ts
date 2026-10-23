import { createHash } from 'node:crypto'
import { execFile, spawn } from 'node:child_process'
import { readFile, stat } from 'node:fs/promises'
import { promisify } from 'node:util'
import path from 'node:path'
import type { NightnovaChangeEvidence } from '../../shared/nightnova'

const exec = promisify(execFile)
const FILE_LIMIT = 2 * 1024 * 1024

function digestDiff(workspace: string, args: string[], hash: ReturnType<typeof createHash>): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, {
      cwd: workspace, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
    })
    let stderr = ''
    let done = false
    const timeout = setTimeout(() => {
      child.kill()
      finish(new Error('Git diff fingerprint timed out'))
    }, 25_000)
    const finish = (error?: Error): void => {
      if (done) return
      done = true
      clearTimeout(timeout)
      if (error) reject(error)
      else resolve()
    }
    child.stdout.on('data', (chunk: Buffer) => hash.update(chunk))
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString('utf8')).slice(-1000)
    })
    child.on('error', (error) => finish(error))
    child.on('close', (code) => {
      if (code !== 0) finish(new Error('git diff failed: ' + stderr))
      else finish()
    })
  })
}

// Metadata-only worktree fingerprint. Stream the tracked binary Git diff
// straight into SHA256 rather than loading an entire large patch into RAM.
// Record up to 50 untracked file hashes so edits to an already-untracked file
// are visible between turns even when git status remains "?? some-file".
export async function captureNightnovaEvidence(workspace: string): Promise<NightnovaChangeEvidence> {
  const head = await exec('git', ['rev-parse', '--verify', 'HEAD'], {
    cwd: workspace, timeout: 10_000, maxBuffer: 4096, windowsHide: true
  }).then((result) => result.stdout.trim()).catch(() => '(unborn)')
  const { stdout: porcelain } = await exec('git', ['status', '--porcelain=v1', '-uall'], {
    cwd: workspace, timeout: 25_000, maxBuffer: 2 * 1024 * 1024, windowsHide: true
  })
  const lines = porcelain.split(/\r?\n/).filter(Boolean)
  const hash = createHash('sha256')
  hash.update(head + '\n' + porcelain + '\n')
  if (head === '(unborn)') {
    await digestDiff(workspace, ['diff', '--no-ext-diff', '--binary'], hash)
    await digestDiff(workspace, ['diff', '--no-ext-diff', '--binary', '--cached'], hash)
  } else {
    await digestDiff(workspace, ['diff', '--no-ext-diff', '--binary', 'HEAD'], hash)
  }
  for (const line of lines.filter((entry) => entry.startsWith('?? ')).slice(0, 50)) {
    const relative = line.slice(3)
    if (!relative || path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..')) continue
    try {
      const info = await stat(path.resolve(workspace, relative))
      hash.update(relative + ':' + info.size + ':' + info.mtimeMs)
      if (info.isFile() && info.size <= FILE_LIMIT) hash.update(await readFile(path.resolve(workspace, relative)))
    } catch {
      hash.update('missing')
    }
  }
  return {
    fingerprint: hash.digest('hex'), head, dirtyFiles: lines.length,
    samplePaths: lines.slice(0, 12).map((line) => line.slice(3)),
    capturedAt: Date.now()
  }
}

export function hasNightnovaChanges(before: NightnovaChangeEvidence, after: NightnovaChangeEvidence): boolean {
  return before.fingerprint !== after.fingerprint
}
