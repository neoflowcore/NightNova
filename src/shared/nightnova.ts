// Nightnova contracts shared between the trusted main process and renderer.
// A snapshot is a UI projection, never a command to execute arbitrary shell.
export type NightnovaStatus = 'idle' | 'running' | 'stopping' | 'paused' | 'completed' | 'failed'
export type NightnovaTaskStatus = 'queued' | 'running' | 'done' | 'error' | 'review'
export type NightnovaAgent = 'codex' | 'claude-code'
export type NightnovaPermission = 'read-only' | 'workspace'
export type NightnovaValidationMode = 'none' | 'light' | 'full'

export interface NightnovaConfig {
  workspace: string | null
  agent: NightnovaAgent
  deadlineAt: number | null
  maxTurns: number
  maxRetries: number
  autoNext: boolean
  permission: NightnovaPermission
  validation: NightnovaValidationMode
}

export interface NightnovaTask {
  id: string
  instruction: string
  status: NightnovaTaskStatus
  attempts: number
  lastOutput: string
  lastError: string | null
  createdAt: number
  completedAt: number | null
  /** A source change is required for development tasks, not analysis-only tasks. */
  expectChanges?: boolean
  source?: 'manual' | 'template' | 'agent'
  evidence?: NightnovaChangeEvidence | null
}

export interface NightnovaChangeEvidence {
  fingerprint: string
  head: string
  dirtyFiles: number
  samplePaths: string[]
  capturedAt: number
}

export interface NightnovaTaskTemplate {
  id: string
  title: string
  instruction: string
  expectChanges: boolean
}

export interface NightnovaDoctorCheck {
  id: string
  ok: boolean
  label: string
  detail: string
  required: boolean
}

export interface NightnovaDoctor {
  checkedAt: number
  platform: string
  architecture: string
  workspace: string | null
  scripts: string[]
  checks: NightnovaDoctorCheck[]
}

export interface NightnovaLog {
  at: number
  type: 'info' | 'warning' | 'error' | 'gate'
  message: string
}

export interface NightnovaValidationResult {
  name: string
  ok: boolean
  skipped?: boolean
  exitCode: number | null
  output: string
  durationMs: number
}

export interface NightnovaGitSummary {
  head: string
  changes: string
  diffStat: string
}

export interface NightnovaSnapshot {
  version: 1
  status: NightnovaStatus
  config: NightnovaConfig
  tasks: NightnovaTask[]
  turns: number
  activeTaskId: string | null
  liveOutput: string
  reason: string | null
  startedAt: number | null
  finishedAt: number | null
  checkpointAt: number | null
  validations: NightnovaValidationResult[]
  git: NightnovaGitSummary | null
  handoffPath: string | null
  logs: NightnovaLog[]
  runId?: string | null
  lastActivityAt?: number | null
  doctor?: NightnovaDoctor | null
}

export const NIGHTNOVA_DEFAULT_CONFIG: NightnovaConfig = {
  workspace: null,
  agent: 'codex',
  deadlineAt: null,
  maxTurns: 40,
  maxRetries: 2,
  autoNext: true,
  permission: 'read-only',
  validation: 'light'
}

export function newNightnovaSnapshot(): NightnovaSnapshot {
  return {
    version: 1,
    status: 'idle',
    config: { ...NIGHTNOVA_DEFAULT_CONFIG },
    tasks: [],
    turns: 0,
    activeTaskId: null,
    liveOutput: '',
    reason: null,
    startedAt: null,
    finishedAt: null,
    checkpointAt: null,
    validations: [],
    git: null,
    handoffPath: null,
    logs: [],
    runId: null,
    lastActivityAt: null,
    doctor: null
  }
}

export function isNightnovaBusy(status: NightnovaStatus): boolean {
  return status === 'running' || status === 'stopping'
}

export function nightnovaProgress(state: NightnovaSnapshot): number {
  if (!state.tasks.length) return 0
  const done = state.tasks.filter((task) => task.status === 'done').length
  return Math.round((done / state.tasks.length) * 100)
}
