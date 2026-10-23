import { randomUUID } from 'node:crypto'
import type { RequestPermissionRequest, SessionNotification } from '@agentclientprotocol/sdk'
import { detectAgents } from '../acp-detect'
import { catalogAgent } from '../agent-catalog'
import { cancelSession, killSession, promptSession, spawnSession } from '../agent-router'
import { runAsAgent } from '../chrome-cdp'
import type { NightnovaConfig, NightnovaSnapshot, NightnovaTask } from '../../shared/nightnova'
import { isNightnovaBusy, newNightnovaSnapshot, NIGHTNOVA_DEFAULT_CONFIG } from '../../shared/nightnova'
import { NightnovaDeadline, type DeadlineGate } from './deadline'
import { nightnovaPermission, resolveWorkspace } from './security'
import { loadNightnovaCheckpoint, saveNightnovaCheckpoint, writeNightnovaHandoff } from './storage'
import { nightnovaGitSummary, runNightnovaValidation } from './system'

const MAX_TASKS = 40
const MAX_TASK_LENGTH = 4000

function taskFrom(instruction: string): NightnovaTask {
  const cleaned = instruction.trim()
  if (!cleaned || cleaned.length > MAX_TASK_LENGTH) throw new Error('작업 지시를 1~4000자로 작성하세요.')
  return {
    id: randomUUID(), instruction: cleaned, status: 'queued', attempts: 0,
    lastOutput: '', lastError: null, createdAt: Date.now(), completedAt: null
  }
}

function nextTaskFrom(output: string): string | null {
  // Agent-suggested next steps are intentionally opt-in via config.autoNext,
  // limited to one at a time, bounded by the same global turn and queue caps.
  const line = output.match(/^NIGHTNOVA_NEXT_TASK:\s*(.+)$/mi)?.[1]?.trim()
  return line && line.length >= 10 && line.length <= 800 ? line : null
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
    // workspace is never accepted through renderer config. Only the OS folder
    // picker in main can change it.
  }
}

function copySnapshot(snapshot: NightnovaSnapshot): NightnovaSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as NightnovaSnapshot
}

export class NightnovaCoordinator {
  private snapshot: NightnovaSnapshot = newNightnovaSnapshot()
  private sessionId: string | null = null
  private loopPromise: Promise<void> | null = null
  private stopping = false
  private abort: AbortController | null = null
  private lastStreamAt = 0
  private readonly deadline = new NightnovaDeadline((gate) => this.onDeadline(gate))

  constructor(private readonly onUpdate: (snapshot: NightnovaSnapshot) => void) {}

  state(): NightnovaSnapshot { return copySnapshot(this.snapshot) }

  private notify(): void { this.onUpdate(this.state()) }

  private log(type: 'info' | 'warning' | 'error' | 'gate', message: string): void {
    this.snapshot.logs.push({ at: Date.now(), type, message: message.slice(0, 500) })
    if (this.snapshot.logs.length > 100) this.snapshot.logs = this.snapshot.logs.slice(-100)
    this.notify()
  }

  private assertIdle(): void {
    if (isNightnovaBusy(this.snapshot.status) || this.loopPromise) {
      throw new Error('실행 중에는 설정을 변경할 수 없습니다. 먼저 중지하세요.')
    }
  }

  configure(patch: Partial<NightnovaConfig>): NightnovaSnapshot {
    this.assertIdle()
    this.snapshot.config = sanitizeConfig(patch, this.snapshot.config)
    this.notify()
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
    this.snapshot.config.workspace = await resolveWorkspace(selected.filePaths[0])
    this.snapshot.git = await nightnovaGitSummary(this.snapshot.config.workspace)
    this.log('info', 'Git 작업 폴더가 선택되었습니다. 외부에 전송하지 않습니다.')
    return this.state()
  }

