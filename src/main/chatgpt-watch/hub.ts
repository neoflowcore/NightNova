import { app, webContents, type BrowserWindow, type WebContents } from 'electron'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  DEFAULT_CHAT_WATCH_ROTATION,
  type ChatWatchConfig, type ChatWatchDashboard, type ChatWatchRotation
} from '../../shared/chatgpt-watch'
import { ChatGptConversationWatch } from './service'
import { isChatGptConversation, sameConversation } from './policy'

const MAX_TABS = 8
interface WatchedTab {
  url: string
  watch: ChatGptConversationWatch
}

/**
 * One visible rotating view + independently supervised ChatGPT conversations.
 * Each slot has its OWN progress fingerprint, elapsed timer, prompt settings,
 * send lock, permission checkboxes, and restart-safe persisted config.
 */
export class ChatGptWatchHub {
  private readonly slots = new Map<number, WatchedTab>()
  private rotation: ChatWatchRotation = { ...DEFAULT_CHAT_WATCH_ROTATION }
  private visibleTabId: number | null = null
  private issues: string[] = []
  private initializePromise: Promise<void> | null = null
  private savePromise: Promise<void> = Promise.resolve()

  constructor(
    private readonly mainWindow: () => BrowserWindow | null,
    private readonly onUpdate: (dashboard: ChatWatchDashboard) => void
  ) {}

  state(): ChatWatchDashboard {
    return {
      version: 2,
      rotation: { ...this.rotation },
      sessions: [...this.slots].map(([webContentsId, slot]) => ({
        webContentsId, url: slot.url, snapshot: slot.watch.state()
      })),
      errors: [...this.issues]
    }
  }

  private notify(): void { this.onUpdate(this.state()) }

  async initialize(): Promise<void> {
    if (!this.initializePromise) {
      this.initializePromise = (async () => {
        try {
          const raw = await readFile(this.savePath(), 'utf8')
          if (raw.length > 8000) throw new Error('invalid settings size')
          const data = JSON.parse(raw) as { rotation?: Partial<ChatWatchRotation> }
          if (data.rotation) this.rotation = this.validateRotation(data.rotation)
        } catch {
          // No startup automation: the operator must explicitly arm projects.
          this.rotation = { ...DEFAULT_CHAT_WATCH_ROTATION }
        }
        this.notify()
      })()
    }
    return this.initializePromise
  }

  private savePath(): string {
    return path.join(app.getPath('userData'), 'nightnova', 'chatgpt-watch-hub-v2.json')
  }

  private validateRotation(patch: Partial<ChatWatchRotation>): ChatWatchRotation {
    return {
      enabled: typeof patch.enabled === 'boolean' ? patch.enabled : this.rotation.enabled,
      seconds: patch.seconds === 15 || patch.seconds === 30 || patch.seconds === 60
        ? patch.seconds : this.rotation.seconds
    }
  }

  private save(): Promise<void> {
    this.savePromise = this.savePromise.catch(() => undefined).then(async () => {
      const dest = this.savePath()
      await mkdir(path.dirname(dest), { recursive: true, mode: 0o700 })
      const tmp = dest + '.' + randomUUID() + '.tmp'
      await writeFile(tmp, JSON.stringify({ version: 2, rotation: this.rotation }), { mode: 0o600 })
      await rename(tmp, dest)
    })
    return this.savePromise
  }

  async configureRotation(patch: Partial<ChatWatchRotation>): Promise<ChatWatchDashboard> {
    this.rotation = this.validateRotation(patch ?? {})
    await this.save()
    this.notify()
    return this.state()
  }

  /** The browser renderer reports the actual tab whose work is on screen. */
  setVisibleTab(id: number | null): void {
    if (id !== null && (!Number.isSafeInteger(id) || id <= 0)) return
    this.visibleTabId = id
  }

  private guest(id: number): WebContents {
    const win = this.mainWindow()
    if (!win || win.isDestroyed() || !Number.isSafeInteger(id) || id <= 0) {
      throw new Error('유효한 NightNova 탭을 선택하세요.')
    }
    const wc = webContents.fromId(id)
    if (!wc || wc.isDestroyed() || wc.getType() !== 'webview' ||
        wc.hostWebContents?.id !== win.webContents.id) {
      throw new Error('NightNova 내부의 실제 브라우저 탭만 감독할 수 있습니다.')
    }
    return wc
  }

  private async slot(id: number): Promise<ChatGptConversationWatch> {
    const wc = this.guest(id)
    const url = wc.getURL()
    if (!isChatGptConversation(url)) throw new Error('기존 ChatGPT 대화 탭에서만 감독을 시작할 수 있습니다.')
    const old = this.slots.get(id)
    if (old) {
      if (sameConversation(old.url, url)) return old.watch
      if (old.watch.state().status === 'watching') {
        throw new Error('감독 중인 탭이 다른 대화로 이동했습니다. 먼저 그 탭의 감독을 중지하세요.')
      }
      old.watch.close()
      this.slots.delete(id)
    }
    if (this.slots.size >= MAX_TABS) throw new Error('동시에 감독할 수 있는 탭은 최대 8개입니다.')
    const key = createHash('sha256').update(new URL(url).origin + new URL(url).pathname).digest('hex').slice(0, 24)
    const watch = new ChatGptConversationWatch(
      this.mainWindow, () => this.notify(), 'conversation-' + key,
      (webContentsId) => this.visibleTabId === webContentsId
    )
    this.slots.set(id, { url, watch })
    await watch.initialize()
    this.notify()
    return watch
  }

  async configure(id: number, patch: Partial<ChatWatchConfig>): Promise<ChatWatchDashboard> {
    const watch = await this.slot(id)
    await watch.configure(patch)
    this.notify()
    return this.state()
  }

  async start(id: number): Promise<ChatWatchDashboard> {
    const watch = await this.slot(id)
    if (watch.state().status !== 'watching') await watch.start(id)
    this.issues = []
    this.notify()
    return this.state()
  }

  async startMany(ids: number[]): Promise<ChatWatchDashboard> {
    if (!Array.isArray(ids) || ids.length > MAX_TABS ||
        ids.some(id => !Number.isSafeInteger(id) || id <= 0)) {
      throw new Error('최대 8개의 유효한 ChatGPT 탭을 선택하세요.')
    }
    const errors: string[] = []
    for (const id of new Set(ids)) {
      try { await this.start(id) }
      catch (error) { errors.push('탭 ' + id + ': ' + String(error instanceof Error ? error.message : error)) }
    }
    this.issues = errors
    this.notify()
    return this.state()
  }

  async inspect(id: number): Promise<ChatWatchDashboard> {
    const watch = await this.slot(id)
    await watch.inspect(id)
    return this.state()
  }

  async pause(id: number): Promise<ChatWatchDashboard> {
    const watch = this.slots.get(id)?.watch
    if (watch) await watch.pause()
    this.notify()
    return this.state()
  }

  async stop(id: number): Promise<ChatWatchDashboard> {
    const watch = this.slots.get(id)?.watch
    if (watch) await watch.stop()
    this.notify()
    return this.state()
  }

  async pauseAll(): Promise<ChatWatchDashboard> {
    for (const watch of this.slots.values()) {
      if (watch.watch.state().status === 'watching') await watch.watch.pause()
    }
    this.notify()
    return this.state()
  }

  async stopAll(): Promise<ChatWatchDashboard> {
    for (const watch of this.slots.values()) await watch.watch.stop()
    this.notify()
    return this.state()
  }

  close(): void {
    for (const watch of this.slots.values()) watch.watch.close()
    this.visibleTabId = null
  }
}
