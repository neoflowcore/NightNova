import { app } from 'electron'
import { mkdir, readFile, rename, writeFile, copyFile, readdir, unlink } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import type { NightnovaSnapshot, NightnovaGitSummary } from '../../shared/nightnova'

const LIMIT_BYTES = 1_000_000
const MAX_HANDOFFS = 20

function home(): string { return path.join(app.getPath('userData'), 'nightnova') }
function target(): string { return path.join(home(), 'checkpoint-v1.json') }
function backup(): string { return path.join(home(), 'checkpoint-v1.backup.json') }

function assertSnapshot(raw: unknown): NightnovaSnapshot {
  if (!raw || typeof raw !== 'object') throw new Error('체크포인트 형식이 올바르지 않습니다.')
  const snapshot = raw as NightnovaSnapshot
  if (snapshot.version !== 1 || !snapshot.config || !Array.isArray(snapshot.tasks) ||
      snapshot.tasks.length > 40 || !Array.isArray(snapshot.logs)) {
    throw new Error('지원되지 않는 체크포인트 형식입니다.')
  }
  if (snapshot.tasks.some((task) =>
    !task || typeof task.id !== 'string' || typeof task.instruction !== 'string' ||
    task.instruction.length > 4000 || !['queued', 'running', 'review', 'done', 'error', 'skipped'].includes(task.status)
  )) throw new Error('체크포인트 작업 목록이 손상되었습니다.')
  return snapshot
}

export async function saveNightnovaCheckpoint(snapshot: NightnovaSnapshot): Promise<number> {
  await mkdir(home(), { recursive: true, mode: 0o700 })
  const savedAt = Date.now()
  // Never write to the selected project repository or Git history.
  const data = JSON.stringify({ ...snapshot, checkpointAt: savedAt }, null, 2)
  if (Buffer.byteLength(data, 'utf8') > LIMIT_BYTES) {
    throw new Error('체크포인트 크기 제한(1MB)을 초과했습니다.')
  }
  const temporary = path.join(home(), 'checkpoint-' + randomUUID() + '.tmp')
  try {
    await writeFile(temporary, data, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
    await copyFile(target(), backup()).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error
    })
    await rename(temporary, target())
  } catch (error) {
    await unlink(temporary).catch(() => undefined)
    throw error
  }
  return savedAt
}

async function readCheckpoint(fullPath: string): Promise<NightnovaSnapshot | null> {
  try {
    const text = await readFile(fullPath, 'utf8')
    if (Buffer.byteLength(text, 'utf8') > LIMIT_BYTES) throw new Error('체크포인트 파일 크기 제한 초과')
    return assertSnapshot(JSON.parse(text) as unknown)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

export async function loadNightnovaCheckpoint(): Promise<NightnovaSnapshot | null> {
  try {
    return await readCheckpoint(target())
  } catch (error) {
    // Atomic rename normally prevents torn writes. Keep a previous snapshot
    // so unexpected disk damage does not erase the user's whole task queue.
    const saved = await readCheckpoint(backup()).catch(() => null)
    if (saved) return saved
    throw error
  }
}

function cleanMarkdown(text: string): string {
  return text.replace(/[\u0000-\u0009\u000b-\u001f]/g, ' ').trim()
}

export async function writeNightnovaHandoff(
  snapshot: NightnovaSnapshot, git: NightnovaGitSummary | null
): Promise<string> {
  const directory = path.join(home(), 'handoffs')
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const date = new Date().toISOString().replace(/[:.]/g, '-')
  const out = path.join(directory, 'handoff-' + date + '-' + randomUUID().slice(0, 6) + '.md')
  const lines = [
    '# Nightnova development handoff',
    '',
    'Generated: ' + new Date().toISOString(),
    'Run ID: ' + (snapshot.runId ?? '-'),
    'Workspace: ' + (snapshot.config.workspace ?? '(not selected)'),
    'Status: ' + snapshot.status,
    'Stop reason: ' + (snapshot.reason ?? '-'),
    'ACP turns: ' + snapshot.turns + '/' + snapshot.config.maxTurns,
    'Deadline: ' + (snapshot.config.deadlineAt
      ? new Date(snapshot.config.deadlineAt).toISOString() : 'none'),
    '',
    '## Tasks and evidence',
    ...snapshot.tasks.map((task) => [
      '- [' + (task.status === 'done' ? 'x' : ' ') + '] ' + cleanMarkdown(task.instruction).slice(0, 500),
      '  - Status: ' + task.status + ', attempts: ' + task.attempts,
      '  - Expect code changes: ' + String(task.expectChanges !== false),
      '  - Git fingerprint: ' + (task.evidence?.fingerprint.slice(0, 16) ?? 'not captured'),
      task.lastOutput ? '  - Result: ' + cleanMarkdown(task.lastOutput).slice(0, 500) : '',
      task.lastError ? '  - Blocker: ' + cleanMarkdown(task.lastError).slice(0, 500) : ''
    ].filter(Boolean).join('\n')),
    '',
    '## Git state (read only; never committed or pushed automatically)',
    'HEAD: ' + (git?.head ?? 'unknown'),
    '~~~text',
    cleanMarkdown(git?.changes ?? 'unavailable'),
    cleanMarkdown(git?.diffStat ?? ''),
    '~~~',
    '',
    '## Final validation (one consolidated pass)',
    ...snapshot.validations.map((check) =>
      '- ' + check.name + ': ' +
      (check.skipped ? 'SKIPPED' : check.ok ? 'PASS' : 'FAIL') +
      ', exit=' + (check.exitCode ?? 'n/a') +
      ', duration=' + check.durationMs + 'ms'
    ),
    '',
    '## Recent activity',
    ...snapshot.logs.slice(-30).map((log) =>
      '- ' + new Date(log.at).toISOString() + ' [' + log.type + '] ' + cleanMarkdown(log.message)),
    '',
    '## Human-controlled continuation',
    '1. Inspect Git status and diff in the selected local workspace.',
    '2. Resolve tasks marked review or error; never assume an interrupted ACP turn succeeded.',
    '3. Set an updated future deadline; start/resume explicitly from the Nightnova panel.',
    '4. Run final local validation once after implementing all features.',
    '5. Git commit, push and release are manual actions outside this automatic workbench.'
  ]
  await writeFile(out, lines.join('\n') + '\n', { encoding: 'utf8', mode: 0o600, flag: 'wx' })
  // Bound long-term disk use. Handoffs are tiny but recurring 60-minute runs
  // should not leave an unlimited number of files in app userData.
  try {
    const names = (await readdir(directory)).filter((name) =>
      /^handoff-[\w-]+\.md$/.test(name)).sort()
    for (const name of names.slice(0, Math.max(0, names.length - MAX_HANDOFFS))) {
      await unlink(path.join(directory, name))
    }
  } catch { /* Never lose a completed handoff because retention cleanup failed. */ }
  return out
}
