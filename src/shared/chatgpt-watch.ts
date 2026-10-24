// NightNova's primary product contract: supervise an existing ChatGPT web
// conversation. This uses the logged-in browser session, NOT Codex ACP, an
// OpenAI API key, GitHub local clones or an independent model subscription.
export type ChatWatchStatus = 'off' | 'watching' | 'paused' | 'needs-human'
export type ChatWatchLogLevel = 'info' | 'warning' | 'action'

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
  /** Idle/stall threshold; a cheap read-only health check runs every 30 sec. */
  intervalMinutes: 10 | 30
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

export const DEFAULT_CHAT_WATCH_CONFIG: ChatWatchConfig = {
  intervalMinutes: 10,
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
    config: { ...DEFAULT_CHAT_WATCH_CONFIG },
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