  enqueue(instruction: string): NightnovaSnapshot {
    this.assertIdle()
    if (this.snapshot.tasks.length >= MAX_TASKS) throw new Error('작업 큐는 최대 40개입니다.')
    this.snapshot.tasks.push(taskFrom(instruction))
    this.log('info', '새 작업을 대기열에 추가했습니다.')
    return this.state()
  }

  removeTask(id: string): NightnovaSnapshot {
    this.assertIdle()
    this.snapshot.tasks = this.snapshot.tasks.filter((task) => task.id !== id || task.status === 'done')
    this.notify()
    return this.state()
  }

  moveTask(id: string, delta: number): NightnovaSnapshot {
    this.assertIdle()
    const idx = this.snapshot.tasks.findIndex((task) => task.id === id)
    const next = idx + (delta < 0 ? -1 : 1)
    if (idx < 0 || next < 0 || next >= this.snapshot.tasks.length) return this.state()
    if (this.snapshot.tasks[idx].status === 'done' || this.snapshot.tasks[next].status === 'done') return this.state()
    const tasks = this.snapshot.tasks
    ;[tasks[idx], tasks[next]] = [tasks[next], tasks[idx]]
    this.notify()
    return this.state()
  }

  async checkpoint(): Promise<NightnovaSnapshot> {
    this.snapshot.checkpointAt = await saveNightnovaCheckpoint(this.state())
    this.notify()
    return this.state()
  }

  async restore(): Promise<NightnovaSnapshot> {
    this.assertIdle()
    const saved = await loadNightnovaCheckpoint()
    if (!saved) throw new Error('복구할 체크포인트가 없습니다.')
    // Never automatically restart after a crash. An interrupted turn may have
    // already edited files; the operator must inspect Git and press Start.
    const restored = newNightnovaSnapshot()
    restored.config = sanitizeConfig(saved.config, { ...NIGHTNOVA_DEFAULT_CONFIG })
    restored.config.workspace = typeof saved.config.workspace === 'string' ? saved.config.workspace : null
    restored.tasks = saved.tasks.map((task) => ({
      ...task, status: task.status === 'running' ? 'queued' : task.status
    }))
    restored.turns = Number.isSafeInteger(saved.turns) ? Math.max(0, saved.turns) : 0
    restored.status = 'paused'
    restored.reason = '수동 복구: Git 변경 사항을 확인한 후 시작하세요.'
    restored.checkpointAt = saved.checkpointAt
    restored.startedAt = saved.startedAt
    restored.logs = Array.isArray(saved.logs) ? saved.logs.slice(-100) : []
    restored.validations = Array.isArray(saved.validations) ? saved.validations : []
    this.snapshot = restored
    this.log('warning', restored.reason)
    return this.state()
  }

  async reset(): Promise<NightnovaSnapshot> {
    this.assertIdle()
    const config = this.snapshot.config
    this.snapshot = newNightnovaSnapshot()
    this.snapshot.config = { ...config }
    this.notify()
    await this.checkpoint()
    return this.state()
  }

  private onDeadline(gate: DeadlineGate): void {
    switch (gate) {
      case 'prepare':
        this.log('gate', 'T-5분: 새 작업 착수 금지, 현재 작업 후 인계 준비.')
        break
      case 'cancel':
        this.log('gate', 'T-30초: 진행 중인 작업 취소 요청.')
        void this.stop('deadline-cancel')
        break
      case 'kill':
        this.log('gate', 'T-25초: 에이전트 프로세스 강제 종료.')
        if (this.sessionId) void killSession(this.sessionId).catch(() => null)
        break
      case 'expired':
        this.log('gate', '마감 시각 도달: 모든 작업 종료.')
        void this.stop('deadline-expired')
        break
    }
  }

