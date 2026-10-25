import { app, Notification, webContents, type BrowserWindow, type WebContents } from 'electron'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  createChatWatchSnapshot, assertChatWatchSeconds,
  type ChatWatchConfig, type ChatWatchDomObservation, type ChatWatchSnapshot
} from '../../shared/chatgpt-watch'
import { isChatGptConversation, sameConversation, decideChatWatch } from './policy'
import { CHAT_WATCH_INSPECT_SCRIPT, chatWatchPrepareScript, chatWatchCommitScript } from './dom'

const MAX_INSPECT_TEXT = 4000
const DOM_OBSERVATION_TIMEOUT_MS = 15_000

async function withDomTimeout<T>(read: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('ChatGPT 화면 판독 15초 제한시간 초과')), DOM_OBSERVATION_TIMEOUT_MS)
    timer.unref?.()
    read.then(
      value => { clearTimeout(timer); resolve(value) },
      error => { clearTimeout(timer); reject(error) }
    )
  })
}
function assertMaxAutoMessages(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > 24) {
    throw new Error('자동 재개 횟수는 1~24의 정수여야 합니다.')
  }
  return value
}

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
  /** Invalidate in-flight async checks after a Pause, Stop or Restart. */
  private epoch = 0

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
      const initializationEpoch = this.epoch
      this.starting = (async () => {
        try {
          const raw = await readFile(getSavePath(this.storageKey), 'utf8')
          if (raw.length > 25_000) throw new Error('설정 크기 제한 초과')
          const saved = JSON.parse(raw) as { config?: Partial<ChatWatchConfig> }
          // A stop/pause during async disk read must not resurrect a stale
          // state or overwrite a newer operator action.
          if (initializationEpoch !== this.epoch) return
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
    // Load old saved intervalMinutes values without silently changing the user's
    // 10/30-minute setting when upgrading from NightNova 0.1.8.
    const legacy = patch as Partial<ChatWatchConfig> & { intervalMinutes?: number }
    const resume = patch.intervalSeconds ?? (
      typeof legacy.intervalMinutes === 'number' ? legacy.intervalMinutes * 60 : current.intervalSeconds
    )
    return {
      intervalSeconds: assertChatWatchSeconds(resume, 'resume'),
      checkIntervalSeconds: assertChatWatchSeconds(
        patch.checkIntervalSeconds ?? current.checkIntervalSeconds, 'check'
      ),
      maxAutoMessages: patch.maxAutoMessages === undefined ? current.maxAutoMessages :
        assertMaxAutoMessages(patch.maxAutoMessages),
      resumePrompt: prompt,
      stopOn: {
        login: typeof patch.stopOn?.login === 'boolean'
          ? patch.stopOn.login : current.stopOn.login,
        approval: typeof patch.stopOn?.approval === 'boolean'
          ? patch.stopOn.approval : current.stopOn.approval,
        manualVerification: typeof patch.stopOn?.manualVerification === 'boolean'
          ? patch.stopOn.manualVerification : current.stopOn.manualVerification,
        // Payment approval must not be delegated to an auto-resume prompt.
        payment: true
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
    const raw: unknown = await withDomTimeout(guest.executeJavaScript(CHAT_WATCH_INSPECT_SCRIPT, true))
    if (!raw || typeof raw !== 'object') throw new Error('대화 화면을 읽을 수 없습니다.')
    const value = raw as ChatWatchDomObservation
    if (!sameConversation(value.url, guest.getURL())) throw new Error('대화 주소가 읽는 도중 변경됐습니다.')
    if (!Number.isSafeInteger(value.assistantCount) || !Number.isSafeInteger(value.userCount) ||
        typeof value.lastAssistantText !== 'string' ||
        !['assistant', 'user', 'unknown'].includes(value.lastMessageRole ?? '')) {
      throw new Error('ChatGPT 화면 구조가 변경됐습니다.')
    }
    return value
  }

  private updatePage(observation: ChatWatchDomObservation): void {
    const { assistantCount, userCount, generating, online, composerReady, hasDraft, lastMessageRole } = observation
    this.stateData.page = {
      assistantCount, userCount, generating, online, composerReady, hasDraft, lastMessageRole
    }
    this.stateData.lastCheckAt = Date.now()
    this.notify()
  }

  async start(id: number): Promise<ChatWatchSnapshot> {
    if (this.stateData.status === 'watching') throw new Error('이미 감독 중입니다.')
    const requestedEpoch = this.epoch
    const guest = this.guest(id)
    const url = guest.getURL()
    if (!isChatGptConversation(url)) {
      throw new Error('ChatGPT에서 기존 대화를 열어주세요. 새 대화 홈 화면은 자동화하지 않습니다.')
    }
    const page = await this.inspectGuest(guest)
    // A Stop/Pause or concurrent Start during DOM inspection invalidates this request.
    // Epoch alone is sufficient; checking a narrowed status triggers TS2367.
    if (this.epoch !== requestedEpoch) {
      throw new Error('감독 준비 중 상태가 변경됐습니다. 현재 상태를 다시 확인하세요.')
    }
    if (!page.assistantCount || page.needsLogin || page.challenge ||
        page.lastMessageRole !== 'assistant' && page.lastMessageRole !== 'user') {
      throw new Error('로그인된 ChatGPT 대화에서 한 번 이상 답변이 오간 다음 감독을 시작하세요.')
    }
    this.stopTimer()
    const armedEpoch = this.epoch
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
    this.stateData.awaitingResponse = page.lastMessageRole === 'user'
    this.stateData.lastDecision = {
      at: Date.now(), type: 'wait', reason: '감독을 시작했습니다. 첫 상태 점검을 기다립니다.'
    }
    this.assistantKey = fingerprint(page)
    this.userCount = page.userCount
    this.stableChecks = 0
    this.updatePage(page)
    await this.persist()
    if (this.epoch !== armedEpoch || this.stateData.status !== 'watching') return this.state()
    this.timer = setInterval(() => { void this.check() }, this.stateData.config.checkIntervalSeconds * 1000)
    this.timer.unref?.()
    this.addLog('info', 'ChatGPT 대화 감독 시작. 자동 재개 간격: ' +
      this.stateData.config.intervalSeconds + '초. 상태 점검 간격: ' +
      this.stateData.config.checkIntervalSeconds + '초. 결제는 항상 중단하고 로그인·인증은 사용자가 처리합니다.')
    return this.state()
  }

  private stopTimer(): void {
    this.epoch++
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  private isArmed(epoch: number, id: number): boolean {
    return this.epoch === epoch && this.stateData.status === 'watching' &&
      this.maySendFromTab(id)
  }

  private async humanGate(reason: string): Promise<void> {
    this.stopTimer()
    this.stateData.status = 'needs-human'
    this.stateData.reason = reason
    this.stateData.lastDecision = { at: Date.now(), type: 'needs-human', reason }
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
    this.stateData.lastDecision = { at: Date.now(), type: 'wait', reason: '사용자가 일시정지했습니다.' }
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
    this.stateData.lastDecision = undefined
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

  /** Operator-requested decision pass. Respects the same idle time and send locks as periodic checks. */
  async checkNow(): Promise<ChatWatchSnapshot> {
    if (this.stateData.status !== 'watching') throw new Error('먼저 이 탭의 감독을 시작하세요.')
    await this.check()
    return this.state()
  }

  async check(): Promise<void> {
    if (this.busy || this.stateData.status !== 'watching') return
    this.busy = true
    const epoch = this.epoch
    try {
      const wc = this.activeGuest()
      const page = await this.inspectGuest(wc)
      if (this.epoch !== epoch || this.stateData.status !== 'watching') return
      this.updatePage(page)
      const key = fingerprint(page)
      const assistantChanged = key !== this.assistantKey
      const userChanged = page.userCount !== this.userCount
      if (assistantChanged || userChanged) {
        this.assistantKey = key
        this.userCount = page.userCount
        this.stateData.lastProgressAt = Date.now()
        this.stableChecks = 0
        // An unanswered manual message must never become a second prompt.
        if (page.lastMessageRole === 'user' || (userChanged && !assistantChanged)) {
          this.stateData.awaitingResponse = true
        } else if (assistantChanged) {
          this.stateData.awaitingResponse = false
        }
      } else this.stableChecks++

      const decision = decideChatWatch(page, {
        now: Date.now(),
        lastProgressAt: this.stateData.lastProgressAt ?? Date.now(),
        intervalSeconds: this.stateData.config.intervalSeconds,
        sentCount: this.stateData.sentCount,
        maxAutoMessages: this.stateData.config.maxAutoMessages,
        awaitingResponse: this.stateData.awaitingResponse,
        stableObservations: this.stableChecks,
        stopOn: this.stateData.config.stopOn
      })
      this.stateData.lastDecision = { at: Date.now(), type: decision.type, reason: decision.reason }
      if (decision.type === 'send' && !this.maySendFromTab(wc.id)) {
        this.stateData.lastDecision = {
          at: Date.now(), type: 'wait',
          reason: '자동 재개 조건 충족. 사용자가 보는 탭에 표시되면 재확인 후 전송합니다.'
        }
      }
      this.notify()
      if (decision.type === 'needs-human') {
        await this.humanGate(decision.reason)
        return
      }
      if (decision.type === 'complete') {
        this.stopTimer()
        this.stateData.status = 'completed'
        this.stateData.awaitingResponse = false
        this.stateData.reason = decision.reason
        this.addLog('info', decision.reason)
        await this.persist().catch(() => undefined)
        return
      }
      // Hidden tabs are read-only; Pause/Stop invalidates any stale check.
      if (decision.type === 'send' && this.isArmed(epoch, wc.id)) {
        await this.sendOnce(wc, page, epoch)
      }
    } catch (error) {
      if (this.epoch === epoch && this.stateData.status === 'watching') {
        const reason = error instanceof Error ? error.message : String(error)
        await this.humanGate('대화 상태 판독 실패: ' + reason.slice(0, 180))
      }
    } finally {
      this.busy = false
    }
  }

  private async sendOnce(
    wc: WebContents, expected: ChatWatchDomObservation, epoch: number
  ): Promise<void> {
    // Re-inspect the displayed tab, role, fingerprint, draft and generation
    // immediately before any irreversible action.
    if (!this.isArmed(epoch, wc.id)) return
    const fresh = await this.inspectGuest(this.activeGuest())
    if (!this.isArmed(epoch, wc.id) || fingerprint(fresh) !== fingerprint(expected) ||
        fresh.userCount !== expected.userCount || fresh.lastMessageRole !== 'assistant' ||
        fresh.generating || fresh.hasDraft || fresh.needsLogin || fresh.challenge ||
        !fresh.online || !fresh.composerReady) return

    const prompt = this.stateData.config.resumePrompt
    const prepared = await withDomTimeout(wc.executeJavaScript(chatWatchPrepareScript(prompt, expected.url), true)) as
      { prepared?: boolean; reason?: string } | null
    if (!this.isArmed(epoch, wc.id)) return
    if (!prepared?.prepared) {
      await this.humanGate('초안 준비 실패(' + String(prepared?.reason ?? 'unknown') + '). 직접 확인하세요.')
      return
    }
    const reviewed = await this.inspectGuest(this.activeGuest())
    // Pause/Stop wins over an in-flight read; never transition a stopped tab
    // back to needs-human when the operator has already stopped it.
    if (!this.isArmed(epoch, wc.id)) return
    if (!reviewed.hasDraft || reviewed.lastMessageRole !== 'assistant' ||
        reviewed.generating || reviewed.userCount !== expected.userCount ||
        fingerprint(reviewed) !== fingerprint(expected)) {
      await this.humanGate('전송 직전 대화 상태가 변경되었습니다. 작성된 초안을 확인하세요.')
      return
    }
    this.stateData.attemptCount++
    this.addLog('action', '재개 프롬프트 전송 시도 #' + this.stateData.attemptCount)
    await this.persist()
    if (!this.isArmed(epoch, wc.id)) return
    const outcome = await withDomTimeout(wc.executeJavaScript(chatWatchCommitScript(prompt, expected.url), true)) as
      { clicked?: boolean; reason?: string } | null
    if (!outcome?.clicked) {
      if (this.epoch === epoch && this.stateData.status === 'watching') {
        await this.humanGate('전송 실패(' + String(outcome?.reason ?? 'unknown') + '). 중복 시도하지 않습니다.')
      }
      return
    }
    // Do not restore automation that the operator paused or stopped while
    // the browser was processing the irreversible click.
    if (this.epoch === epoch && this.stateData.status === 'watching') {
      this.stateData.awaitingResponse = true
    }
    // Allow a small bounded DOM-render delay; all these reads are read-only.
    // A missing confirmation must NEVER cause another Send click.
    let confirmation: ChatWatchDomObservation | null = null
    for (let read = 0; read < 3; read++) {
      await new Promise((resolve) => setTimeout(resolve, 1200))
      confirmation = await this.inspectGuest(wc)
      if (!sameConversation(confirmation.url, expected.url)) {
        if (this.epoch === epoch && this.stateData.status === 'watching') {
          await this.humanGate('전송 중 ChatGPT 대화가 다른 주소로 이동했습니다.')
        }
        return
      }
      if (confirmation.userCount > expected.userCount) break
    }
    if (!confirmation || confirmation.userCount <= expected.userCount) {
      if (this.epoch === epoch && this.stateData.status === 'watching') {
        await this.humanGate('전송 버튼은 눌렀지만 새 메시지를 확인하지 못했습니다. 중복 전송 방지로 멈춥니다.')
      } else {
        this.addLog('warning', '일시정지 중 이전 전송의 도착 확인에 실패했습니다. 재개 전 직접 확인하세요.')
      }
      return
    }
    this.stateData.sentCount++
    this.stateData.lastSentAt = Date.now()
    this.stateData.lastProgressAt = Date.now()
    // A manual stop may have occurred after the click; record the result but
    // never revive supervision or set up another automatic send.
    const stillWatching = this.epoch === epoch && this.stateData.status === 'watching'
    this.stateData.awaitingResponse = stillWatching
    this.stateData.lastDecision = {
      at: Date.now(), type: 'wait',
      reason: stillWatching ? '자동 재개 메시지를 전송했습니다. 다음 답변을 기다립니다.' :
        '감독 중단 직전 실행된 전송이 확인됐습니다. 자동 감독은 다시 시작하지 않습니다.'
    }
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
