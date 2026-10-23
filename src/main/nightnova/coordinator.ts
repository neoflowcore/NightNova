import { randomUUID } from 'node:crypto'
import type { RequestPermissionRequest, SessionNotification } from '@agentclientprotocol/sdk'
import { detectAgents } from '../acp-detect'
import { catalogAgent } from '../agent-catalog'
import { cancelSession, killSession, promptSession, spawnSession } from '../agent-router'
import { runAsAgent } from '../chrome-cdp'
import type {
  NightnovaConfig, NightnovaSnapshot, NightnovaTask, NightnovaTaskTemplate,
  NightnovaDoctor
} from '../../shared/nightnova'
import {
  isNightnovaBusy, newNightnovaSnapshot, NIGHTNOVA_DEFAULT_CONFIG
} from '../../shared/nightnova'
import { NightnovaDeadline, type DeadlineGate } from './deadline'
import { nightnovaPermission, resolveWorkspace } from './security'
import { loadNightnovaCheckpoint, saveNightnovaCheckpoint, writeNightnovaHandoff } from './storage'
import { nightnovaGitSummary, runNightnovaValidation } from './system'
import { captureNightnovaEvidence, hasNightnovaChanges } from './change-tracker'
import { nightnovaTaskPrompt, parseNightnovaAgentResult } from './result-parser'
import { runNightnovaDoctor } from './readiness'
import { NIGHTNOVA_TASK_TEMPLATES } from './templates'

const MAX_TASKS = 40
const MAX_TASK_LENGTH = 4000
const MAX_OUTPUT = 16_000

function taskFrom(
  instruction: string, expectChanges = true, source: NightnovaTask['source'] = 'manual'
): NightnovaTask {
  if (typeof instruction !== 'string') throw new Error('작업 지시는 문자열이어야 합니다.')
  const cleaned = instruction.trim()
  if (!cleaned || cleaned.length > MAX_TASK_LENGTH) throw new Error('작업 지시를 1~4000자로 작성하세요.')
  return {
    id: randomUUID(), instruction: cleaned, status: 'queued', attempts: 0,
    lastOutput: '', lastError: null, createdAt: Date.now(), completedAt: null,
    expectChanges, source, evidence: null
  }
}

function sanitizeConfig(patch: Partial<NightnovaConfig>, current: NightnovaConfig): NightnovaConfig {
  return {
    ...current,
    agent: patch.agent === 'codex' || patch.agent === 'claude-code' ? patch.agent : current.agent,
    maxTurns: typeof patch.maxTurns === 'number' && Number.isFinite(patch.maxTurns)
      ? Math.max(1, Math.min(40, Math.floor(patch.maxTurns))) : current.maxTurns,
    maxRetries: typeof patch.maxRetries === 'number' && Number.isFinite(patch.maxRetries)
      ? Math.max(0, Math.min(2, Math.floor(patch.maxRetries))) : current.maxRetries,
    deadlineAt: patch.deadlineAt === null ? null :
      typeof patch.deadlineAt === 'number' && Number.isSafeInteger(patch.deadlineAt)
        ? patch.deadlineAt : current.deadlineAt,
    autoNext: typeof patch.autoNext === 'boolean' ? patch.autoNext : current.autoNext,
    permission: patch.permission === 'workspace' || patch.permission === 'read-only'
      ? patch.permission : current.permission,
    validation: patch.validation === 'none' || patch.validation === 'light' || patch.validation === 'full'
      ? patch.validation : current.validation
    // A renderer can NEVER select an arbitrary workspace path through config.
  }
}

function copySnapshot(snapshot: NightnovaSnapshot): NightnovaSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as NightnovaSnapshot
}

function errorText(value: unknown): string {
  return value instanceof Error ? value.message : String(value)
}

