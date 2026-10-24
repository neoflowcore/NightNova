import { app, Notification, webContents, type BrowserWindow, type WebContents } from 'electron'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  DEFAULT_CHAT_WATCH_CONFIG, createChatWatchSnapshot,
  type ChatWatchConfig, type ChatWatchDomObservation, type ChatWatchSnapshot
} from '../../shared/chatgpt-watch'
import { isChatGptConversation, sameConversation, decideChatWatch } from './policy'
import { CHAT_WATCH_INSPECT_SCRIPT, chatWatchSubmitScript } from './dom'

const POLL_INTERVAL_MS = 30_000
const MAX_INSPECT_TEXT = 4000

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T }

function fingerprint(page: ChatWatchDomObservation): string {
  return createHash('sha256')
    .update(String(page.assistantCount) + ':' + page.lastAssistantText.slice(-MAX_INSPECT_TEXT))
    .digest('hex')
}

function getSavePath(storageKey: string): string {
  const filename = storageKey === 'default' ? 'chatgpt-watch-v1.json' : 'chatgpt-watch-' + storageKey + '.json'
  return path.join(app.getPath('userData'), 'nightnova', filename)
}

export class ChatGptConversationWatch {
  private stateData: ChatWatchSnapshot = createChatWatchSnapshot()
  private timer: ReturnType<typeof setInterval> | null = null
  private busy = false
  private starting: Promise<void> | null = null
  private saving: Promise<void> = Promise.resolve()
  private assistantKey = ''
  private userCount = 0
  private stableChecks = 0

  constructor(
    private readonly mainWindow: () => BrowserWindow | null,
    private readonly onUpdate: (snapshot: ChatWatchSnapshot) => void,
    private readonly storageKey: string = 'default',
    /** Only submit from the currently displayed primary tab. Hidden tabs may be inspected. */
    private readonly maySendFromTab: (webContentsId: number) => boolean = () => true
  ) {}

  state(): ChatWatchSnapshot { return clone(this.stateData) }
  private notify(): void { this.onUpdate(this.state()) }

  private addLog(level: 'info' | 'warning' | 'action', message: string): void {
    this.stateData.logs.push({ at: Date.now(), level, message: message.slice(0, 240) })
    this.stateData.logs = this.stateData.logs.slice(-70)
    this.notify()
  }

