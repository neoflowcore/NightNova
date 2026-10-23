import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { readFile, stat } from 'node:fs/promises'
import { promisify } from 'node:util'
import path from 'node:path'
import type { NightnovaChangeEvidence } from '../../shared/nightnova'

const exec = promisify(execFile)

// Metadata-only worktree fingerprint: it never uploads source code, invokes CI,
// changes the index, or writes a Git commit. Tracks both already-dirty diffs
// and untracked files to avoid mistaking a no-op agent turn for completed code.
export async function captureNightnovaEvidence(workspace: string): Promise<NightnovaChangeEvidence> {
  const run = async (args: string[], cap = 4 * 1024 * 1024): Promise<string> => {
    const { stdout } = await exec('git', args, {
      cwd: workspace, timeout: 20_000, maxBuffer: cap, windowsHide: true
    })
    return stdout
  }
  const [head, porcelain, diff] = await Promise.all([
    run(['rev-parse', 'HEAD'], 4096),
    run(['status', '--porcelain=v1', '-uall'], 512 * 1024),
    run(['diff', '--binary', '--no-ext-diff', 'HEAD'], 8 * 1024 * 1024)
  ])
  const lines = porcelain.split(/\r?\n/).filter(Boolean)
  const fingerprint = createHash('sha256')
  fingerprint.update(head.trim())
  fingerprint.update('\n')
  fingerprint.update(porcelain)
  fingerprint.update('\n')
  fingerprint.update(diff)
  // Include the contents of reasonable-size untracked files, because the
  // status string "?? path" stays unchanged when an agent edits the file.
  for (const line of lines.filter((entry) => entry.startsWith('?? ')).slice(0, 50)) {
    const relative = line.slice(3)
    if (!relative || path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..')) continue
    const full = path.resolve(workspace, relative)
    try {
      const info = await stat(full)
      fingerprint.update(relative + ':' + info.size + ':' + info.mtimeMs)
      if (info.isFile() && info.size <= 2 * 1024 * 1024) {
        fingerprint.update(await readFile(full))
      }
    } catch {
      fingerprint.update('missing')
    }
  }
  return {
    fingerprint: fingerprint.digest('hex'), head: head.trim(),
    dirtyFiles: lines.length, samplePaths: lines.slice(0, 12).map((line) => line.slice(3)),
    capturedAt: Date.now()
  }
}

export function hasNightnovaChanges(before: NightnovaChangeEvidence, after: NightnovaChangeEvidence): boolean {
  return before.fingerprint !== after.fingerprint
}