  async start(): Promise<NightnovaSnapshot> {
    this.assertIdle()
    const config = this.snapshot.config
    if (!config.workspace) throw new Error('Git 작업 폴더를 선택하세요.')
    if (!config.deadlineAt || config.deadlineAt - Date.now() <= 300_000) {
      throw new Error('마감 시각을 현재보다 최소 5분 뒤로 지정하세요.')
    }
    if (!this.snapshot.tasks.some((task) => task.status === 'queued')) throw new Error('실행할 대기 작업이 없습니다.')
    if (this.snapshot.turns >= config.maxTurns) throw new Error('턴 상한에 도달했습니다. 새 실행을 시작하세요.')
    config.workspace = await resolveWorkspace(config.workspace)
    this.stopping = false
    this.abort = new AbortController()
    this.snapshot.status = 'running'
    this.snapshot.startedAt ??= Date.now()
    this.snapshot.finishedAt = null
    this.snapshot.reason = null
    this.snapshot.handoffPath = null
    this.snapshot.validations = []
    this.deadline.start(config.deadlineAt)
    this.log('info', `개발 시작: ${config.agent} / 턴 제한 ${config.maxTurns} / 검증은 마지막에 1회`)
    await this.checkpoint()
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
    this.log('warning', `중단 요청: ${reason}`)
    if (this.sessionId) {
      void cancelSession(this.sessionId).catch(() => null)
      // A stuck ACP turn must not hold the application open indefinitely.
      const id = this.sessionId
      setTimeout(() => {
        if (this.sessionId === id) void killSession(id).catch(() => null)
      }, 5_000).unref?.()
    }
    return this.state()
  }

