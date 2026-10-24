// NightNova's primary product contract: supervise an existing ChatGPT web
// conversation. This uses the logged-in browser session, NOT Codex ACP, an
// OpenAI API key, GitHub local clones or an independent model subscription.
export type ChatWatchStatus = 'off' | 'watching' | 'paused' | 'needs-human'
export type ChatWatchLogLevel = 'info' | 'warning' | 'action'

/** All stored durations are integer SECONDS; UI may express seconds, minutes or hours. */
export type ChatWatchTimeUnit = 'seconds' | 'minutes' | 'hours'
export type ChatWatchTimeKind = 'rotation' | 'check' | 'resume'
export const CHAT_WATCH_INTERVAL_LIMITS: Record<ChatWatchTimeKind, { min: number; max: number }> = {
  rotation: { min: 5, max: 86_400 },
  check: { min: 5, max: 86_400 },
  resume: { min: 15, max: 604_800 }
}
export function assertChatWatchSeconds(value: unknown, kind: ChatWatchTimeKind): number {
  const limits = CHAT_WATCH_INTERVAL_LIMITS[kind]
  if (typeof value !== 'number' || !Number.isSafeInteger(value) ||
      value < limits.min || value > limits.max) {
    throw new Error(kind + ' 간격은 ' + limits.min + '~' + limits.max + '초 사이의 정수여야 합니다.')
  }
  return value
}
export function intervalInputFromSeconds(seconds: number): { amount: number; unit: ChatWatchTimeUnit } {
  if (seconds % 3600 === 0) return { amount: seconds / 3600, unit: 'hours' }
  if (seconds % 60 === 0) return { amount: seconds / 60, unit: 'minutes' }
  return { amount: seconds, unit: 'seconds' }
}
export function secondsFromIntervalInput(amount: number, unit: ChatWatchTimeUnit): number {
  const multiplier = { seconds: 1, minutes: 60, hours: 3600 }[unit]
  if (!Number.isFinite(amount) || amount <= 0) return NaN
  return Math.round(amount * multiplier)
}

export interface ChatWatchRotation {
  /** Automatically show the work taking place in each monitored browser tab. */
  enabled: boolean
  intervalSeconds: number
}

export interface ChatWatchDashboard {
  version: 2
  rotation: ChatWatchRotation
  sessions: Array<{ webContentsId: number; url: string; snapshot: ChatWatchSnapshot }>
  errors: string[]
}

/** Visible tabs follow the user-facing tab strip order, not watch-start order. */
export function nextWatchedTabId(currentTabId: string, orderedIds: string[]): string | null {
  if (orderedIds.length === 0) return null
  const index = orderedIds.indexOf(currentTabId)
  return orderedIds[(index + 1) % orderedIds.length]
}

export interface ChatWatchStopConditions {
  /** Stop on a textual request to sign in (not a real login page). */
  login: boolean
  /** Stop when the assistant asks the operator to approve something. */
  approval: boolean
  /** Stop when the assistant asks for manual testing or verification. */
  manualVerification: boolean
  /** A payment or paid purchase must never be automatically approved. */
  payment: boolean
}

export interface ChatWatchConfig {
  /** Idle duration before a potential resume; independent per conversation. */
  intervalSeconds: number
  /** Read-only status polling interval; independent per conversation. */
  checkIntervalSeconds: number
  /** Maximum messages sent in one explicitly armed supervision session. */
  maxAutoMessages: number
  /** User-editable text; never inferred from website-provided instructions. */
  resumePrompt: string
  stopOn: ChatWatchStopConditions
}

export interface ChatWatchLog {
  at: number
  level: ChatWatchLogLevel
  message: string
}

export interface ChatWatchPageStatus {
  assistantCount: number
  userCount: number
  generating: boolean
  online: boolean
  composerReady: boolean
  hasDraft: boolean
}

export interface ChatWatchSnapshot {
  version: 1
  status: ChatWatchStatus
  config: ChatWatchConfig
  targetUrl: string | null
  webContentsId: number | null
  startedAt: number | null
  lastCheckAt: number | null
  lastProgressAt: number | null
  lastSentAt: number | null
  sentCount: number
  attemptCount: number
  awaitingResponse: boolean
  reason: string | null
  page: ChatWatchPageStatus | null
  logs: ChatWatchLog[]
}

export interface ChatWatchDomObservation extends ChatWatchPageStatus {
  url: string
  lastAssistantText: string
  needsLogin: boolean
  challenge: boolean
  alertText: string
}

export const DEFAULT_CHAT_WATCH_PROMPT = [
  '앞서 이 대화에서 진행하던 개발 작업을 이어서 진행해.',
  '마지막 작업 상태와 GitHub 반영 내역을 먼저 확인하고, 연결이 끊겼다면 안전하게 복구해.',
  '이미 끝난 작업을 중복 실행하지 말고 기능 구현을 우선해.',
  '불필요한 전체 회귀 검증, 작은 커밋 반복, GitHub Actions 낭비를 피하고 큰 작업 단위로 묶어 진행해.',
  '로그인, 승인, 수기 검증 요청에 대해서는 설정된 중단 조건을 따르되 실제 수행하지 않은 작업을 완료했다고 주장하지 마.',
  '로그인이나 수기 검증이 필요한 부분은 미검증으로 기록하고, 가능한 다른 구현 작업부터 계속해.',
  '결제, 새로운 권한 부여, 보안 인증을 우회하거나 임의로 수행하지 마. 이미 답변한 질문을 다시 묻지 마.'
].join(' ')

export const DEFAULT_CHAT_WATCH_ROTATION: ChatWatchRotation = { enabled: true, intervalSeconds: 30 }

export const DEFAULT_CHAT_WATCH_CONFIG: ChatWatchConfig = {
  intervalSeconds: 600,
  checkIntervalSeconds: 30,
  maxAutoMessages: 12,
  resumePrompt: DEFAULT_CHAT_WATCH_PROMPT,
  stopOn: {
    login: false,
    approval: false,
    manualVerification: false,
    payment: true
  }
}

export function createChatWatchSnapshot(): ChatWatchSnapshot {
  return {
    version: 1,
    status: 'off',
    config: { ...DEFAULT_CHAT_WATCH_CONFIG, stopOn: { ...DEFAULT_CHAT_WATCH_CONFIG.stopOn } },
    targetUrl: null,
    webContentsId: null,
    startedAt: null,
    lastCheckAt: null,
    lastProgressAt: null,
    lastSentAt: null,
    sentCount: 0,
    attemptCount: 0,
    awaitingResponse: false,
    reason: null,
    page: null,
    logs: []
  }
}