export class NightnovaCoordinator {
  private snapshot: NightnovaSnapshot = newNightnovaSnapshot()
  private sessionId: string | null = null
  private loopPromise: Promise<void> | null = null
  private stopping = false
  private abort: AbortController | null = null
  private lastStreamAt = 0
  private heartbeat: ReturnType<typeof setInterval> | null = null
  private initialization: Promise<void> | null = null
  private saveTail: Promise<void> = Promise.resolve()
  private readonly deadline = new NightnovaDeadline((gate) => this.onDeadline(gate))

  constructor(private readonly onUpdate: (snapshot: NightnovaSnapshot) => void) {}

  state(): NightnovaSnapshot { return copySnapshot(this.snapshot) }
  templates(): NightnovaTaskTemplate[] { return NIGHTNOVA_TASK_TEMPLATES.map((item) => ({ ...item })) }

  private notify(): void { this.onUpdate(this.state()) }

  private log(type: 'info' | 'warning' | 'error' | 'gate', message: string): void {
    this.snapshot.logs.push({ at: Date.now(), type, message: message.slice(0, 500) })
    if (this.snapshot.logs.length > 100) this.snapshot.logs = this.snapshot.logs.slice(-100)
    this.snapshot.lastActivityAt = Date.now()
    this.notify()
  }

  private assertIdle(): void {
    if (isNightnovaBusy(this.snapshot.status) || this.loopPromise) {
      throw new Error('실행 중에는 설정을 변경할 수 없습니다. 먼저 중지하세요.')
    }
  }

  // Start-up recovery loads UI/queue/config without spawning a single agent.
  // Interrupted turns require explicit review and retry before continuing.
  initialize(): Promise<void> {
    if (this.initialization) return this.initialization
    this.initialization = (async () => {
      try {
        const saved = await loadNightnovaCheckpoint()
        if (saved) this.hydrate(saved, 'startup')
      } catch (error) {
        this.log('error', '저장 상태를 불러오지 못했습니다: ' + errorText(error))
      }
    })()
    return this.initialization
  }

  private hydrate(saved: NightnovaSnapshot, source: 'startup' | 'manual'): void {
    const restored = newNightnovaSnapshot()
    restored.config = sanitizeConfig(saved.config, { ...NIGHTNOVA_DEFAULT_CONFIG })
    restored.config.workspace = typeof saved.config.workspace === 'string' ? saved.config.workspace : null
    restored.config.permission = 'read-only' // Never silently regain edit privileges.
    restored.tasks = saved.tasks.slice(0, MAX_TASKS).map((task) => ({
      ...task,
      expectChanges: task.expectChanges !== false,
      status: task.status === 'running' ? 'review' : task.status,
      lastError: task.status === 'running'
        ? '실행 중 종료됨. Git 변경을 확인한 뒤 이 작업을 수동으로 재시도하세요.'
        : task.lastError
    }))
    restored.turns = Number.isSafeInteger(saved.turns) ? Math.max(0, Math.min(saved.turns, 40)) : 0
    restored.startedAt = saved.startedAt ?? null
    restored.finishedAt = saved.finishedAt ?? null
    restored.checkpointAt = saved.checkpointAt ?? null
    restored.validations = Array.isArray(saved.validations) ? saved.validations.slice(0, 10) : []
    restored.git = saved.git ?? null
    restored.handoffPath = saved.handoffPath ?? null
    restored.runId = saved.runId ?? null
    restored.logs = Array.isArray(saved.logs) ? saved.logs.slice(-100) : []
    restored.activeTaskId = null
    restored.liveOutput = ''
    restored.lastActivityAt = Date.now()
    restored.status = saved.status === 'running' || saved.status === 'stopping'
      ? 'paused' : saved.status
    restored.reason = source === 'startup'
      ? '저장된 작업을 복원했습니다. 자동 실행하지 않습니다. 작업 폴더와 Git 변경을 검토하세요.'
      : '수동 복구 완료. Git 변경을 확인한 후 시작하세요.'
    this.snapshot = restored
    this.log('warning', restored.reason)
  }