  private async runLoop(): Promise<void> {
    let failure: string | null = null
    const config = this.snapshot.config
    const workspace = config.workspace!
    let cleanEnd = false
    try {
      const agent = catalogAgent(config.agent)
      if (!agent || agent.provider !== 'acp') throw new Error('지원되지 않는 ACP 에이전트입니다.')
      const [probe] = await detectAgents([{ command: agent.command, fallbackBins: agent.fallbackBins }])
      if (!probe?.resolvedPath) throw new Error(`${agent.command} 실행 파일을 찾지 못했습니다. 설치와 로그인을 확인하세요.`)
      if (this.stopping) return
      const spawned = await spawnSession({
        id: agent.id, command: probe.resolvedPath, args: agent.args
      }, workspace)
      this.sessionId = spawned.sessionId
      this.log('info', `ACP 세션 연결됨: ${agent.id}`)
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
        task.status = 'running'
        task.attempts++
        this.snapshot.turns++
        this.snapshot.activeTaskId = task.id
        this.snapshot.liveOutput = ''
        this.notify()
        await this.checkpoint()
        let output = ''
        try {
          const prompt = [
            'You are implementing one bounded development task inside the selected Git repository.',
            'Work only inside the provided workspace. Preserve existing source and user changes.',
            'Prioritize implementing real functionality; avoid repeated full regression suites.',
            'Do not git commit, push, merge, deploy, or create GitHub Actions runs.',
            'Use the minimum necessary checks; a single consolidated validation gate runs later.',
            'At the end, summarize files changed and remaining blockers.',
            config.autoNext
              ? 'If clearly within the original scope, suggest exactly one next development task on its own line as NIGHTNOVA_NEXT_TASK: <task>. Never suggest unrelated work.'
              : 'Do not invent new tasks.',
            '',
            'Current task:',
            task.instruction
          ].join('\n')
          const result = await runAsAgent(() => promptSession(
            this.sessionId!, prompt,
            (notification: SessionNotification) => {
              const update = notification.update as { sessionUpdate?: string; content?: { type?: string; text?: string } }
              if (update?.sessionUpdate === 'agent_message_chunk' && update.content?.type === 'text') {
                output = (output + (update.content.text ?? '')).slice(-12_000)
                this.snapshot.liveOutput = output.slice(-1800)
                if (Date.now() - this.lastStreamAt > 450) {
                  this.lastStreamAt = Date.now()
                  this.notify()
                }
              }
            },
            (request: RequestPermissionRequest) =>
              Promise.resolve(nightnovaPermission(request, config.permission, workspace))
          ))
          if (this.stopping) {
            task.status = 'queued'
            task.lastError = '중단으로 인해 완료 확인되지 않음. Git 변경 사항 확인 필요.'
            break
          }
          if (result.stopReason !== 'end_turn') {
            throw new Error(`ACP stop reason: ${result.stopReason}`)
          }
          task.status = 'done'
          task.completedAt = Date.now()
          task.lastOutput = output.slice(-2000)
          task.lastError = null
          this.log('info', `턴 ${this.snapshot.turns}: ACP 응답 완료 (실제 코드 변경은 Git에서 확인 필요).`)
          if (config.autoNext && this.snapshot.tasks.length < MAX_TASKS && this.snapshot.turns < config.maxTurns) {
            const suggestion = nextTaskFrom(output)
            if (suggestion && !this.snapshot.tasks.some((old) =>
              old.instruction.trim().toLowerCase() === suggestion.toLowerCase()
            )) {
              this.snapshot.tasks.push(taskFrom(suggestion))
              this.log('info', '에이전트가 제안한 후속 작업 1개를 대기열에 추가했습니다.')
            }
          }
        } catch (error) {
          task.lastError = error instanceof Error ? error.message : String(error)
          if (this.stopping) {
            task.status = 'queued'
            break
          }
          if (task.attempts <= config.maxRetries && this.deadline.canStartTurn()) {
            task.status = 'queued'
            this.log('warning', `작업 실패, 제한된 재시도 ${task.attempts}/${config.maxRetries}: ${task.lastError}`)
          } else {
            task.status = 'error'
            failure = task.lastError
            this.snapshot.reason = 'task-failed'
            this.log('error', `재시도 한도 도달: ${failure}`)
            break
          }
        } finally {
          this.snapshot.activeTaskId = null
          this.snapshot.liveOutput = ''
          await this.checkpoint().catch((e) => this.log('error', `체크포인트 오류: ${String(e)}`))
        }
      }
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error)
      this.snapshot.reason = 'session-failed'
      this.log('error', failure)
    } finally {
      // Deadline guard also governs validation. Never let a long test steal
      // the final seconds needed to stop the agent and write the handoff.
      if (this.sessionId) {
        const id = this.sessionId
        this.sessionId = null
        await killSession(id).catch((e) => this.log('warning', `ACP 종료 실패: ${String(e)}`))
      }
      if (cleanEnd && !failure && !this.stopping && this.deadline.canValidate() && this.abort && !this.abort.signal.aborted) {
        if (config.validation !== 'none') this.log('info', '최종 통합 검증 1회 시작.')
        this.snapshot.validations = await runNightnovaValidation(workspace, config.validation, this.abort.signal)
        if (this.snapshot.validations.some((check) => !check.ok)) {
          failure = '마지막 통합 검증이 실패했습니다. 결과를 인계서에서 확인하세요.'
          this.snapshot.reason = 'validation-failed'
        }
      }
      this.deadline.stop()
      if (config.workspace) {
        this.snapshot.git = await nightnovaGitSummary(config.workspace)
      }
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
        await this.checkpoint()
      } catch (error) {
        this.log('error', `인계 저장 실패: ${String(error)}`)
      }
      this.stopping = false
      this.abort = null
      this.log('info', `실행 종료: ${this.snapshot.status} / ${this.snapshot.reason ?? '-'}`)
    }
  }

  async shutdown(): Promise<void> {
    if (!isNightnovaBusy(this.snapshot.status) && !this.loopPromise) return
    await this.stop('app-quit')
    const running = this.loopPromise
    if (running) {
      await Promise.race([
        running.catch(() => undefined),
        new Promise<void>((resolve) => setTimeout(resolve, 9_000))
      ])
    }
    // A deadline or hung agent must never keep the Electron app alive.
    if (this.sessionId) {
      await killSession(this.sessionId).catch(() => undefined)
      this.sessionId = null
    }
    if (this.loopPromise) {
      this.snapshot.status = 'paused'
      this.snapshot.reason = 'app-quit'
      this.snapshot.finishedAt = Date.now()
      await this.checkpoint().catch(() => undefined)
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
