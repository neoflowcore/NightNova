import { dialog, type BrowserWindow } from 'electron'
import { readFile, writeFile, stat } from 'node:fs/promises'
import type { NightnovaTask, NightnovaQueueItem } from '../../shared/nightnova'

const MAX_QUEUE_BYTES = 256 * 1024
const MAX_QUEUE_TASKS = 40

interface QueueEnvelope {
  format: 'nightnova-queue'
  version: 1
  exportedAt: string
  tasks: NightnovaQueueItem[]
}

function assertQueue(raw: unknown): NightnovaQueueItem[] {
  if (!raw || typeof raw !== 'object') throw new Error('작업 큐 JSON 형식 오류')
  const envelope = raw as Partial<QueueEnvelope>
  if (envelope.format !== 'nightnova-queue' || envelope.version !== 1 ||
      !Array.isArray(envelope.tasks)) {
    throw new Error('Nightnova 작업 큐 파일이 아닙니다.')
  }
  if (envelope.tasks.length < 1 || envelope.tasks.length > MAX_QUEUE_TASKS) {
    throw new Error('큐 파일은 1~40개 작업만 포함할 수 있습니다.')
  }
  return envelope.tasks.map((task) => {
    if (!task || typeof task.instruction !== 'string' ||
        !task.instruction.trim() || task.instruction.length > 4000 ||
        typeof task.expectChanges !== 'boolean') {
      throw new Error('작업 지시 또는 변경 요구 필드가 올바르지 않습니다.')
    }
    return { instruction: task.instruction.trim(), expectChanges: task.expectChanges }
  })
}

export async function exportNightnovaQueue(
  win: BrowserWindow, tasks: NightnovaTask[]
): Promise<string | null> {
  if (!tasks.length) throw new Error('저장할 작업 큐가 없습니다.')
  const chosen = await dialog.showSaveDialog(win, {
    title: 'Nightnova 작업 큐 내보내기 (작업 지시가 포함됩니다)',
    defaultPath: 'nightnova-task-queue.json',
    filters: [{ name: 'Nightnova queue', extensions: ['json'] }]
  })
  if (chosen.canceled || !chosen.filePath) return null
  const envelope: QueueEnvelope = {
    format: 'nightnova-queue', version: 1,
    exportedAt: new Date().toISOString(),
    tasks: tasks.map((task) => ({
      instruction: task.instruction,
      expectChanges: task.expectChanges !== false
    }))
  }
  const data = JSON.stringify(envelope, null, 2) + '\n'
  if (Buffer.byteLength(data, 'utf8') > MAX_QUEUE_BYTES) {
    throw new Error('작업 큐 내보내기 크기 제한 초과')
  }
  await writeFile(chosen.filePath, data, { encoding: 'utf8', flag: 'wx' }).catch(async (error: NodeJS.ErrnoException) => {
    if (error.code !== 'EEXIST') throw error
    // User explicitly chose an existing file in the OS Save dialog.
    await writeFile(chosen.filePath!, data, { encoding: 'utf8' })
  })
  return chosen.filePath
}

export async function importNightnovaQueue(win: BrowserWindow): Promise<NightnovaQueueItem[] | null> {
  const selected = await dialog.showOpenDialog(win, {
    title: 'Nightnova 작업 큐 불러오기 (실행 전 검토하세요)',
    properties: ['openFile'],
    filters: [{ name: 'Nightnova queue', extensions: ['json'] }]
  })
  if (selected.canceled || !selected.filePaths[0]) return null
  const file = selected.filePaths[0]
  const size = (await stat(file)).size
  if (size <= 0 || size > MAX_QUEUE_BYTES) throw new Error('큐 파일 크기 제한 초과')
  return assertQueue(JSON.parse(await readFile(file, 'utf8')) as unknown)
}