  private async checkpointNow(): Promise<void> {
    const snapshot = this.state()
    // Serialize writes to avoid an older asynchronous rename overwriting a
    // newer state (especially when the user stops during a long ACP turn).
    this.saveTail = this.saveTail.catch(() => undefined).then(async () => {
      const savedAt = await saveNightnovaCheckpoint(snapshot)
      this.snapshot.checkpointAt = Math.max(this.snapshot.checkpointAt ?? 0, savedAt)
    })
    await this.saveTail
    this.notify()
  }

  async checkpoint(): Promise<NightnovaSnapshot> {
    await this.checkpointNow()
    return this.state()
  }

  async configure(patch: Partial<NightnovaConfig>): Promise<NightnovaSnapshot> {
    this.assertIdle()
    this.snapshot.config = sanitizeConfig(patch, this.snapshot.config)
    await this.checkpointNow()
    return this.state()
  }

  async chooseWorkspace(parentWindow: Electron.BrowserWindow): Promise<NightnovaSnapshot> {
    this.assertIdle()
    const { dialog } = await import('electron')
    const selected = await dialog.showOpenDialog(parentWindow, {
      title: 'Nightnova 개발 Git 저장소 선택',
      properties: ['openDirectory']
    })
    if (selected.canceled || !selected.filePaths[0]) return this.state()
    // Guard again: a run could start while the native picker was open.
    this.assertIdle()
    this.snapshot.config.workspace = await resolveWorkspace(selected.filePaths[0])
    this.snapshot.git = await nightnovaGitSummary(this.snapshot.config.workspace)
    this.snapshot.doctor = null
    this.log('info', '로컬 Git 저장소를 선택했습니다. Git push/commit은 자동 실행하지 않습니다.')
    await this.checkpointNow()
    return this.state()
  }

  async doctor(): Promise<NightnovaDoctor> {
    const result = await runNightnovaDoctor(this.snapshot.config.workspace)
    this.snapshot.doctor = result
    this.notify()
    return result
  }

  async enqueue(instruction: string, expectChanges = true): Promise<NightnovaSnapshot> {
    this.assertIdle()
    if (this.snapshot.tasks.length >= MAX_TASKS) throw new Error('작업 큐는 최대 40개입니다.')
    this.snapshot.tasks.push(taskFrom(instruction, expectChanges))
    this.log('info', '새 작업을 대기열에 추가했습니다.')
    await this.checkpointNow()
    return this.state()
  }

  async enqueueMany(items: Array<{ instruction: string; expectChanges?: boolean }>): Promise<NightnovaSnapshot> {
    this.assertIdle()
    if (!Array.isArray(items) || items.length < 1 || items.length > MAX_TASKS) {
      throw new Error('한 번에 1~40개 작업을 추가할 수 있습니다.')
    }
    if (this.snapshot.tasks.length + items.length > MAX_TASKS) {
      throw new Error('작업 큐 최대 40개를 초과합니다.')
    }
    const tasks = items.map((item) => taskFrom(item.instruction, item.expectChanges !== false))
    this.snapshot.tasks.push(...tasks)
    this.log('info', String(tasks.length) + '개 작업을 한 번에 추가했습니다.')
    await this.checkpointNow()
    return this.state()
  }

  async enqueueTemplate(id: string): Promise<NightnovaSnapshot> {
    const template = NIGHTNOVA_TASK_TEMPLATES.find((item) => item.id === id)
    if (!template) throw new Error('알 수 없는 작업 템플릿입니다.')
    this.assertIdle()
    if (this.snapshot.tasks.length >= MAX_TASKS) throw new Error('작업 큐는 최대 40개입니다.')
    this.snapshot.tasks.push(taskFrom(template.instruction, template.expectChanges, 'template'))
    this.log('info', '작업 템플릿을 추가했습니다: ' + template.title)
    await this.checkpointNow()
    return this.state()
  }

  async removeTask(id: string): Promise<NightnovaSnapshot> {
    this.assertIdle()
    this.snapshot.tasks = this.snapshot.tasks.filter((task) => task.id !== id || task.status === 'done')
    await this.checkpointNow()
    return this.state()
  }

