import { app } from 'electron'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import type { NightnovaSnapshot, NightnovaGitSummary } from '../../shared/nightnova'

function home(): string {
  return path.join(app.getPath('userData'), 'nightnova')
}

export async function saveNightnovaCheckpoint(snapshot: NightnovaSnapshot): Promise<number> {
  await mkdir(home(), { recursive: true })
  const savedAt = Date.now()
  // Keep all artifacts in app userData, never silently commit private prompts.
  const data = JSON.stringify({ ...snapshot, checkpointAt: savedAt }, null, 2)
  const target = path.join(home(), 'checkpoint-v1.json')
  const temporary = path.join(home(), `checkpoint-${randomUUID()}.tmp`)
  await writeFile(temporary, data, { encoding: 'utf8', mode: 0o600 })
  await rename(temporary, target)
  return savedAt
}

export async function loadNightnovaCheckpoint(): Promise<NightnovaSnapshot | null> {
  try {
    const raw = await readFile(path.join(home(), 'checkpoint-v1.json'), 'utf8')
    if (raw.length > 1_000_000) throw new Error('체크포인트 크기 제한 초과')
    const data: unknown = JSON.parse(raw)
    if (!data || typeof data !== 'object') throw new Error('잘못된 체크포인트')
    const snapshot = data as NightnovaSnapshot
    if (snapshot.version !== 1 || !Array.isArray(snapshot.tasks) || !snapshot.config) {
      throw new Error('지원되지 않는 체크포인트 형식')
    }
    if (snapshot.tasks.length > 100 || snapshot.tasks.some((task) =>
      typeof task.instruction !== 'string' || task.instruction.length > 4000
    )) throw new Error('체크포인트 작업 목록 오류')
    return snapshot
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

export async function writeNightnovaHandoff(
  snapshot: NightnovaSnapshot,
  git: NightnovaGitSummary | null
): Promise<string> {
  await mkdir(home(), { recursive: true })
  const date = new Date().toISOString().replace(/[:.]/g, '-')
  const out = path.join(home(), `handoff-${date}.md`)
  const lines = [
    '# Nightnova development handoff',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Workspace: ${snapshot.config.workspace ?? '(not selected)'}`,
    `Stop reason: ${snapshot.reason ?? snapshot.status}`,
    `ACP turns: ${snapshot.turns}/${snapshot.config.maxTurns}`,
    `Deadline: ${snapshot.config.deadlineAt ? new Date(snapshot.config.deadlineAt).toISOString() : 'none'}`,
    '',
    '## Queue',
    ...snapshot.tasks.map((task) => `- [${task.status === 'done' ? 'x' : ' '}] ${task.instruction.replace(/\s+/g, ' ').slice(0, 500)} (attempts: ${task.attempts}, status: ${task.status})`),
    '',
    '## Local Git state (not committed or pushed by Nightnova)',
    `HEAD: ${git?.head ?? 'unknown'}`,
    '~~~',
    git?.changes ?? 'unavailable',
    git?.diffStat ?? '',
    '~~~',
    '',
    '## Final validation',
    ...snapshot.validations.map((test) => `- ${test.name}: ${test.skipped ? 'skipped' : test.ok ? 'PASS' : 'FAIL'} (exit: ${test.exitCode ?? 'n/a'})`),
    '',
    '## Next step',
    'Review the working tree and pending queue. Explicitly press Resume to continue. Never assume a partially executed ACP turn is complete.'
  ]
  await writeFile(out, lines.join('\n') + '\n', { encoding: 'utf8', mode: 0o600 })
  return out
}
