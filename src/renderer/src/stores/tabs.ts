import { create } from 'zustand'

// Tab and profile metadata only. Cookies/session contents remain owned by the
// Chromium partition, never copied to localStorage by Nightnova.
export interface ProxyConfig {
  enabled: boolean
  scheme: 'http' | 'https' | 'socks5'
  host: string
  port: number
  username?: string
  password?: string
}

export interface Tab {
  id: string
  url: string
  title: string
  webContentsId: number | null
  initialUrl: string
  proxy?: ProxyConfig
  partition?: string
  profileId?: string
}

interface TabsState {
  tabs: Tab[]
  activeId: string
  addTab: (
    url: string,
    opts?: {
      activate?: boolean
      proxy?: ProxyConfig
      partition?: string
      profileId?: string
    }
  ) => string
  closeTab: (id: string) => void
  reopenTab: () => void
  selectTab: (id: string) => void
  updateTab: (id: string, patch: Partial<Omit<Tab, 'id' | 'initialUrl'>>) => void
  setTabProxy: (id: string, proxy: ProxyConfig | undefined) => void
}

const INITIAL_URL = 'https://github.com/neoflowcore/NightNova'
const STORAGE_KEY = 'nightnova:tabs:v1'
const MAX_SAVED_TABS = 15
const MAX_CLOSED_TABS = 20

let nextId = 1
const newId = (): string => 't' + nextId++
const closedUrls: string[] = []

const safeRestoreUrl = (value: unknown): value is string =>
  typeof value === 'string' && value.length < 2048 &&
  /^(?:https?:\/\/|about:blank$)/i.test(value)

// Do not restore ephemeral partitions or proxy credentials. A restored tab
// creates a NEW Electron webContents with the same persistent profile data.
function restoredTab(data: unknown): Tab | null {
  if (!data || typeof data !== 'object') return null
  const raw = data as Record<string, unknown>
  if (!safeRestoreUrl(raw.url) || typeof raw.id !== 'string' || !/^t\d+$/.test(raw.id)) {
    return null
  }
  if (raw.partition && (typeof raw.partition !== 'string' ||
    !raw.partition.startsWith('persist:'))) return null
  return {
    id: raw.id,
    url: raw.url,
    initialUrl: raw.url,
    title: typeof raw.title === 'string' ? raw.title.slice(0, 150) : 'Restored Tab',
    webContentsId: null,
    partition: typeof raw.partition === 'string' ? raw.partition : undefined,
    profileId: typeof raw.profileId === 'string' ? raw.profileId.slice(0, 150) : undefined
  }
}

function loadSaved(): { tabs: Tab[]; activeId: string } | null {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (!raw || typeof raw !== 'object') return null
    const snapshot = raw as { tabs?: unknown; activeId?: unknown; closedUrls?: unknown }
    if (!Array.isArray(snapshot.tabs) || snapshot.tabs.length < 1) return null
    const seen = new Set<string>()
    const tabs = snapshot.tabs.slice(0, MAX_SAVED_TABS).map(restoredTab)
      .filter((t): t is Tab => {
        if (!t || seen.has(t.id)) return false
        seen.add(t.id)
        return true
      })
    if (!tabs.length) return null
    nextId = Math.max(...tabs.map((t) => Number(t.id.slice(1))), 0) + 1
    if (Array.isArray(snapshot.closedUrls)) {
      closedUrls.push(...snapshot.closedUrls.filter(safeRestoreUrl).slice(-MAX_CLOSED_TABS))
    }
    const activeId = typeof snapshot.activeId === 'string' &&
      tabs.some((t) => t.id === snapshot.activeId)
      ? snapshot.activeId : tabs[0].id
    return { tabs, activeId }
  } catch {
    return null
  }
}

function persistTabs(state: Pick<TabsState, 'tabs' | 'activeId'>): void {
  try {
    const tabs = state.tabs
      .filter((t) => !t.proxy && (!t.partition || t.partition.startsWith('persist:')) &&
        safeRestoreUrl(t.url))
      .slice(-MAX_SAVED_TABS)
      .map(({ id, url, title, partition, profileId }) => ({ id, url, title, partition, profileId }))
    if (!tabs.length) return
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      tabs, activeId: tabs.some((t) => t.id === state.activeId) ? state.activeId : tabs[0].id,
      closedUrls: closedUrls.slice(-MAX_CLOSED_TABS)
    }))
  } catch { /* Storage errors must not break tab navigation. */ }
}

const saved = loadSaved()
const firstId = saved?.activeId ?? newId()
const initialTabs = saved?.tabs ?? [{
  id: firstId, url: INITIAL_URL, title: 'Nightnova',
  webContentsId: null, initialUrl: INITIAL_URL
}]

export const useTabsStore = create<TabsState>((set, get) => ({
  tabs: initialTabs,
  activeId: firstId,

  addTab: (url, opts) => {
    const id = newId()
    const tab: Tab = {
      id, url, title: 'New Tab', webContentsId: null, initialUrl: url,
      proxy: opts?.proxy, partition: opts?.partition, profileId: opts?.profileId
    }
    set((s) => ({
      tabs: [...s.tabs, tab],
      activeId: opts?.activate === false ? s.activeId : id
    }))
    persistTabs(get())
    return id
  },

  closeTab: (id) => {
    const { tabs, activeId } = get()
    if (tabs.length <= 1) return
    const idx = tabs.findIndex((tab) => tab.id === id)
    if (idx < 0) return
    if (!tabs[idx].proxy && safeRestoreUrl(tabs[idx].url)) {
      closedUrls.push(tabs[idx].url)
      if (closedUrls.length > MAX_CLOSED_TABS) closedUrls.shift()
    }
    const next = tabs.filter((tab) => tab.id !== id)
    let nextActive = activeId
    if (activeId === id) {
      const neighbor = next[idx] ?? next[idx - 1] ?? next[0]
      nextActive = neighbor.id
    }
    set({ tabs: next, activeId: nextActive })
    persistTabs(get())
  },

  reopenTab: () => {
    const url = closedUrls.pop()
    if (url) get().addTab(url)
  },

  selectTab: (id) => {
    if (!get().tabs.some((tab) => tab.id === id)) return
    set({ activeId: id })
    persistTabs(get())
  },

  updateTab: (id, patch) => {
    set((s) => ({
      tabs: s.tabs.map((tab) => tab.id === id ? { ...tab, ...patch } : tab)
    }))
    persistTabs(get())
  },

  setTabProxy: (id, proxy) => {
    set((s) => ({
      tabs: s.tabs.map((tab) => tab.id === id ? { ...tab, proxy } : tab)
    }))
    persistTabs(get())
  }
}))