  async retryTask(id: string): Promise<NightnovaSnapshot> {
    this.assertIdle()
    const task = this.snapshot.tasks.find((item) => item.id === id)
    if (!task || (task.status !== 'review' && task.status !== 'error')) {
      throw new Error('재시도 가능한 작업을 찾지 못했습니다.')
    }
    task.status = 'queued'
    task.attempts = 0
    task.lastError = null
    task.completedAt = null
    this.log('warning', '재시도 대기: 기존 Git 변경 상태를 먼저 검토하세요.')
    await this.checkpointNow()
    return this.state()
  }

  async moveTask(id: string, delta: number): Promise<NightnovaSnapshot> {
    this.assertIdle()
    const idx = this.snapshot.tasks.findIndex((task) => task.id === id)
    const next = idx + (delta < 0 ? -1 : 1)
    if (idx < 0 || next < 0 || next >= this.snapshot.tasks.length) return this.state()
    if (this.snapshot.tasks[idx].status !== 'queued' || this.snapshot.tasks[next].status !== 'queued') {
      return this.state()
    }
    const tasks = this.snapshot.tasks
    ;[tasks[idx], tasks[next]] = [tasks[next], tasks[idx]]
    await this.checkpointNow()
    return this.state()
  }

  async restore(): Promise<NightnovaSnapshot> {
    this.assertIdle()
    await this.saveTail.catch(() => undefined)
    const saved = await loadNightnovaCheckpoint()
    if (!saved) throw new Error('복구할 체크포인트가 없습니다.')
    this.hydrate(saved, 'manual')
    await this.checkpointNow()
    return this.state()
  }

  async reset(): Promise<NightnovaSnapshot> {
    this.assertIdle()
    const config = this.snapshot.config
    this.snapshot = newNightnovaSnapshot()
    this.snapshot.config = { ...config, deadlineAt: null, permission: 'read-only' }
    await this.checkpointNow()
    return this.state()
  }

  private onDeadline(gate: DeadlineGate): void {
    switch (gate) {
      case 'prepare':
        this.log('gate', 'T-5분: 신규 턴 차단, 현재 작업 종료 후 인계 준비.')
        break
      case 'cancel':
        this.log('gate', 'T-30초: 에이전트 중단 요청 및 검증 취소.')
        void this.stop('deadline-cancel')
        break
      case 'kill':
        this.log('gate', 'T-25초: 에이전트 프로세스 강제 종료.')
        if (this.sessionId) void killSession(this.sessionId).catch(() => null)
        break
      case 'expired':
        this.log('gate', '지정 시각 도달: 새 작업과 검증 금지.')
        void this.stop('deadline-expired')
        break
    }
  }