  initialize(): Promise<void> {
    if (!this.starting) {
      this.starting = (async () => {
        try {
          const raw = await readFile(getSavePath(this.storageKey), 'utf8')
          if (raw.length > 25_000) throw new Error('설정 크기 제한 초과')
          const saved = JSON.parse(raw) as { config?: Partial<ChatWatchConfig> }
          if (saved && saved.config) this.stateData.config = this.validateConfig(saved.config)
          // Never resume automatic web actions after an app restart, even if a
          // session was active when the process crashed.
          this.stateData.status = 'paused'
          this.stateData.reason = '앱을 다시 시작했습니다. 현재 ChatGPT 대화에서 수동으로 감독을 재시작하세요.'
          this.addLog('info', '저장된 감독 설정을 복구했습니다. 자동 실행은 하지 않습니다.')
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            this.addLog('warning', '감독 설정 복원 실패. 기본 설정으로 시작합니다.')
          }
        }
      })()
    }
    return this.starting
  }

  private validateConfig(patch: Partial<ChatWatchConfig>): ChatWatchConfig {
    const current = this.stateData.config
    const prompt = typeof patch.resumePrompt === 'string' ? patch.resumePrompt.trim() : current.resumePrompt
    if (!prompt || prompt.length > 3500) throw new Error('재개 프롬프트를 1~3500자로 설정하세요.')
    return {
      intervalMinutes: patch.intervalMinutes === 30 ? 30 :
        patch.intervalMinutes === 10 ? 10 : current.intervalMinutes,
      maxAutoMessages: typeof patch.maxAutoMessages === 'number' && Number.isFinite(patch.maxAutoMessages)
        ? Math.max(1, Math.min(24, Math.floor(patch.maxAutoMessages))) : current.maxAutoMessages,
      resumePrompt: prompt,
      stopOn: {
        login: typeof patch.stopOn?.login === 'boolean'
          ? patch.stopOn.login : current.stopOn.login,
        approval: typeof patch.stopOn?.approval === 'boolean'
          ? patch.stopOn.approval : current.stopOn.approval,
        manualVerification: typeof patch.stopOn?.manualVerification === 'boolean'
          ? patch.stopOn.manualVerification : current.stopOn.manualVerification,
        payment: typeof patch.stopOn?.payment === 'boolean'
          ? patch.stopOn.payment : current.stopOn.payment
      }
    }
  }

  private persist(): Promise<void> {
    const data = JSON.stringify({
      version: 1,
      // Only user-authored settings persist. Never store conversation content,
      // cookies, ChatGPT auth tokens, last message hashes or browser passwords.
      config: this.stateData.config,
      savedAt: Date.now()
    }, null, 2)
    this.saving = this.saving.catch(() => undefined).then(async () => {
      const target = getSavePath(this.storageKey)
      await mkdir(path.dirname(target), { recursive: true, mode: 0o700 })
      const tmp = target + '-' + randomUUID() + '.tmp'
      await writeFile(tmp, data, { encoding: 'utf8', mode: 0o600 })
      await rename(tmp, target)
    })
    return this.saving
  }

  async configure(patch: Partial<ChatWatchConfig>): Promise<ChatWatchSnapshot> {
    if (this.stateData.status === 'watching') throw new Error('감독 중에는 설정을 바꿀 수 없습니다.')
    this.stateData.config = this.validateConfig(patch ?? {})
    await this.persist()
    this.notify()
    return this.state()
  }

  private guest(id: number): WebContents {
    const win = this.mainWindow()
    if (!win || win.isDestroyed() || !Number.isSafeInteger(id) || id <= 0) {
      throw new Error('유효한 ChatGPT 브라우저 탭을 선택하세요.')
    }
    const guest = webContents.fromId(id)
    if (!guest || guest.isDestroyed() || guest.getType() !== 'webview' ||
        guest.hostWebContents?.id !== win.webContents.id) {
      throw new Error('NightNova 내장 브라우저의 실제 ChatGPT 탭만 감독할 수 있습니다.')
    }
    return guest
  }

  private activeGuest(): WebContents {
    if (!this.stateData.webContentsId) throw new Error('감독 대상 ChatGPT 탭이 없습니다.')
    const wc = this.guest(this.stateData.webContentsId)
    if (!this.stateData.targetUrl || !sameConversation(wc.getURL(), this.stateData.targetUrl)) {
      throw new Error('감독 대상 대화가 변경되거나 이동했습니다. 다시 연결하세요.')
    }
    return wc
  }

  private async inspectGuest(guest: WebContents): Promise<ChatWatchDomObservation> {
    if (!isChatGptConversation(guest.getURL())) throw new Error('ChatGPT의 기존 대화 주소가 아닙니다.')
    const raw: unknown = await guest.executeJavaScript(CHAT_WATCH_INSPECT_SCRIPT, true)
    if (!raw || typeof raw !== 'object') throw new Error('대화 화면을 읽을 수 없습니다.')
    const value = raw as ChatWatchDomObservation
    if (!sameConversation(value.url, guest.getURL())) throw new Error('대화 주소가 읽는 도중 변경됐습니다.')
    if (!Number.isSafeInteger(value.assistantCount) || !Number.isSafeInteger(value.userCount) ||
        typeof value.lastAssistantText !== 'string') throw new Error('ChatGPT 화면 구조가 변경됐습니다.')
    return value
  }

  private updatePage(observation: ChatWatchDomObservation): void {
    const { assistantCount, userCount, generating, online, composerReady, hasDraft } = observation
    this.stateData.page = {
      assistantCount, userCount, generating, online, composerReady, hasDraft
    }
    this.stateData.lastCheckAt = Date.now()
    this.notify()
  }

  async start(id: number): Promise<ChatWatchSnapshot> {
    if (this.stateData.status === 'watching') throw new Error('이미 감독 중입니다.')
    const guest = this.guest(id)
    const url = guest.getURL()
    if (!isChatGptConversation(url)) {
      throw new Error('ChatGPT에서 기존 대화를 열어주세요. 새 대화 홈 화면은 자동화하지 않습니다.')
    }
    const page = await this.inspectGuest(guest)
    if (!page.assistantCount || page.needsLogin || page.challenge) {
      throw new Error('로그인된 ChatGPT 대화에서 한 번 이상 답변이 오간 다음 감독을 시작하세요.')
    }
    this.stopTimer()
    this.stateData.status = 'watching'
    this.stateData.reason = null
    this.stateData.webContentsId = id
    this.stateData.targetUrl = url
    this.stateData.startedAt = Date.now()
    this.stateData.lastProgressAt = Date.now()
    this.stateData.lastSentAt = null
    this.stateData.lastCheckAt = Date.now()
    this.stateData.sentCount = 0
    this.stateData.attemptCount = 0
    this.stateData.awaitingResponse = false
    this.assistantKey = fingerprint(page)
    this.userCount = page.userCount
    this.stableChecks = 0
    this.updatePage(page)
    await this.persist()
    this.timer = setInterval(() => { void this.check() }, POLL_INTERVAL_MS)
    this.timer.unref?.()
    this.addLog('info', 'ChatGPT 대화 감독 시작. 자동 재개 간격: ' +
      this.stateData.config.intervalMinutes + '분. 선택된 요청 조건만 중단합니다. 실제 로그인·인증 화면은 반드시 사용자 처리가 필요합니다.')
    return this.state()
  }

  private stopTimer(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  private async humanGate(reason: string): Promise<void> {
    this.stopTimer()
    this.stateData.status = 'needs-human'
    this.stateData.reason = reason
    this.addLog('warning', reason)
    const win = this.mainWindow()
    if (win && !win.isDestroyed()) win.flashFrame(true)
    if (Notification.isSupported()) {
      new Notification({
        title: 'NightNova · 직접 확인 필요',
        body: 'ChatGPT 감독을 멈췄습니다. NightNova의 감독 패널을 확인하세요.'
      }).show()
    }
    await this.persist().catch(() => undefined)
  }

  async pause(): Promise<ChatWatchSnapshot> {
    this.stopTimer()
    this.stateData.status = 'paused'
    this.stateData.reason = '사용자가 ChatGPT 대화 감독을 일시정지했습니다.'
    this.addLog('info', '감독을 일시정지했습니다. 자동 메시지를 보내지 않습니다.')
    await this.persist()
    return this.state()
  }

  async stop(): Promise<ChatWatchSnapshot> {
    this.stopTimer()
    this.stateData.status = 'off'
    this.stateData.reason = null
    this.stateData.targetUrl = null
    this.stateData.webContentsId = null
    this.stateData.awaitingResponse = false
    this.addLog('info', 'ChatGPT 감독을 종료했습니다.')
    await this.persist()
    return this.state()
  }

  // Read-only immediate diagnosis; unlike "Check after idle" this NEVER
  // submits a prompt. Useful for testing an unfamiliar ChatGPT UI version.
  async inspect(id: number): Promise<ChatWatchSnapshot> {
    const page = await this.inspectGuest(this.guest(id))
    this.updatePage(page)
    this.addLog('info', '대화 화면 진단: 응답 ' + page.assistantCount +
      '개, 생성 중=' + String(page.generating) + ', 입력창=' + String(page.composerReady))
    return this.state()
  }

  async check(): Promise<void> {
    if (this.busy || this.stateData.status !== 'watching') return
    this.busy = true
    try {
      const wc = this.activeGuest()
      const page = await this.inspectGuest(wc)
      this.updatePage(page)
      const key = fingerprint(page)
      const assistantChanged = key !== this.assistantKey
      const userChanged = page.userCount !== this.userCount
      if (assistantChanged || userChanged) {
        this.assistantKey = key
        this.userCount = page.userCount
        this.stateData.lastProgressAt = Date.now()
        this.stableChecks = 0
        if (assistantChanged) this.stateData.awaitingResponse = false
      } else this.stableChecks++

      const decision = decideChatWatch(page, {
        now: Date.now(),
        lastProgressAt: this.stateData.lastProgressAt ?? Date.now(),
        intervalMinutes: this.stateData.config.intervalMinutes,
        sentCount: this.stateData.sentCount,
        maxAutoMessages: this.stateData.config.maxAutoMessages,
        awaitingResponse: this.stateData.awaitingResponse,
        stableObservations: this.stableChecks,
        stopOn: this.stateData.config.stopOn
      })
      if (decision.type === 'needs-human') {
        await this.humanGate(decision.reason)
        return
      }
      // Inspection is background-safe. Real prompt submission is intentionally
      // tied to the visible tab, so the operator can WATCH the macro work.
      // The UI automatically rotates visible ChatGPT projects every 15/30/60s.
      if (decision.type === 'send' && this.maySendFromTab(wc.id)) {
        await this.sendOnce(wc, page)
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      await this.humanGate('대화 상태 판독 실패: ' + reason.slice(0, 180))
    } finally {
      this.busy = false
    }
  }

  private async sendOnce(wc: WebContents, expected: ChatWatchDomObservation): Promise<void> {
    // Two-stage safety gate: inspect again immediately before doing anything
    // irreversible. An assistant reply or a user draft invalidates the send.
    if (!this.maySendFromTab(wc.id)) return
    const fresh = await this.inspectGuest(this.activeGuest())
    if (!this.maySendFromTab(wc.id) || fingerprint(fresh) !== fingerprint(expected) ||
        fresh.userCount !== expected.userCount || fresh.generating ||
        fresh.hasDraft || fresh.needsLogin || fresh.challenge || !fresh.online ||
        !fresh.composerReady) return

    // Persist intent first. If the application crashes after clicking Send,
    // restart is always paused rather than silently transmitting it again.
    this.stateData.attemptCount++
    this.addLog('action', '재개 프롬프트 전송 시도 #' + this.stateData.attemptCount)
    await this.persist()

    const raw: unknown = await wc.executeJavaScript(
      chatWatchSubmitScript(this.stateData.config.resumePrompt), true
    )
    const outcome = raw as { clicked?: boolean; reason?: string } | null
    if (!outcome?.clicked) {
      await this.humanGate('전송을 확인하지 못했습니다(' +
        String(outcome?.reason ?? 'unknown') + '). 자동 재시도하지 않습니다.')
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 1200))
    const confirmation = await this.inspectGuest(this.activeGuest())
    if (confirmation.userCount <= expected.userCount) {
      await this.humanGate('ChatGPT에 전송 버튼은 눌렀지만 메시지 도착을 확인하지 못했습니다. 중복 전송을 방지하려고 멈춥니다.')
      return
    }
    this.stateData.sentCount++
    this.stateData.lastSentAt = Date.now()
    this.stateData.lastProgressAt = Date.now()
    this.stateData.awaitingResponse = true
    this.userCount = confirmation.userCount
    this.stableChecks = 0
    this.updatePage(confirmation)
    this.addLog('action', '재개 프롬프트 전송 확인 #' + this.stateData.sentCount +
      '. 다음 ChatGPT 응답을 기다립니다.')
    await this.persist()
  }

  close(): void {
    this.stopTimer()
    this.stateData.status = 'paused'
    this.stateData.webContentsId = null
    this.stateData.targetUrl = null
  }
}