  async start(): Promise<NightnovaSnapshot> {
    this.assertIdle()
    const config = this.snapshot.config
    if (!config.workspace) throw new Error('먼저 Git 작업 폴더를 선택하세요.')
    if (!config.deadlineAt || config.deadlineAt - Date.now() <= 300_000) {
      throw new Error('마감 시각을 현재보다 최소 5분 뒤로 지정하세요.')
    }
    if (!this.snapshot.tasks.some((task) => task.status === 'queued')) {
      throw new Error('실행할 대기 작업이 없습니다. 검토 필요 작업은 수동 재시도하세요.')
    }
    if (this.snapshot.turns >= config.maxTurns) {
      throw new Error('턴 제한에 도달했습니다. 제한을 조정하거나 새 실행을 만드세요.')
    }
    if (config.permission === 'read-only' &&
      this.snapshot.tasks.some((task) => task.status === 'queued' && task.expectChanges !== false)) {
      throw new Error('개발 작업에는 선택한 Git 저장소의 파일 변경 권한을 명시적으로 켜야 합니다.')
    }
    config.workspace = await resolveWorkspace(config.workspace)
    this.assertIdle()
    this.stopping = false
    this.abort = new AbortController()
    this.snapshot.status = 'running'
    this.snapshot.startedAt ??= Date.now()
    this.snapshot.finishedAt = null
    this.snapshot.reason = null
    this.snapshot.handoffPath = null
    this.snapshot.validations = []
    this.snapshot.runId = randomUUID()
    try {
      this.deadline.start(config.deadlineAt)
      this.log('info', '개발 시작: ' + config.agent + ' / 최대 ' + config.maxTurns + '턴 / 최종 통합 검증은 1회')
      await this.checkpointNow()
    } catch (error) {
      this.deadline.stop()
      this.snapshot.status = 'failed'
      this.snapshot.reason = '체크포인트 준비 실패: ' + errorText(error)
      this.abort = null
      this.log('error', this.snapshot.reason)
      throw error
    }
    this.heartbeat = setInterval(() => {
      if (this.snapshot.status === 'running' || this.snapshot.status === 'stopping') {
        void this.checkpointNow().catch((error) => this.log('error', '자동 체크포인트 오류: ' + errorText(error)))
      }
    }, 45_000)
    this.heartbeat.unref?.()
    this.loopPromise = this.runLoop().finally(() => { this.loopPromise = null })
    return this.state()
  }

  async stop(reason = 'manual-stop'): Promise<NightnovaSnapshot> {
    if (!isNightnovaBusy(this.snapshot.status) && !this.loopPromise) return this.state()
    if (this.stopping) return this.state()
    this.stopping = true
    this.snapshot.status = 'stopping'
    this.snapshot.reason = reason
    this.abort?.abort()
    this.log('warning', '중단 요청: ' + reason)
    if (this.sessionId) {
      void cancelSession(this.sessionId).catch(() => null)
      const id = this.sessionId
      setTimeout(() => {
        if (this.sessionId === id) void killSession(id).catch(() => null)
      }, 5_000).unref?.()
    }
    void this.checkpointNow().catch(() => undefined)
    return this.state()
  }

  private async runLoop(): Promise<void> {
    let failure: string | null = null
    let cleanEnd = false
    const config = this.snapshot.config
    const workspace = config.workspace!
    try {
      const agent = catalogAgent(config.agent)
      if (!agent || agent.provider !== 'acp') throw new Error('지원되지 않는 ACP 에이전트입니다.')
      const [probe] = await detectAgents([{ command: agent.command, fallbackBins: agent.fallbackBins }])
      if (!probe?.resolvedPath) throw new Error(agent.command + ' 실행 파일을 찾지 못했습니다. 설치와 로그인을 확인하세요.')
      if (this.stopping) return
      const spawned = await spawnSession({
        id: agent.id, command: probe.resolvedPath, args: agent.args
      }, workspace)
      this.sessionId = spawned.sessionId
      this.log('info', 'ACP 세션 연결됨: ' + agent.id)
      while (!this.stopping && this.snapshot.status === 'running') {
        this.deadline.check()
        if (!this.deadline.canStartTurn()) {
          this.snapshot.reason = 'deadline-handoff'
          break
        }
        if (this.snapshot.turns >= config.maxTurns) {
          this.snapshot.reason = 'turn-limit'
          break
        }
        const task = this.snapshot.tasks.find((item) => item.status === 'queued')
        if (!task) {
          cleanEnd = true
          this.snapshot.reason = 'queue-complete'
          break
        }
        let output = ''
        let before
        try {
          before = await captureNightnovaEvidence(workspace)
          task.status = 'running'
          task.attempts++
          this.snapshot.turns++
          this.snapshot.activeTaskId = task.id
          this.snapshot.liveOutput = ''
          this.notify()
          await this.checkpointNow()
          if (this.stopping || !this.deadline.canStartTurn()) {
            task.status = 'review'
            task.lastError = '착수 직전 중단됨. 변경사항을 확인하세요.'
            break
          }
          const prompt = nightnovaTaskPrompt(task.instruction, {
            autoNext: config.autoNext, attempt: task.attempts,
            previousError: task.lastError, expectChanges: task.expectChanges !== false,
            workspace
          })
          const result = await runAsAgent(() => promptSession(
            this.sessionId!, prompt,
            (notification: SessionNotification) => {
              const update = notification.update as {
                sessionUpdate?: string; content?: { type?: string; text?: string }
              }
              this.snapshot.lastActivityAt = Date.now()
              if (update?.sessionUpdate === 'agent_message_chunk' && update.content?.type === 'text') {
                output = (output + (update.content.text ?? '')).slice(-MAX_OUTPUT)
                this.snapshot.liveOutput = output.slice(-1800)
              }
              if (Date.now() - this.lastStreamAt > 500) {
                this.lastStreamAt = Date.now()
                this.notify()
              }
            },
            (request: RequestPermissionRequest) =>
              Promise.resolve(nightnovaPermission(request, config.permission, workspace))
          ))
          if (this.stopping) {
            task.status = 'review'
            task.lastError = '중단된 ACP 턴은 완료로 판정하지 않습니다. 변경 파일 확인 후 수동 재시도하세요.'
            break
          }
          if (result.stopReason !== 'end_turn') throw new Error('ACP 종료 상태: ' + result.stopReason)
          const parsed = parseNightnovaAgentResult(output)
          const after = await captureNightnovaEvidence(workspace)
          task.evidence = after
          if (parsed.signal === 'blocked') throw new Error('에이전트가 작업 차단을 보고했습니다: ' + parsed.summary)
          if (task.expectChanges !== false && !hasNightnovaChanges(before, after)) {
            throw new Error('ACP 응답은 완료되었지만 Git 작업 파일 변화가 없습니다.')
          }
          task.status = 'done'
          task.lastOutput = (parsed.summary || output).slice(0, 2000)
          task.completedAt = Date.now()
          task.lastError = null
          this.log('info', '턴 ' + this.snapshot.turns + ': Git 변경 확인=' +
            String(hasNightnovaChanges(before, after)) + ', 작업 완료=' + task.instruction.slice(0, 60))
          if (config.autoNext && parsed.nextTask &&
            this.snapshot.tasks.length < MAX_TASKS && this.snapshot.turns < config.maxTurns &&
            !this.snapshot.tasks.some((old) =>
              old.instruction.trim().toLowerCase() === parsed.nextTask?.toLowerCase()
            )) {
            this.snapshot.tasks.push(taskFrom(parsed.nextTask, true, 'agent'))
            this.log('info', '원래 범위의 후속 작업 1개를 대기열에 추가했습니다.')
          }
        } catch (error) {
          task.lastError = errorText(error)
          if (this.stopping) {
            task.status = 'review'
            break
          }
          if (task.status === 'running' && task.attempts <= config.maxRetries && this.deadline.canStartTurn()) {
            task.status = 'queued'
            this.log('warning', '작업 재시도 ' + task.attempts + '/' + config.maxRetries + ': ' + task.lastError)
          } else {
            task.status = 'error'
            failure = task.lastError
            this.snapshot.reason = 'task-failed'
            this.log('error', '작업 중단: ' + failure)
            break
          }
        } finally {
          this.snapshot.activeTaskId = null
          this.snapshot.liveOutput = ''
          await this.checkpointNow().catch((error) =>
            this.log('error', '상태 저장 실패: ' + errorText(error)))
        }
      }
    } catch (error) {
      failure = errorText(error)
      this.snapshot.reason = 'session-failed'
      this.log('error', failure)
    } finally {
      // Do not allow a blocked ACP session to keep the runtime alive after
      // we passed the stop gate. Kill before any validation starts.
      if (this.sessionId) {
        const id = this.sessionId
        this.sessionId = null
        await Promise.race([
          killSession(id).catch((error) => this.log('warning', 'ACP 종료 실패: ' + errorText(error))),
          new Promise<void>((resolve) => setTimeout(resolve, 7_000))
        ])
      }
      const shouldValidate = cleanEnd && !failure && !this.stopping && config.validation !== 'none'
      if (shouldValidate && this.deadline.canValidate() && this.abort && !this.abort.signal.aborted) {
        this.log('info', '기능 작업을 마쳤습니다. 마지막 통합검증 1회 시작.')
        this.snapshot.validations = await runNightnovaValidation(
          workspace, config.validation, this.abort.signal,
          (result) => {
            this.log(result.ok ? 'info' : 'error',
              '통합검증 ' + result.name + ': ' + (result.skipped ? 'SKIPPED' : result.ok ? 'PASS' : 'FAIL'))
          }
        ).catch((error) => {
          failure = '검증 실행 오류: ' + errorText(error)
          return []
        })
        if (this.snapshot.validations.some((check) => !check.ok)) {
          failure = '최종 통합검증이 실패했습니다. 인계서에서 결과를 확인하세요.'
          this.snapshot.reason = 'validation-failed'
        }
      } else if (shouldValidate && !this.stopping) {
        this.snapshot.reason = 'validation-skipped-deadline'
        cleanEnd = false
        this.log('warning', '마감까지 시간이 부족하여 통합검증을 건너뛰었습니다.')
      }
      this.deadline.stop()
      if (this.heartbeat) clearInterval(this.heartbeat)
      this.heartbeat = null
      try { this.snapshot.git = await nightnovaGitSummary(workspace) }
      catch (error) { this.log('warning', '최종 Git 요약 실패: ' + errorText(error)) }
      if (failure) {
        this.snapshot.status = 'failed'
        this.snapshot.reason ??= failure
      } else if (this.stopping || !cleanEnd) {
        this.snapshot.status = 'paused'
        this.snapshot.reason ??= 'interrupted'
      } else {
        this.snapshot.status = 'completed'
      }
      this.snapshot.finishedAt = Date.now()
      try {
        this.snapshot.handoffPath = await writeNightnovaHandoff(this.state(), this.snapshot.git)
        await this.checkpointNow()
      } catch (error) {
        this.log('error', '최종 인계 저장 실패: ' + errorText(error))
      }
      this.stopping = false
      this.abort = null
      this.log('info', '실행 종료: ' + this.snapshot.status + ' / ' + (this.snapshot.reason ?? '-'))
    }
  }

  async exportHandoff(): Promise<NightnovaSnapshot> {
    if (this.snapshot.config.workspace) {
      try { this.snapshot.git = await nightnovaGitSummary(this.snapshot.config.workspace) }
      catch { /* Keep an earlier Git summary in a handoff when git is unavailable. */ }
    }
    this.snapshot.handoffPath = await writeNightnovaHandoff(this.state(), this.snapshot.git)
    await this.checkpointNow()
    return this.state()
  }

  async shutdown(): Promise<void> {
    if (!isNightnovaBusy(this.snapshot.status) && !this.loopPromise) {
      await this.saveTail.catch(() => undefined)
      return
    }
    await this.stop('app-quit')
    const running = this.loopPromise
    if (running) await Promise.race([
      running.catch(() => undefined),
      new Promise<void>((resolve) => setTimeout(resolve, 8_000))
    ])
    if (this.sessionId) {
      const sessionId = this.sessionId
      this.sessionId = null
      await Promise.race([
        killSession(sessionId).catch(() => undefined),
        new Promise<void>((resolve) => setTimeout(resolve, 2_000))
      ])
    }
    if (this.loopPromise) {
      this.snapshot.status = 'paused'
      this.snapshot.reason = 'app-quit'
      this.snapshot.finishedAt = Date.now()
      await this.checkpointNow().catch(() => undefined)
    }
  }

  async refreshGit(): Promise<NightnovaSnapshot> {
    if (this.snapshot.config.workspace) {
      this.snapshot.git = await nightnovaGitSummary(await resolveWorkspace(this.snapshot.config.workspace))
      this.notify()
    }
    return this.state()
  }
}
